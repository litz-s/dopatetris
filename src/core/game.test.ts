import { describe, expect, it } from 'vitest';
import {
  createGame,
  getEffectiveLevel,
  getGhostY,
  getPendingGarbage,
  isFever,
  receiveGarbage,
  step,
} from './game';
import { cellAt } from './board';
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  COMBO_RATE_BASE,
  FEVER_MAX_MS,
  FIXED_TIMESTEP_MS,
  GARBAGE_DELAY_MS,
  GRAVITY_DELAY_MS,
  LINE_CLEAR_DELAY_MS,
  MAX_DROP_CELLS_PER_STEP,
  NEXT_COUNT,
  STACK_COOLDOWN_MS,
  TETRIS_CLEAR_DELAY_MS,
  TIME_PRESSURE_INTERVAL_MS,
  getClearDelayMs,
} from './config/balance';
import type { MinoType, Rotation } from './types';

/** 落下中のミノを差し替える */
function withPieceAt(
  state: GameState,
  type: MinoType,
  x: number,
  y: number,
  rot: Rotation = 0,
): GameState {
  return {
    ...state,
    active: { type, rot, x, y, eventCellIndex: null, eventKind: null },
    lastMoveWasRotation: false,
  };
}

/** 最下段の左端だけを空け、縦IでSingleを作れる状態にする */
function withSingleLineClear(state: GameState): GameState {
  const board = state.board.map((row) => row.slice());
  const bottom = board[BOARD_HEIGHT - 1];
  if (bottom !== undefined) {
    for (let x = 0; x < BOARD_WIDTH; x++) {
      bottom[x] = x === 0 ? null : { color: 'J', event: null };
    }
  }
  return withPieceAt({ ...state, board }, 'I', -2, BOARD_HEIGHT - 4, 1);
}
import type { Command } from './commands';
import type { GameState } from './types';

const SEED = 20260727;

/** 指定ミリ秒ぶんステップを進める */
function advance(state: GameState, ms: number, commands: readonly Command[] = []): GameState {
  let current = state;
  let remaining = ms;
  let first = true;
  while (remaining > 0) {
    const dt = Math.min(FIXED_TIMESTEP_MS, remaining);
    current = step(current, dt, first ? commands : []).state;
    remaining -= dt;
    first = false;
  }
  return current;
}

describe('初期化', () => {
  it('ミノが出現し、Next が規定数そろっている', () => {
    const game = createGame(SEED);
    expect(game.active).not.toBeNull();
    expect(game.next).toHaveLength(NEXT_COUNT);
    expect(game.status).toBe('playing');
  });

  it('同じシードなら完全に同じ初期状態になる', () => {
    expect(createGame(SEED)).toEqual(createGame(SEED));
  });

  it('異なるシードでは異なるミノ順になる', () => {
    const a = createGame(SEED)
      .next.map((n) => n.type)
      .join('');
    const b = createGame(SEED + 1)
      .next.map((n) => n.type)
      .join('');
    expect(a).not.toBe(b);
  });
});

describe('決定論性', () => {
  it('同じコマンド列を与えれば同じ結果になる', () => {
    const commands: Command[] = [
      { kind: 'rotate', dir: 'cw' },
      { kind: 'move', dx: -1 },
      { kind: 'hardDrop' },
    ];

    const runA = advance(createGame(SEED), 2000, commands);
    const runB = advance(createGame(SEED), 2000, commands);

    expect(runA.score).toBe(runB.score);
    expect(runA.board).toEqual(runB.board);
    expect(runA.rng).toEqual(runB.rng);
  });
});

describe('操作', () => {
  it('ハードドロップでミノが着地し、次のミノが出る', () => {
    const game = createGame(SEED);
    const before = game.active?.type;

    const result = step(game, FIXED_TIMESTEP_MS, [{ kind: 'hardDrop' }]);

    expect(result.events.some((e) => e.kind === 'hardDropped')).toBe(true);
    expect(result.events.some((e) => e.kind === 'pieceLocked')).toBe(true);
    expect(result.state.active?.type).not.toBe(undefined);
    expect(result.state.score).toBeGreaterThan(0);
    expect(before).toBeDefined();
  });

  it('ゴーストは常に現在位置以下にある', () => {
    const game = createGame(SEED);
    const ghostY = getGhostY(game);
    expect(ghostY).not.toBeNull();
    expect(ghostY ?? 0).toBeGreaterThanOrEqual(game.active?.y ?? 0);
  });

  it('ホールドは既定で1ミノにつき1回まで', () => {
    const game = createGame(SEED);
    const once = step(game, FIXED_TIMESTEP_MS, [{ kind: 'hold' }]);
    expect(once.state.holdUsed).toBe(1);

    const twice = step(once.state, FIXED_TIMESTEP_MS, [{ kind: 'hold' }]);
    expect(twice.state.holdUsed).toBe(1);
  });

  it('イベント付きミノをホールドしても種類と付着位置が保持される', () => {
    const game = createGame(SEED);
    const prepared: GameState = {
      ...game,
      active: {
        ...(game.active ?? {
          type: 'T' as const,
          rot: 0 as const,
          x: 3,
          y: 0,
          eventCellIndex: null,
          eventKind: null,
        }),
        eventCellIndex: 2,
        eventKind: 'clover',
      },
    };

    const held = step(prepared, FIXED_TIMESTEP_MS, [{ kind: 'hold' }]).state;
    expect(held.hold).toMatchObject({
      type: prepared.active?.type,
      eventCellIndex: 2,
      eventKind: 'clover',
    });

    const swapped = step({ ...held, holdUsed: 0 }, FIXED_TIMESTEP_MS, [{ kind: 'hold' }]).state;
    expect(swapped.active).toMatchObject({
      type: prepared.active?.type,
      rot: 0,
      eventCellIndex: 2,
      eventKind: 'clover',
    });
  });

  it('マウス追従（moveTo）で指定した列へ移動する', () => {
    const game = createGame(SEED);
    const moved = step(game, FIXED_TIMESTEP_MS, [{ kind: 'moveTo', column: 0 }]);
    expect(moved.state.active?.x).toBeLessThan(game.active?.x ?? 99);
  });

  it('壁を越えて移動しない', () => {
    const game = createGame(SEED);
    const moved = advance(game, 100, [{ kind: 'moveTo', column: -5 }]);
    const piece = moved.active;
    expect(piece).not.toBeNull();
    expect(piece?.x ?? 0).toBeGreaterThanOrEqual(-1);
  });
});

describe('イベントスタックの発動', () => {
  it('スタックが空なら不発になり、状態は変わらない', () => {
    const game = createGame(SEED);
    const result = step(game, FIXED_TIMESTEP_MS, [{ kind: 'triggerStack' }]);

    expect(result.events.some((e) => e.kind === 'stackMisfire')).toBe(true);
    expect(result.state.stack.count).toBe(0);
  });

  it('クローバー1は不発でスタックを消費しない', () => {
    const game = createGame(SEED);
    const prepared: GameState = {
      ...game,
      stack: { kind: 'clover', count: 1, cooldownUntil: 0 },
    };

    const result = step(prepared, FIXED_TIMESTEP_MS, [{ kind: 'triggerStack' }]);

    expect(result.state.stack.kind).toBe('clover');
    expect(result.state.stack.count).toBe(1);
    expect(result.state.stack.cooldownUntil).toBe(0);
  });

  it('爆弾を発動すると下層が消えてフィーバーが始まる', () => {
    const game = createGame(SEED);
    const prepared: GameState = {
      ...game,
      stack: { kind: 'bomb', count: 2, cooldownUntil: 0 },
    };

    const result = step(prepared, FIXED_TIMESTEP_MS, [{ kind: 'triggerStack' }]);

    expect(result.events.some((e) => e.kind === 'bombCleared')).toBe(true);
    expect(result.events.some((e) => e.kind === 'feverStarted')).toBe(true);
    expect(result.state.stack.count).toBe(0);
    expect(result.state.stack.cooldownUntil).toBeGreaterThan(result.state.elapsedMs);
  });

  it('クールタイム中は発動できない', () => {
    const game = createGame(SEED);
    const prepared: GameState = {
      ...game,
      stack: { kind: 'bomb', count: 1, cooldownUntil: game.elapsedMs + STACK_COOLDOWN_MS },
    };

    const result = step(prepared, FIXED_TIMESTEP_MS, [{ kind: 'triggerStack' }]);

    expect(result.events.some((e) => e.kind === 'stackMisfire' && e.reason === 'cooldown')).toBe(
      true,
    );
    expect(result.state.stack.count).toBe(1);
  });

  it.each([1, 2] as const)(
    'ハート%dは到着待ちのおじゃまを1列減らして全スタックを消費する',
    (count) => {
      const game = receiveGarbage(createGame(SEED), 2, 4);
      const prepared: GameState = {
        ...game,
        stack: { kind: 'heart', count, cooldownUntil: 0 },
      };

      const result = step(prepared, FIXED_TIMESTEP_MS, [{ kind: 'triggerStack' }]);
      expect(getPendingGarbage(result.state)).toBe(1);
      expect(result.state.stack.count).toBe(0);
      expect(result.events.some((event) => event.kind === 'garbageOffset')).toBe(true);
    },
  );

  it('ハート1はおじゃまがなくても空振りして全スタックを消費する', () => {
    const game = createGame(SEED);
    const prepared: GameState = {
      ...game,
      stack: { kind: 'heart', count: 1, cooldownUntil: 0 },
    };

    const result = step(prepared, FIXED_TIMESTEP_MS, [{ kind: 'triggerStack' }]);
    expect(getPendingGarbage(result.state)).toBe(0);
    expect(result.state.stack.count).toBe(0);
    expect(result.events.some((event) => event.kind === 'garbageSent')).toBe(false);
  });

  it('破棄キーでカレント種別が解除される', () => {
    const game = createGame(SEED);
    const prepared: GameState = {
      ...game,
      stack: { kind: 'coin', count: 3, cooldownUntil: 0 },
    };

    const result = step(prepared, FIXED_TIMESTEP_MS, [{ kind: 'discardStack' }]);

    expect(result.events.some((e) => e.kind === 'stackDiscarded')).toBe(true);
    expect(result.state.stack.kind).toBeNull();
    expect(result.state.stack.count).toBe(0);
  });
});

describe('対戦：おじゃまと時間プレッシャー', () => {
  /** 下から2行を、1マスだけ空けて埋めた盤面 */
  function almostFullRows(state: GameState, rows: number[], gapX: number): GameState {
    const board = state.board.map((row) => row.slice());
    for (const y of rows) {
      const row = board[y];
      if (row === undefined) continue;
      for (let x = 0; x < BOARD_WIDTH; x++) {
        row[x] = x === gapX ? null : { color: 'I', event: null };
      }
    }
    return { ...state, board };
  }

  it('受け取ったおじゃまは待機列に入り、すぐには盤面へ入らない', () => {
    const game = createGame(SEED);
    const received = receiveGarbage(game, 3, 4);

    expect(getPendingGarbage(received)).toBe(3);
    expect(received.board).toBe(game.board);
  });

  it('猶予を過ぎるとミノ設置時に盤面へ挿入される', () => {
    const game = createGame(SEED);
    let state = receiveGarbage(game, 2, 4);

    // 猶予ぶん時間を進める
    state = advance(state, GARBAGE_DELAY_MS + FIXED_TIMESTEP_MS);
    const before = getPendingGarbage(state);
    expect(before).toBe(2);

    // ミノを1つ置くと入る
    const result = step(state, FIXED_TIMESTEP_MS, [{ kind: 'hardDrop' }]);

    expect(result.events.some((e) => e.kind === 'garbageApplied')).toBe(true);
    expect(getPendingGarbage(result.state)).toBe(0);
    expect(cellAt(result.state.board, 0, BOARD_HEIGHT - 1)?.garbage).toBe(true);
  });

  it('猶予中はまだ盤面に入らない', () => {
    const game = createGame(SEED);
    const state = receiveGarbage(game, 2, 4);

    const result = step(state, FIXED_TIMESTEP_MS, [{ kind: 'hardDrop' }]);
    expect(result.events.some((e) => e.kind === 'garbageApplied')).toBe(false);
    expect(getPendingGarbage(result.state)).toBe(2);
  });

  /**
   * 左端（x=0）だけを空けた盤面に、縦向きの I ミノを落として塞ぐ。
   * I は rot1 で x+2 の列だけを4マス占めるため、origin を -2 に置くと列0に落ちる。
   */
  function clearWithVerticalI(state: GameState, rowCount: number): GameState {
    const rows = Array.from({ length: rowCount }, (_, i) => BOARD_HEIGHT - 1 - i);
    const prepared = almostFullRows(state, rows, 0);
    return withPieceAt(prepared, 'I', -2, BOARD_HEIGHT - 4, 1);
  }

  it('ラインを消すと待機中のおじゃまを相殺する', () => {
    let state = receiveGarbage(createGame(SEED), 4, 5);
    state = clearWithVerticalI(state, 2);

    const result = step(state, FIXED_TIMESTEP_MS, [{ kind: 'hardDrop' }]);

    expect(result.events.some((e) => e.kind === 'linesCleared')).toBe(true);
    expect(result.events.some((e) => e.kind === 'garbageOffset')).toBe(true);
    expect(getPendingGarbage(result.state)).toBeLessThan(4);
  });

  it('相殺しきれない攻撃は送信として通知される', () => {
    // 受信なしでテトリスを決めれば、まるごと送信になる
    const state = clearWithVerticalI(createGame(SEED), 4);

    const result = step(state, FIXED_TIMESTEP_MS, [{ kind: 'hardDrop' }]);
    const sent = result.events.find((e) => e.kind === 'garbageSent');

    expect(sent).toBeDefined();
    expect(sent?.kind === 'garbageSent' && sent.lines).toBeGreaterThanOrEqual(4);
  });

  it('受信量が攻撃力を上回れば、相手には何も届かない', () => {
    let state = receiveGarbage(createGame(SEED), 10, 5);
    state = clearWithVerticalI(state, 2);

    const result = step(state, FIXED_TIMESTEP_MS, [{ kind: 'hardDrop' }]);

    expect(result.events.some((e) => e.kind === 'garbageSent')).toBe(false);
    expect(getPendingGarbage(result.state)).toBeGreaterThan(0);
  });

  it('ソロでは時間が経ってもレベルが上がらない', () => {
    const solo = createGame(SEED);
    const later = { ...solo, elapsedMs: TIME_PRESSURE_INTERVAL_MS * 5 };
    expect(getEffectiveLevel(later)).toBe(solo.level);
  });

  it('サバイバルでは時間経過だけでレベルが上がる', () => {
    const versus = createGame(SEED, { timePressure: true });
    const later = { ...versus, elapsedMs: TIME_PRESSURE_INTERVAL_MS * 3 };
    expect(getEffectiveLevel(later)).toBe(4);
  });

  it('ライン数によるレベルの方が高ければそちらが採用される', () => {
    const versus = createGame(SEED, { timePressure: true });
    const later = { ...versus, level: 12, elapsedMs: TIME_PRESSURE_INTERVAL_MS };
    expect(getEffectiveLevel(later)).toBe(12);
  });
});

describe('ソフトドロップ', () => {
  it('押した瞬間に一気に落ちない', () => {
    // 自然落下の間隔ぎりぎりまでタイマーを溜めた状態を作る。
    // ここでソフトドロップに切り替わると落下間隔が一気に短くなるため、
    // 溜まっていた時間をそのまま消化すると何マスも飛んでしまう。
    const game = createGame(SEED);
    const charged: GameState = { ...game, dropTimerMs: 900 };
    const beforeY = charged.active?.y ?? 0;

    const result = step(charged, FIXED_TIMESTEP_MS, [{ kind: 'softDrop', active: true }]);
    const afterY = result.state.active?.y ?? 0;

    expect(afterY - beforeY).toBeLessThanOrEqual(MAX_DROP_CELLS_PER_STEP);
  });

  it('1ステップで落ちるマス数に上限がある', () => {
    const game = createGame(SEED);
    // 極端に溜まった状態でも上限を超えない
    const charged: GameState = { ...game, dropTimerMs: 100_000, softDropping: true };
    const beforeY = charged.active?.y ?? 0;

    const result = step(charged, FIXED_TIMESTEP_MS, []);
    const afterY = result.state.active?.y ?? 0;

    expect(afterY - beforeY).toBeLessThanOrEqual(MAX_DROP_CELLS_PER_STEP);
  });

  it('押しっぱなしでも自然落下より速く、即着地はしない', () => {
    const game = createGame(SEED);
    const startY = game.active?.y ?? 0;

    // 300ms ぶん、ソフトドロップを押し続ける
    let soft = step(game, FIXED_TIMESTEP_MS, [{ kind: 'softDrop', active: true }]).state;
    let normal = game;
    for (let t = 0; t < 300; t += FIXED_TIMESTEP_MS) {
      soft = step(soft, FIXED_TIMESTEP_MS, []).state;
      normal = step(normal, FIXED_TIMESTEP_MS, []).state;
    }

    const softY = soft.active?.y ?? startY;
    const normalY = normal.active?.y ?? startY;

    // 自然落下より確実に速い
    expect(softY).toBeGreaterThan(normalY);
    // ただし一瞬で底まで行くほどではない
    expect(softY - startY).toBeLessThan(BOARD_HEIGHT);
  });

  it('同じ押下状態が続いてもタイマーは消えない', () => {
    const game = createGame(SEED);
    const pressed = step(game, FIXED_TIMESTEP_MS, [{ kind: 'softDrop', active: true }]).state;

    // 同じ状態のコマンドが毎フレーム来てもリセットされないこと
    const next = step(pressed, FIXED_TIMESTEP_MS, [{ kind: 'softDrop', active: true }]).state;
    expect(next.dropTimerMs).toBeGreaterThan(0);
  });
});

describe('重力（ハート3）', () => {
  /** 指定位置に浮いたブロックを1つ置いた盤面を作る */
  function withFloatingBlock(state: GameState, x: number, y: number): GameState {
    const board = state.board.map((row) => row.slice());
    const row = board[y];
    if (row !== undefined) row[x] = { color: 'S', event: null };
    return { ...state, board };
  }

  it('発動すると落下演出のフェーズに入り、盤面はまだ変わらない', () => {
    const game = receiveGarbage(withFloatingBlock(createGame(SEED), 3, 10), 2, 4);
    const prepared: GameState = {
      ...game,
      stack: { kind: 'heart', count: 3, cooldownUntil: 0 },
    };

    const result = step(prepared, FIXED_TIMESTEP_MS, [{ kind: 'triggerStack' }]);

    expect(result.events.some((e) => e.kind === 'gravityApplied')).toBe(true);
    expect(result.state.gravity).not.toBeNull();
    expect(result.state.gravity?.moves.length).toBeGreaterThan(0);
    expect(getPendingGarbage(result.state)).toBe(1);
    // 演出中なので盤面はまだ落ちていない
    expect(cellAt(result.state.board, 3, 10)?.color).toBe('S');
  });

  it('演出時間が経過すると実際に落下する', () => {
    const game = withFloatingBlock(createGame(SEED), 3, 10);
    const prepared: GameState = {
      ...game,
      stack: { kind: 'heart', count: 3, cooldownUntil: 0 },
    };

    const triggered = step(prepared, FIXED_TIMESTEP_MS, [{ kind: 'triggerStack' }]).state;
    const settled = advance(triggered, GRAVITY_DELAY_MS + FIXED_TIMESTEP_MS * 2);

    expect(settled.gravity).toBeNull();
    expect(cellAt(settled.board, 3, 10)).toBeNull();
    expect(cellAt(settled.board, 3, BOARD_HEIGHT - 1)?.color).toBe('S');
  });

  it('落下演出中は操作を受け付けない', () => {
    const game = withFloatingBlock(createGame(SEED), 3, 10);
    const prepared: GameState = {
      ...game,
      stack: { kind: 'heart', count: 3, cooldownUntil: 0 },
    };

    const triggered = step(prepared, FIXED_TIMESTEP_MS, [{ kind: 'triggerStack' }]).state;
    const beforeX = triggered.active?.x;

    const moved = step(triggered, FIXED_TIMESTEP_MS, [{ kind: 'move', dx: -1 }]);
    expect(moved.state.active?.x).toBe(beforeX);
  });

  it('ハート1では重力が発生しない', () => {
    const game = withFloatingBlock(createGame(SEED), 3, 10);
    const prepared: GameState = {
      ...game,
      stack: { kind: 'heart', count: 1, cooldownUntil: 0 },
    };

    const result = step(prepared, FIXED_TIMESTEP_MS, [{ kind: 'triggerStack' }]);
    expect(result.state.gravity).toBeNull();
  });
});

describe('フィーバータイム', () => {
  it('フィーバー中はコンボが途切れない', () => {
    const game = createGame(SEED);
    const prepared: GameState = {
      ...game,
      combo: 5,
      fever: {
        until: game.elapsedMs + 5000,
        cloverUntil: 0,
        comboRate: COMBO_RATE_BASE,
        comboRateStep: 0,
      },
    };

    // 消去のないハードドロップを1回行う
    const result = step(prepared, FIXED_TIMESTEP_MS, [{ kind: 'hardDrop' }]);
    expect(result.state.combo).toBe(5);
  });

  it('フィーバーが切れるとコンボが途切れる', () => {
    const game = createGame(SEED);
    const prepared: GameState = {
      ...game,
      combo: 5,
      fever: {
        until: 0,
        cloverUntil: 0,
        comboRate: COMBO_RATE_BASE,
        comboRateStep: 0,
      },
    };

    const result = step(prepared, FIXED_TIMESTEP_MS, [{ kind: 'hardDrop' }]);
    expect(result.state.combo).toBe(0);
    expect(result.events.some((e) => e.kind === 'comboBroken')).toBe(true);
  });

  it('爆弾フィーバーではコンボ係数が通常値0.15から変わらない', () => {
    const game = createGame(SEED);
    const prepared: GameState = {
      ...game,
      stack: { kind: 'bomb', count: 4, cooldownUntil: 0 },
    };

    const result = step(prepared, FIXED_TIMESTEP_MS, [{ kind: 'triggerStack' }]);
    expect(result.state.fever.comboRate).toBe(COMBO_RATE_BASE);
    expect(result.state.fever.comboRateStep).toBe(0);
  });

  it.each([
    [2, 0.05],
    [3, 0.05],
    [4, 0.15],
  ] as const)('クローバー%dはコンボ成立ごとに係数を%f加算する', (count, stepRate) => {
    const game = createGame(SEED);
    const triggered = step(
      {
        ...game,
        stack: { kind: 'clover', count, cooldownUntil: 0 },
      },
      FIXED_TIMESTEP_MS,
      [{ kind: 'triggerStack' }],
    ).state;

    expect(triggered.stack.count).toBe(0);
    expect(triggered.fever.comboRate).toBe(COMBO_RATE_BASE);
    expect(triggered.fever.comboRateStep).toBe(stepRate);

    const cleared = step(withSingleLineClear(triggered), FIXED_TIMESTEP_MS, [
      { kind: 'hardDrop' },
    ]).state;
    expect(cleared.fever.comboRate).toBeCloseTo(COMBO_RATE_BASE + stepRate);
  });

  it('爆弾で全体を延長してもクローバー由来の10秒後に係数だけ通常へ戻る', () => {
    const game = createGame(SEED);
    const bomb = step(
      {
        ...game,
        stack: { kind: 'bomb', count: 4, cooldownUntil: 0 },
      },
      FIXED_TIMESTEP_MS,
      [{ kind: 'triggerStack' }],
    ).state;
    const clover = step(
      {
        ...bomb,
        stack: { kind: 'clover', count: 4, cooldownUntil: 0 },
      },
      FIXED_TIMESTEP_MS,
      [{ kind: 'triggerStack' }],
    ).state;

    expect(clover.fever.until - clover.elapsedMs).toBe(FEVER_MAX_MS);
    expect(clover.fever.cloverUntil - clover.elapsedMs).toBe(10_000);

    const afterClover = step(clover, 10_000 + FIXED_TIMESTEP_MS).state;
    expect(isFever(afterClover)).toBe(true);
    expect(afterClover.fever.comboRate).toBe(COMBO_RATE_BASE);
    expect(afterClover.fever.comboRateStep).toBe(0);
  });

  it('フィーバーの重複加算は残り15秒で頭打ちになる', () => {
    const game = createGame(SEED);
    const first = step(
      {
        ...game,
        stack: { kind: 'bomb', count: 4, cooldownUntil: 0 },
      },
      FIXED_TIMESTEP_MS,
      [{ kind: 'triggerStack' }],
    ).state;
    const second = step(
      {
        ...first,
        stack: { kind: 'bomb', count: 4, cooldownUntil: 0 },
      },
      FIXED_TIMESTEP_MS,
      [{ kind: 'triggerStack' }],
    ).state;

    expect(second.fever.until - second.elapsedMs).toBe(FEVER_MAX_MS);
  });
});

/**
 * 4列消しは「チャージ→スイープ→圧縮→タメ」の専用演出があり、
 * その間だけ落下が止まる時間が長い（デザイン仕様 05-I）。
 * 演出の数値を動かしたときにコア側の停止時間がついてこないと絵と操作がずれるので、
 * ここで両者の対応を固定しておく。
 */
describe('ライン消去の停止時間', () => {
  /** 指定行を左端だけ空けて埋める */
  function almostFullRows(state: GameState, rows: number[]): GameState {
    const board = state.board.map((row) => row.slice());
    for (const y of rows) {
      const row = board[y];
      if (row === undefined) continue;
      for (let x = 0; x < BOARD_WIDTH; x++) {
        row[x] = x === 0 ? null : { color: 'I', event: null };
      }
    }
    return { ...state, board };
  }

  /** 縦向き I を左端に落として rowCount 行そろえる */
  function clearRows(rowCount: number): GameState {
    const rows = Array.from({ length: rowCount }, (_, i) => BOARD_HEIGHT - 1 - i);
    const prepared = almostFullRows(createGame(SEED), rows);
    return withPieceAt(prepared, 'I', -2, BOARD_HEIGHT - 4, 1);
  }

  it('段数ごとの停止時間が演出の合計と一致する', () => {
    expect(getClearDelayMs(1)).toBe(LINE_CLEAR_DELAY_MS);
    expect(getClearDelayMs(3)).toBe(LINE_CLEAR_DELAY_MS);
    expect(getClearDelayMs(4)).toBe(TETRIS_CLEAR_DELAY_MS);

    // チャージ240 + スイープ200 + 圧縮140 + タメ60 + 段落下230
    expect(TETRIS_CLEAR_DELAY_MS).toBe(870);
    expect(TETRIS_CLEAR_DELAY_MS).toBeGreaterThan(LINE_CLEAR_DELAY_MS);
  });

  it('1列消しは通常の停止時間で再開する', () => {
    const dropped = step(clearRows(1), FIXED_TIMESTEP_MS, [{ kind: 'hardDrop' }]).state;
    expect(dropped.clearing).not.toBeNull();

    // 直前まではまだ止まっている
    const before = advance(dropped, LINE_CLEAR_DELAY_MS - FIXED_TIMESTEP_MS * 2);
    expect(before.clearing).not.toBeNull();

    const after = advance(before, FIXED_TIMESTEP_MS * 3);
    expect(after.clearing).toBeNull();
  });

  it('4列消しは通常より長く止まる', () => {
    const dropped = step(clearRows(4), FIXED_TIMESTEP_MS, [{ kind: 'hardDrop' }]).state;
    expect(dropped.clearing).not.toBeNull();
    expect(dropped.clearing?.rows.length).toBe(4);

    // 通常の停止時間を過ぎてもまだ再開しない
    const atNormal = advance(dropped, LINE_CLEAR_DELAY_MS + FIXED_TIMESTEP_MS);
    expect(atNormal.clearing).not.toBeNull();

    const atTetris = advance(dropped, TETRIS_CLEAR_DELAY_MS + FIXED_TIMESTEP_MS);
    expect(atTetris.clearing).toBeNull();
  });
});
