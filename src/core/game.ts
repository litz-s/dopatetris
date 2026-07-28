/**
 * ゲームのメインリデューサ。
 *
 *   step(state, deltaMs, commands) => { state, events }
 *
 * DOM / Audio / Math.random / Date.now に依存しない純関数。
 * 同じシード・同じコマンド列・同じ deltaMs 列なら必ず同じ結果になる。
 */
import {
  applyGravity,
  canPlace,
  collectEventsInRows,
  computeGravityMoves,
  createEmptyBoard,
  findFullRows,
  getDropY,
  isBoardEmpty,
  isFree,
  lockPiece,
  insertGarbage,
  removeBottomRows,
  removeRows,
} from './board';
import { attackRateFromComboRate, computeAttack, computeStackAttack } from './garbage';
import type { Command } from './commands';
import {
  BOARD_WIDTH,
  BOMB_CLEAR_SCORE_RATIO,
  COMBO_RATE_BASE,
  FEVER_MAX_MS,
  GARBAGE_DELAY_MS,
  GRAVITY_DELAY_MS,
  GRAVITY_TABLE_MS,
  HARD_DROP_POINT,
  HOLD_CAPACITY,
  LINES_PER_LEVEL,
  LINE_CLEAR_DELAY_MS,
  LOCK_DELAY_MS,
  MAX_DROP_CELLS_PER_STEP,
  MAX_LOCK_RESETS,
  SOFT_DROP_MIN_INTERVAL_MS,
  TIME_PRESSURE_INTERVAL_MS,
  NEXT_COUNT,
  SCORE_TABLE,
  SOFT_DROP_MULTIPLIER,
  SOFT_DROP_POINT,
  STACK_COOLDOWN_MS,
} from './config/balance';
import { EventSink } from './events';
import type { GameEvent } from './events';
import { getKicks, getShape, getSpawnPosition, rotateCcw, rotateCw } from './pieces';
import { createRng } from './rng';
import { computeClearBreakdown, isB2bEligible, resolveClearType } from './scoring';
import { accumulateEvents, createEmptyStack, resolveTrigger } from './stack';
import { drawNext, refillBag, spawnPiece } from './spawner';
import type {
  ActivePiece,
  Board,
  GameState,
  GameStats,
  PendingGarbage,
  QueuedMino,
  Rotation,
} from './types';

// ---------------------------------------------------------------- 初期化

export type GameOptions = {
  /** 時間経過でもレベルが上がる（対戦のサバイバル用） */
  timePressure?: boolean;
};

export function createGame(seed: number, options: GameOptions = {}): GameState {
  const initial = refillBag(createRng(seed));

  let rng = initial.rng;
  let bag = initial.bag;
  const next: QueuedMino[] = [];

  for (let i = 0; i < NEXT_COUNT; i++) {
    const drawn = drawNext(rng, bag);
    rng = drawn.rng;
    bag = drawn.bag;
    next.push({ type: drawn.type, hasEvent: drawn.hasEvent });
  }

  const base: GameState = {
    board: createEmptyBoard(),
    active: null,
    hold: null,
    holdUsed: 0,
    next,
    stack: createEmptyStack(),
    fever: {
      until: 0,
      cloverUntil: 0,
      comboRate: COMBO_RATE_BASE,
      comboRateStep: 0,
    },
    slow: { until: 0, rate: 0 },
    score: 0,
    level: 1,
    lines: 0,
    combo: 0,
    b2b: false,
    elapsedMs: 0,
    dropTimerMs: 0,
    lockTimerMs: null,
    lockResets: 0,
    clearing: null,
    gravity: null,
    softDropping: false,
    lastMoveWasRotation: false,
    lastRotationKicked: false,
    timePressure: options.timePressure === true,
    pendingGarbage: [],
    rng,
    bag,
    stats: createStats(),
    status: 'playing',
  };

  const sink = new EventSink();
  return spawnFromQueue(base, sink);
}

function createStats(): GameStats {
  return {
    maxCombo: 0,
    feverTotalMs: 0,
    eventUsed: { bomb: 0, heart: 0, coin: 0, clover: 0 },
    breakdown: { lines: 0, combo: 0, fever: 0, event: 0 },
  };
}

/** 内訳の1項目に加算した新しい stats を返す */
function addBreakdown(
  stats: GameStats,
  key: keyof GameStats['breakdown'],
  amount: number,
): GameStats {
  if (amount === 0) return stats;
  return {
    ...stats,
    breakdown: { ...stats.breakdown, [key]: stats.breakdown[key] + amount },
  };
}

// ---------------------------------------------------------------- 補助

/**
 * 実効レベル。
 * サバイバルでは経過時間だけでも上がり、ライン数によるレベルとの高い方を採る。
 */
export function getEffectiveLevel(state: GameState): number {
  if (!state.timePressure) return state.level;
  const timeLevel = Math.floor(state.elapsedMs / TIME_PRESSURE_INTERVAL_MS) + 1;
  return Math.max(state.level, timeLevel);
}

/** 現在の落下間隔（ミリ秒）。コイン効果とソフトドロップを反映する */
function getDropIntervalMs(state: GameState): number {
  const index = Math.min(getEffectiveLevel(state) - 1, GRAVITY_TABLE_MS.length - 1);
  const base = GRAVITY_TABLE_MS[Math.max(0, index)] ?? 1000;

  const slowed = isSlowActive(state) ? base / (1 - state.slow.rate) : base;
  if (!state.softDropping) return slowed;

  // 自然落下より遅くはならず、下限より速くもならないようにする
  return Math.min(slowed, Math.max(SOFT_DROP_MIN_INTERVAL_MS, slowed / SOFT_DROP_MULTIPLIER));
}

function isFeverActive(state: GameState): boolean {
  return state.fever.until > state.elapsedMs;
}

function isCloverFeverActive(state: GameState): boolean {
  return state.fever.cloverUntil > state.elapsedMs;
}

function isSlowActive(state: GameState): boolean {
  return state.slow.until > state.elapsedMs;
}

/** ミノのバウンディングボックス内での x オフセット範囲 */
function getHorizontalBounds(piece: ActivePiece): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const [dx] of getShape(piece.type, piece.rot)) {
    if (dx < min) min = dx;
    if (dx > max) max = dx;
  }
  return { min, max };
}

/** キューから次のミノを補充しつつ、盤面上部に出現させる */
function spawnFromQueue(state: GameState, sink: EventSink): GameState {
  const head = state.next[0];
  if (head === undefined) return state;

  const drawn = drawNext(state.rng, state.bag);
  const spawned = spawnPiece(drawn.rng, head.type, head.hasEvent);

  const next = [...state.next.slice(1), { type: drawn.type, hasEvent: drawn.hasEvent }];

  const placeable = canPlace(
    state.board,
    spawned.piece.type,
    spawned.piece.rot,
    spawned.piece.x,
    spawned.piece.y,
  );

  sink.emit({ kind: 'pieceSpawned', type: head.type, hasEvent: head.hasEvent });

  if (!placeable) {
    sink.emit({ kind: 'gameOver', score: state.score });
    return { ...state, rng: spawned.rng, bag: drawn.bag, next, active: null, status: 'over' };
  }

  return {
    ...state,
    rng: spawned.rng,
    bag: drawn.bag,
    next,
    active: spawned.piece,
    holdUsed: 0,
    dropTimerMs: 0,
    lockTimerMs: null,
    lockResets: 0,
    lastMoveWasRotation: false,
    lastRotationKicked: false,
  };
}

/** 接地しているか */
function isGrounded(board: Board, piece: ActivePiece): boolean {
  return !canPlace(board, piece.type, piece.rot, piece.x, piece.y + 1);
}

/** ロックディレイのタイマーを状況に応じて更新する */
function refreshLockState(state: GameState): GameState {
  if (state.active === null) return state;

  if (!isGrounded(state.board, state.active)) {
    return state.lockTimerMs === null ? state : { ...state, lockTimerMs: null };
  }

  if (state.lockTimerMs === null) {
    return { ...state, lockTimerMs: LOCK_DELAY_MS };
  }
  return state;
}

/** 移動・回転が成功したときにロックディレイをリセットする */
function resetLockDelay(state: GameState): GameState {
  if (state.lockTimerMs === null) return state;
  if (state.lockResets >= MAX_LOCK_RESETS) return state;
  return { ...state, lockTimerMs: LOCK_DELAY_MS, lockResets: state.lockResets + 1 };
}

// ---------------------------------------------------------------- T-Spin 判定

/**
 * T-Spin を判定する。
 * T ミノで、直前の操作が回転で、中心まわり4隅のうち3つ以上が塞がっていれば成立。
 * 前方2隅が塞がっていれば full、そうでなければ mini。
 */
function detectTSpin(state: GameState, piece: ActivePiece): 'none' | 'mini' | 'full' {
  if (piece.type !== 'T' || !state.lastMoveWasRotation) return 'none';

  // T ミノの3x3ボックス中心
  const cx = piece.x + 1;
  const cy = piece.y + 1;

  const corners: Record<Rotation, { front: [number, number][]; back: [number, number][] }> = {
    0: {
      front: [
        [cx - 1, cy - 1],
        [cx + 1, cy - 1],
      ],
      back: [
        [cx - 1, cy + 1],
        [cx + 1, cy + 1],
      ],
    },
    1: {
      front: [
        [cx + 1, cy - 1],
        [cx + 1, cy + 1],
      ],
      back: [
        [cx - 1, cy - 1],
        [cx - 1, cy + 1],
      ],
    },
    2: {
      front: [
        [cx - 1, cy + 1],
        [cx + 1, cy + 1],
      ],
      back: [
        [cx - 1, cy - 1],
        [cx + 1, cy - 1],
      ],
    },
    3: {
      front: [
        [cx - 1, cy - 1],
        [cx - 1, cy + 1],
      ],
      back: [
        [cx + 1, cy - 1],
        [cx + 1, cy + 1],
      ],
    },
  };

  const set = corners[piece.rot];
  const blocked = (p: [number, number]): boolean => !isFree(state.board, p[0], p[1]);

  const frontBlocked = set.front.filter(blocked).length;
  const backBlocked = set.back.filter(blocked).length;

  if (frontBlocked + backBlocked < 3) return 'none';
  if (frontBlocked === 2) return 'full';
  // キックで無理やり入れた場合は full 扱いにする（SRS の慣例）
  return state.lastRotationKicked ? 'full' : 'mini';
}

// ---------------------------------------------------------------- ライン消去

/**
 * 揃った行を消し、スコア・コンボ・イベントスタックを更新する。
 * 重力による連鎖でも再利用する。
 */
function resolveClears(
  state: GameState,
  sink: EventSink,
  tspin: 'none' | 'mini' | 'full',
): GameState {
  const rows = findFullRows(state.board);
  if (rows.length === 0) {
    // 消去なし。フィーバー中でなければコンボが途切れる
    if (state.combo > 0 && !isFeverActive(state)) {
      sink.emit({ kind: 'comboBroken', finalCombo: state.combo });
      return { ...state, combo: 0 };
    }
    return state;
  }

  // 消去前にイベントタイルを左→右の順で収集する
  const eventKinds = collectEventsInRows(state.board, rows);
  const accumulated = accumulateEvents(state.stack, eventKinds, state.level);
  for (const event of accumulated.events) sink.emit(event);

  const clearType = resolveClearType(rows.length, tspin);
  const combo = state.combo;
  const feverActive = isFeverActive(state);
  const cloverFeverActive = isCloverFeverActive(state);

  // 異種イベントのボーナスはイベント枠へ入れる
  let stats = addBreakdown(state.stats, 'event', accumulated.bonus);
  let score = accumulated.bonus;

  if (clearType !== null) {
    const breakdown = computeClearBreakdown({
      clearType,
      level: state.level,
      combo,
      feverActive,
      feverComboRate: state.fever.comboRate,
      b2b: state.b2b,
    });
    score += breakdown.total;
    stats = addBreakdown(stats, 'lines', breakdown.lines);
    stats = addBreakdown(stats, 'combo', breakdown.combo);
    stats = addBreakdown(stats, 'fever', breakdown.fever);
  }

  const lines = state.lines + rows.length;
  const level = Math.floor(lines / LINES_PER_LEVEL) + 1;

  if (level > state.level) sink.emit({ kind: 'levelUp', level });

  if (clearType !== null) {
    sink.emit({
      kind: 'linesCleared',
      rows,
      clearType,
      combo: combo + 1,
      b2b: state.b2b && isB2bEligible(clearType),
      score,
    });
  }

  const nextCombo = combo + 1;

  let next: GameState = {
    ...state,
    clearing: { rows, elapsedMs: 0 },
    stack: accumulated.stack,
    score: state.score + score,
    lines,
    level,
    combo: nextCombo,
    b2b: clearType !== null ? isB2bEligible(clearType) : state.b2b,
    fever: cloverFeverActive
      ? {
          ...state.fever,
          comboRate: state.fever.comboRate + state.fever.comboRateStep,
        }
      : state.fever,
    stats: { ...stats, maxCombo: Math.max(stats.maxCombo, nextCombo) },
  };

  // 対戦: 攻撃力を出し、受信中のおじゃまと相殺してから残りを送る。
  // 消去後の盤面が空になるかは、この時点で先読みして判定する。
  if (clearType !== null) {
    const attack = computeAttack({
      clearType,
      combo: nextCombo,
      b2b: state.b2b && isB2bEligible(clearType),
      perfectClear: isBoardEmpty(removeRows(state.board, rows)),
      feverActive,
      feverAttackRate: cloverFeverActive
        ? attackRateFromComboRate(COMBO_RATE_BASE + state.fever.comboRateStep)
        : 1,
    });
    next = applyOffset(next, attack, sink).state;
  }

  // 盤面はまだ消さない。演出（左→右のポップ＋段落下）が終わってから finishClearing で消す。
  return next;
}

/**
 * 相手から届いたおじゃまを待機列へ積む。
 * すぐには盤面へ入れず、猶予のあいだに消して相殺する余地を残す。
 */
export function receiveGarbage(state: GameState, lines: number, holeColumn: number): GameState {
  if (lines <= 0) return state;
  return {
    ...state,
    pendingGarbage: [
      ...state.pendingGarbage,
      { lines, readyAt: state.elapsedMs + GARBAGE_DELAY_MS, holeColumn },
    ],
  };
}

/** 待機列に溜まっている総行数 */
export function getPendingGarbage(state: GameState): number {
  let total = 0;
  for (const entry of state.pendingGarbage) total += entry.lines;
  return total;
}

/** 待機中のおじゃまを古いものから指定行数だけ打ち消す。 */
function cancelPendingGarbage(
  state: GameState,
  amount: number,
  sink: EventSink,
): { state: GameState; remaining: number } {
  if (amount <= 0) return { state, remaining: 0 };

  let remaining = amount;
  let cancelled = 0;
  const queue: PendingGarbage[] = [];

  for (const entry of state.pendingGarbage) {
    if (remaining <= 0) {
      queue.push(entry);
      continue;
    }
    const take = Math.min(entry.lines, remaining);
    remaining -= take;
    cancelled += take;
    if (entry.lines > take) queue.push({ ...entry, lines: entry.lines - take });
  }

  if (cancelled > 0) sink.emit({ kind: 'garbageOffset', lines: cancelled });

  return { state: { ...state, pendingGarbage: queue }, remaining };
}

function applyOffset(
  state: GameState,
  attack: number,
  sink: EventSink,
): { state: GameState; sent: number } {
  const cancelled = cancelPendingGarbage(state, attack, sink);
  if (cancelled.remaining > 0) {
    sink.emit({ kind: 'garbageSent', lines: cancelled.remaining });
  }
  return { state: cancelled.state, sent: cancelled.remaining };
}

/**
 * 猶予を過ぎた待機おじゃまを盤面へ挿入する。
 * ミノを置いた直後にだけ呼ぶ。落下中に盤面が動くと理不尽になるため。
 */
function applyPendingGarbage(state: GameState, sink: EventSink): GameState {
  if (state.pendingGarbage.length === 0) return state;

  const ready = state.pendingGarbage.filter((entry) => entry.readyAt <= state.elapsedMs);
  if (ready.length === 0) return state;

  let board = state.board;
  for (const entry of ready) {
    board = insertGarbage(board, entry.lines, entry.holeColumn);
    sink.emit({ kind: 'garbageApplied', lines: entry.lines, holeColumn: entry.holeColumn });
  }

  return {
    ...state,
    board,
    pendingGarbage: state.pendingGarbage.filter((entry) => entry.readyAt > state.elapsedMs),
  };
}

/** 重力の落下演出の終了処理。実際に盤面を落とし、連鎖したライン消去へ繋ぐ */
function finishGravity(state: GameState, sink: EventSink): GameState {
  const gravity = applyGravity(state.board);
  const settled: GameState = { ...state, board: gravity.board, gravity: null };

  // 落ちた結果そろった行は連鎖として処理する
  return resolveClears(settled, sink, 'none');
}

/** ライン消去演出の終了処理。実際に行を消し、必要なら次のミノを出す */
function finishClearing(state: GameState, sink: EventSink): GameState {
  const clearing = state.clearing;
  if (clearing === null) return state;

  const board = removeRows(state.board, clearing.rows);
  if (isBoardEmpty(board)) sink.emit({ kind: 'perfectClear' });

  // 消し終わってから、猶予を過ぎたおじゃまを盤面へ入れる
  const cleared = applyPendingGarbage({ ...state, board, clearing: null }, sink);

  // 重力発動中など、ミノが残っている場合はそのまま続行する
  return cleared.active === null ? spawnFromQueue(cleared, sink) : cleared;
}

/** ミノを固定し、消去処理と次のミノの出現までを行う */
function lockAndAdvance(state: GameState, sink: EventSink, hard = false): GameState {
  const piece = state.active;
  if (piece === null) return state;

  const tspin = detectTSpin(state, piece);
  const board = lockPiece(state.board, piece);
  sink.emit({
    kind: 'pieceLocked',
    x: piece.x,
    y: piece.y,
    type: piece.type,
    rot: piece.rot,
    hard,
  });

  const locked: GameState = { ...state, board, active: null };
  const cleared = resolveClears(locked, sink, tspin);

  // 消去演出が始まった場合、次のミノは演出終了後に出す
  if (cleared.clearing !== null) return cleared;

  // 消去がなかったので、猶予を過ぎたおじゃまがここで盤面に入る
  return spawnFromQueue(applyPendingGarbage(cleared, sink), sink);
}

// ---------------------------------------------------------------- イベントスタック発動

function triggerStack(state: GameState, sink: EventSink): GameState {
  const { kind, count } = state.stack;

  if (kind === null || count === 0) {
    sink.emit({ kind: 'stackMisfire', reason: 'empty' });
    return state;
  }
  if (state.stack.cooldownUntil > state.elapsedMs) {
    sink.emit({ kind: 'stackMisfire', reason: 'cooldown' });
    return state;
  }

  const outcome = resolveTrigger(kind, count);
  if (outcome === null) {
    // クローバー1 など。スタックは消費しない
    sink.emit({ kind: 'stackMisfire', reason: 'noEffect' });
    return state;
  }

  sink.emit({ kind: 'stackTriggered', event: kind, count });

  let next: GameState = {
    ...state,
    stack: { kind: null, count: 0, cooldownUntil: state.elapsedMs + STACK_COOLDOWN_MS },
    stats: {
      ...state.stats,
      eventUsed: { ...state.stats.eventUsed, [kind]: state.stats.eventUsed[kind] + 1 },
    },
  };

  // 爆弾: 最下層から指定行数を削除
  if (outcome.clearRows > 0) {
    const removed = removeBottomRows(next.board, outcome.clearRows);
    const bonus = Math.round(
      SCORE_TABLE.single * BOMB_CLEAR_SCORE_RATIO * outcome.clearRows * Math.max(1, next.level),
    );
    next = {
      ...next,
      board: removed.board,
      score: next.score + bonus,
      stats: addBreakdown(next.stats, 'event', bonus),
    };
    sink.emit({ kind: 'bombCleared', rows: removed.rows });

    // 対戦: 爆弾は消し飛ばした行数だけ相手へ送る（最大の攻撃手段）
    const attack = computeStackAttack(kind, count);
    if (attack > 0) next = applyOffset(next, attack, sink).state;
  }

  // ハート: 到着待ちのおじゃまを古いものから指定行数だけ取り除く
  if (outcome.garbageReduction > 0) {
    next = cancelPendingGarbage(next, outcome.garbageReduction, sink).state;
  }

  // ハート3: 重力。盤面はまだ動かさず、落下演出の終了時にまとめて適用する
  if (outcome.gravity) {
    const moves = computeGravityMoves(next.board);
    if (moves.length > 0) {
      next = { ...next, gravity: { moves, elapsedMs: 0 } };
      sink.emit({ kind: 'gravityApplied' });
    }
  }

  // コイン: 落下速度低下
  if (outcome.slow !== null) {
    next = {
      ...next,
      slow: { until: next.elapsedMs + outcome.slow.durationMs, rate: outcome.slow.rate },
    };
    sink.emit({
      kind: 'slowStarted',
      rate: outcome.slow.rate,
      durationMs: outcome.slow.durationMs,
    });
  }

  // フィーバー: 残り時間へ加算（上限あり）
  if (outcome.feverMs > 0) {
    const remaining = Math.max(0, next.fever.until - next.elapsedMs);
    const duration = Math.min(remaining + outcome.feverMs, FEVER_MAX_MS);
    const cloverActive = isCloverFeverActive(next);
    const cloverTriggered = outcome.comboRateStep > 0;
    const comboRate = cloverTriggered
      ? COMBO_RATE_BASE
      : cloverActive
        ? next.fever.comboRate
        : COMBO_RATE_BASE;
    const comboRateStep = cloverTriggered
      ? outcome.comboRateStep
      : cloverActive
        ? next.fever.comboRateStep
        : 0;
    const cloverUntil = cloverTriggered
      ? next.elapsedMs + outcome.feverMs
      : cloverActive
        ? next.fever.cloverUntil
        : 0;
    next = {
      ...next,
      fever: {
        until: next.elapsedMs + duration,
        cloverUntil,
        comboRate,
        comboRateStep,
      },
    };
    sink.emit({ kind: 'feverStarted', durationMs: duration, comboRate });
  }

  return next;
}

// ---------------------------------------------------------------- コマンド処理

function applyCommand(state: GameState, command: Command, sink: EventSink): GameState {
  if (state.status !== 'playing') return state;

  switch (command.kind) {
    case 'move': {
      const piece = state.active;
      if (piece === null) return state;
      const x = piece.x + command.dx;
      if (!canPlace(state.board, piece.type, piece.rot, x, piece.y)) return state;
      sink.emit({ kind: 'pieceMoved' });
      return resetLockDelay({
        ...state,
        active: { ...piece, x },
        lastMoveWasRotation: false,
      });
    }

    case 'moveTo': {
      const piece = state.active;
      if (piece === null) return state;

      const bounds = getHorizontalBounds(piece);
      const width = bounds.max - bounds.min + 1;
      // カーソル列がミノの中心に来るように左上座標を求める
      const desired = command.column - bounds.min - Math.floor((width - 1) / 2);
      const clamped = Math.max(-bounds.min, Math.min(desired, BOARD_WIDTH - 1 - bounds.max));

      if (clamped === piece.x) return state;

      // 壁や積みブロックをすり抜けないよう1マスずつ進める
      const dir = clamped > piece.x ? 1 : -1;
      let x = piece.x;
      while (x !== clamped && canPlace(state.board, piece.type, piece.rot, x + dir, piece.y)) {
        x += dir;
      }
      if (x === piece.x) return state;

      sink.emit({ kind: 'pieceMoved' });
      return resetLockDelay({
        ...state,
        active: { ...piece, x },
        lastMoveWasRotation: false,
      });
    }

    case 'rotate': {
      const piece = state.active;
      if (piece === null) return state;

      const to = command.dir === 'cw' ? rotateCw(piece.rot) : rotateCcw(piece.rot);
      const kicks = getKicks(piece.type, piece.rot, to);

      for (let i = 0; i < kicks.length; i++) {
        const kick = kicks[i];
        if (kick === undefined) continue;
        const x = piece.x + kick[0];
        const y = piece.y + kick[1];
        if (!canPlace(state.board, piece.type, to, x, y)) continue;

        sink.emit({ kind: 'pieceRotated', kicked: i > 0 });
        return resetLockDelay({
          ...state,
          active: { ...piece, rot: to, x, y },
          lastMoveWasRotation: true,
          lastRotationKicked: i > 0,
        });
      }
      return state;
    }

    case 'softDrop': {
      if (command.active === state.softDropping) return state;
      // 落下間隔が急変するため、溜まっていたタイマーは捨てる。
      // そうしないと「遅い間隔で溜めた時間」を「速い間隔」で消化して一気に落ちてしまう。
      return { ...state, softDropping: command.active, dropTimerMs: 0 };
    }

    case 'hardDrop': {
      const piece = state.active;
      if (piece === null) return state;

      const y = getDropY(state.board, piece);
      const distance = y - piece.y;
      sink.emit({
        kind: 'hardDropped',
        distance,
        column: piece.x,
        type: piece.type,
        rot: piece.rot,
        x: piece.x,
        fromY: piece.y,
        toY: y,
      });

      const points = distance * HARD_DROP_POINT;
      const dropped: GameState = {
        ...state,
        active: { ...piece, y },
        score: state.score + points,
        stats: addBreakdown(state.stats, 'lines', points),
        // ハードドロップ後の回転は無いので T-Spin 判定は維持する
      };
      return lockAndAdvance(dropped, sink, true);
    }

    case 'hold': {
      const piece = state.active;
      if (piece === null) return state;
      if (state.holdUsed >= HOLD_CAPACITY) return state;

      sink.emit({ kind: 'holdUsed', type: piece.type });

      const heldPiece = {
        type: piece.type,
        eventCellIndex: piece.eventCellIndex,
        eventKind: piece.eventKind,
      };

      if (state.hold === null) {
        // ホールドが空: 現在のミノを預けて次を出す
        const withHold: GameState = {
          ...state,
          hold: heldPiece,
          active: null,
          holdUsed: state.holdUsed + 1,
        };
        const spawned = spawnFromQueue(withHold, sink);
        // spawnFromQueue は holdUsed をリセットするため復元する
        return { ...spawned, holdUsed: withHold.holdUsed };
      }

      // ホールドと入れ替える。イベントタイルはミノに付着したまま持ち越す
      const spawn = getSpawnPosition(state.hold.type);
      const swapped: ActivePiece = {
        type: state.hold.type,
        rot: 0,
        x: spawn.x,
        y: spawn.y,
        eventCellIndex: state.hold.eventCellIndex,
        eventKind: state.hold.eventKind,
      };

      if (!canPlace(state.board, swapped.type, swapped.rot, swapped.x, swapped.y)) {
        sink.emit({ kind: 'gameOver', score: state.score });
        return { ...state, status: 'over', active: null };
      }

      return {
        ...state,
        hold: heldPiece,
        active: swapped,
        holdUsed: state.holdUsed + 1,
        lockTimerMs: null,
        lockResets: 0,
        lastMoveWasRotation: false,
      };
    }

    case 'triggerStack':
      return triggerStack(state, sink);

    case 'discardStack': {
      if (state.stack.kind === null || state.stack.count === 0) return state;
      sink.emit({
        kind: 'stackDiscarded',
        event: state.stack.kind,
        count: state.stack.count,
      });
      return { ...state, stack: { ...state.stack, kind: null, count: 0 } };
    }
  }
}

// ---------------------------------------------------------------- メインループ

/**
 * 1ステップ進める。deltaMs は固定タイムステップで呼び出すこと。
 * 現在時刻を内部で取得しないため、リプレイやネットワーク同期に転用できる。
 */
export function step(
  state: GameState,
  deltaMs: number,
  commands: readonly Command[] = [],
): { state: GameState; events: GameEvent[] } {
  const sink = new EventSink();

  if (state.status !== 'playing') {
    return { state, events: sink.drain() };
  }

  const feverWasActive = isFeverActive(state);
  const slowWasActive = isSlowActive(state);

  let next: GameState = { ...state, elapsedMs: state.elapsedMs + deltaMs };

  // クローバー由来の10秒が終わったら、フィーバー自体が続いていても係数だけ通常へ戻す
  if (!isCloverFeverActive(next) && next.fever.comboRateStep > 0) {
    next = {
      ...next,
      fever: {
        ...next.fever,
        cloverUntil: 0,
        comboRate: COMBO_RATE_BASE,
        comboRateStep: 0,
      },
    };
  }

  // フィーバーだった時間を積む（リザルトの「FEVER 合計」用）
  if (feverWasActive) {
    next = {
      ...next,
      stats: { ...next.stats, feverTotalMs: next.stats.feverTotalMs + deltaMs },
    };
  }

  // 時限効果の終了通知
  if (feverWasActive && !isFeverActive(next)) sink.emit({ kind: 'feverEnded' });
  if (slowWasActive && !isSlowActive(next)) sink.emit({ kind: 'slowEnded' });

  // 重力の落下演出中は入力も落下も受け付けない
  if (next.gravity !== null) {
    const elapsedMs = next.gravity.elapsedMs + deltaMs;
    next = { ...next, gravity: { moves: next.gravity.moves, elapsedMs } };
    if (elapsedMs >= GRAVITY_DELAY_MS) next = finishGravity(next, sink);
    return { state: next, events: sink.drain() };
  }

  // ライン消去演出中は入力も落下も受け付けない
  if (next.clearing !== null) {
    const elapsedMs = next.clearing.elapsedMs + deltaMs;
    next = { ...next, clearing: { rows: next.clearing.rows, elapsedMs } };
    if (elapsedMs >= LINE_CLEAR_DELAY_MS) next = finishClearing(next, sink);
    return { state: next, events: sink.drain() };
  }

  for (const command of commands) {
    next = applyCommand(next, command, sink);
    if (next.status !== 'playing') return { state: next, events: sink.drain() };
  }

  if (next.active === null) return { state: next, events: sink.drain() };

  // 自然落下
  const interval = getDropIntervalMs(next);
  let dropTimer = next.dropTimerMs + deltaMs;
  let cellsDropped = 0;

  while (dropTimer >= interval && next.active !== null) {
    // 落下間隔が急に短くなっても一気に落ちないようにする安全弁
    if (cellsDropped >= MAX_DROP_CELLS_PER_STEP) {
      dropTimer = interval;
      break;
    }
    dropTimer -= interval;
    cellsDropped += 1;
    const piece = next.active;

    if (canPlace(next.board, piece.type, piece.rot, piece.x, piece.y + 1)) {
      next = {
        ...next,
        active: { ...piece, y: piece.y + 1 },
        lastMoveWasRotation: false,
      };
      if (next.softDropping) {
        next = {
          ...next,
          score: next.score + SOFT_DROP_POINT,
          stats: addBreakdown(next.stats, 'lines', SOFT_DROP_POINT),
        };
        sink.emit({ kind: 'softDropped' });
      }
    } else {
      break;
    }
  }

  next = { ...next, dropTimerMs: dropTimer };
  next = refreshLockState(next);

  // ロックディレイの消化
  if (next.lockTimerMs !== null) {
    const remaining = next.lockTimerMs - deltaMs;
    if (remaining <= 0) {
      next = lockAndAdvance({ ...next, lockTimerMs: 0 }, sink);
    } else {
      next = { ...next, lockTimerMs: remaining };
    }
  }

  return { state: next, events: sink.drain() };
}

/** ゴースト（落下予定位置）の y 座標。null なら表示しない */
export function getGhostY(state: GameState): number | null {
  if (state.active === null) return null;
  return getDropY(state.board, state.active);
}

/** 現在フィーバー中か（UI表示用） */
export function isFever(state: GameState): boolean {
  return state.fever.until > state.elapsedMs;
}

/** フィーバー残り時間（ミリ秒） */
export function getFeverRemaining(state: GameState): number {
  return Math.max(0, state.fever.until - state.elapsedMs);
}

/** スタック発動のクールタイム残り（ミリ秒） */
export function getStackCooldownRemaining(state: GameState): number {
  return Math.max(0, state.stack.cooldownUntil - state.elapsedMs);
}
