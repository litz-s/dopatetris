/**
 * SRS（回転・壁蹴り）、T-Spin判定、ロックディレイの検証。
 * 目視では確認しづらく、壊れても気づきにくい箇所なのでここで固定する。
 */
import { describe, expect, it } from 'vitest';
import { createGame, step } from './game';
import { getKicks, getShape, rotateCcw, rotateCw } from './pieces';
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  FIXED_TIMESTEP_MS,
  LOCK_DELAY_MS,
  MAX_LOCK_RESETS,
} from './config/balance';
import { MINO_TYPES } from './types';
import type { Board, GameState, MinoType, Rotation } from './types';
import type { Command } from './commands';

const SEED = 424242;
const ROTATIONS: Rotation[] = [0, 1, 2, 3];

function emptyBoardState(): GameState {
  return createGame(SEED);
}

/** 盤面の指定セルを埋める */
function fill(board: Board, x: number, y: number, color: MinoType = 'I'): void {
  const row = board[y];
  if (row !== undefined) row[x] = { color, event: null };
}

function cloneBoard(board: Board): Board {
  return board.map((row) => row.slice());
}

/** 落下中のミノを差し替えた状態を作る */
function withPiece(
  state: GameState,
  type: MinoType,
  rot: Rotation,
  x: number,
  y: number,
): GameState {
  return {
    ...state,
    active: { type, rot, x, y, eventCellIndex: null, eventKind: null },
    lastMoveWasRotation: false,
    lastRotationKicked: false,
    lockTimerMs: null,
    lockResets: 0,
  };
}

// ---------------------------------------------------------------- 形状

describe('ミノの形状', () => {
  it('全種・全回転で必ず4セル', () => {
    for (const type of MINO_TYPES) {
      for (const rot of ROTATIONS) {
        expect(getShape(type, rot)).toHaveLength(4);
      }
    }
  });

  it('O ミノは回転しても形が変わらない', () => {
    const base = JSON.stringify(getShape('O', 0));
    for (const rot of ROTATIONS) {
      expect(JSON.stringify(getShape('O', rot))).toBe(base);
    }
  });

  it('回転を4回繰り返すと元に戻る', () => {
    for (const rot of ROTATIONS) {
      expect(rotateCw(rotateCw(rotateCw(rotateCw(rot))))).toBe(rot);
      expect(rotateCcw(rotateCw(rot))).toBe(rot);
    }
  });

  it('セル座標がバウンディングボックス内に収まる', () => {
    for (const type of MINO_TYPES) {
      for (const rot of ROTATIONS) {
        for (const [dx, dy] of getShape(type, rot)) {
          expect(dx).toBeGreaterThanOrEqual(0);
          expect(dy).toBeGreaterThanOrEqual(0);
          expect(dx).toBeLessThanOrEqual(3);
          expect(dy).toBeLessThanOrEqual(3);
        }
      }
    }
  });
});

// ---------------------------------------------------------------- キックテーブル

describe('SRS キックテーブル', () => {
  it('隣接する回転には5つの候補があり、先頭は無補正', () => {
    const transitions: [Rotation, Rotation][] = [
      [0, 1],
      [1, 0],
      [1, 2],
      [2, 1],
      [2, 3],
      [3, 2],
      [3, 0],
      [0, 3],
    ];

    for (const type of ['T', 'I'] as MinoType[]) {
      for (const [from, to] of transitions) {
        const kicks = getKicks(type, from, to);
        expect(kicks).toHaveLength(5);
        expect(kicks[0]).toEqual([0, 0]);
      }
    }
  });

  it('O ミノは補正候補を持たない', () => {
    expect(getKicks('O', 0, 1)).toEqual([[0, 0]]);
  });

  it('往復する遷移のオフセットは互いに逆向き', () => {
    // 0>>1 の2番目と 1>>0 の2番目は打ち消し合う
    const forward = getKicks('T', 0, 1)[1];
    const backward = getKicks('T', 1, 0)[1];
    expect(forward).toBeDefined();
    expect(backward).toBeDefined();
    expect((forward?.[0] ?? 0) + (backward?.[0] ?? 0)).toBe(0);
    expect((forward?.[1] ?? 0) + (backward?.[1] ?? 0)).toBe(0);
  });
});

// ---------------------------------------------------------------- 壁蹴り

describe('壁蹴り', () => {
  it('右端の I ミノは押し戻されて回転できる', () => {
    // 縦向きの I を右端に置く。そのまま横にすると盤外へはみ出す
    const base = emptyBoardState();
    const state = withPiece(base, 'I', 1, BOARD_WIDTH - 3, 4);

    const result = step(state, FIXED_TIMESTEP_MS, [{ kind: 'rotate', dir: 'ccw' }]);

    expect(result.events.some((e) => e.kind === 'pieceRotated')).toBe(true);
    expect(result.state.active?.rot).toBe(0);
    // 盤内へ押し戻されている
    const piece = result.state.active;
    expect(piece).not.toBeNull();
    for (const [dx] of getShape('I', 0)) {
      expect((piece?.x ?? 0) + dx).toBeLessThan(BOARD_WIDTH);
    }
  });

  it('左端の T ミノも盤外へはみ出さない', () => {
    const base = emptyBoardState();
    const state = withPiece(base, 'T', 1, -1, 4);

    const result = step(state, FIXED_TIMESTEP_MS, [{ kind: 'rotate', dir: 'cw' }]);
    const piece = result.state.active;

    if (result.events.some((e) => e.kind === 'pieceRotated')) {
      for (const [dx] of getShape(piece?.type ?? 'T', piece?.rot ?? 0)) {
        expect((piece?.x ?? 0) + dx).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('周囲を塞がれていると回転に失敗し、状態が変わらない', () => {
    const base = emptyBoardState();
    const board = cloneBoard(base.board);
    // T の周囲を完全に埋める
    for (let y = BOARD_HEIGHT - 4; y < BOARD_HEIGHT; y++) {
      for (let x = 0; x < BOARD_WIDTH; x++) {
        if (x >= 3 && x <= 5 && y >= BOARD_HEIGHT - 3) continue;
        fill(board, x, y);
      }
    }
    const state = withPiece({ ...base, board }, 'I', 0, 3, BOARD_HEIGHT - 3);

    const result = step(state, FIXED_TIMESTEP_MS, [{ kind: 'rotate', dir: 'cw' }]);
    expect(result.state.active?.rot).toBe(0);
  });
});

// ---------------------------------------------------------------- T-Spin

describe('T-Spin', () => {
  /**
   * T-Spin Double の盤面を組む。
   *   y=19: x=3 だけブロック（4隅判定を成立させるための天井）
   *   y=20: x=3,4,5 が空き
   *   y=21: x=4 だけ空き
   * ここへ縦向きの T を回し込むと2列そろう。
   */
  function tSpinDoubleState(): GameState {
    const base = emptyBoardState();
    const board = cloneBoard(base.board);

    for (let x = 0; x < BOARD_WIDTH; x++) {
      if (x < 3 || x > 5) fill(board, x, 20);
      if (x !== 4) fill(board, x, 21);
    }
    fill(board, 3, 19);

    return withPiece({ ...base, board }, 'T', 3, 3, 19);
  }

  it('回し込みで2列そろえると T-Spin Double になる', () => {
    const state = tSpinDoubleState();

    const commands: Command[] = [{ kind: 'rotate', dir: 'ccw' }, { kind: 'hardDrop' }];
    const result = step(state, FIXED_TIMESTEP_MS, commands);

    const cleared = result.events.find((e) => e.kind === 'linesCleared');
    expect(cleared).toBeDefined();
    expect(cleared?.kind === 'linesCleared' && cleared.clearType).toBe('tspin-double');
  });

  it('回転を伴わずに置いた場合は同じ形でも T-Spin にならない', () => {
    // 最終形と同じ位置・同じ向きだが、回転を経ずに置いたケース。
    // 盤面の形だけでは T-Spin と判定してはならない。
    const base = tSpinDoubleState();
    const placed: GameState = {
      ...base,
      active: { type: 'T', rot: 2, x: 3, y: 19, eventCellIndex: null, eventKind: null },
      lastMoveWasRotation: false,
    };

    const result = step(placed, FIXED_TIMESTEP_MS, [{ kind: 'hardDrop' }]);
    const cleared = result.events.find((e) => e.kind === 'linesCleared');

    expect(cleared).toBeDefined();
    expect(cleared?.kind === 'linesCleared' && cleared.clearType).toBe('double');
  });

  it('T以外のミノでは T-Spin にならない', () => {
    const base = emptyBoardState();
    const board = cloneBoard(base.board);
    for (let x = 0; x < BOARD_WIDTH; x++) {
      if (x > 1) fill(board, x, 21);
    }

    const state = withPiece({ ...base, board }, 'S', 0, 0, 19);
    const result = step(state, FIXED_TIMESTEP_MS, [
      { kind: 'rotate', dir: 'cw' },
      { kind: 'hardDrop' },
    ]);

    const cleared = result.events.find((e) => e.kind === 'linesCleared');
    if (cleared?.kind === 'linesCleared') {
      expect(cleared.clearType.startsWith('tspin')).toBe(false);
    }
  });
});

// ---------------------------------------------------------------- ロックディレイ

describe('ロックディレイ', () => {
  /** 床に接地した状態のミノを用意する */
  function groundedState(): GameState {
    const base = emptyBoardState();
    // O ミノは回転しないので接地判定が安定する
    return withPiece(base, 'O', 0, 4, BOARD_HEIGHT - 2);
  }

  it('接地しても即座には固定されない', () => {
    const state = groundedState();
    const result = step(state, FIXED_TIMESTEP_MS, []);

    expect(result.events.some((e) => e.kind === 'pieceLocked')).toBe(false);
    expect(result.state.lockTimerMs).not.toBeNull();
  });

  it('接地してから既定時間が過ぎると固定される', () => {
    let state = groundedState();
    let locked = false;

    for (let elapsed = 0; elapsed < LOCK_DELAY_MS * 2; elapsed += FIXED_TIMESTEP_MS) {
      const result = step(state, FIXED_TIMESTEP_MS, []);
      state = result.state;
      if (result.events.some((e) => e.kind === 'pieceLocked')) {
        locked = true;
        break;
      }
    }

    expect(locked).toBe(true);
  });

  it('移動するとロックディレイがリセットされる', () => {
    let state = groundedState();

    // 接地させてタイマーを走らせる
    state = step(state, FIXED_TIMESTEP_MS, []).state;
    const before = state.lockTimerMs ?? 0;

    // 少し進めてから横移動する
    state = step(state, FIXED_TIMESTEP_MS * 5, []).state;
    expect(state.lockTimerMs ?? 0).toBeLessThan(before);

    state = step(state, FIXED_TIMESTEP_MS, [{ kind: 'move', dx: -1 }]).state;
    // コマンド適用でタイマーが満タンに戻り、その後同じフレーム分だけ減る
    expect(state.lockTimerMs ?? 0).toBeCloseTo(LOCK_DELAY_MS - FIXED_TIMESTEP_MS, 5);
    expect(state.lockResets).toBe(1);
  });

  it('リセット回数には上限があり、無限に粘れない', () => {
    let state = groundedState();
    state = step(state, FIXED_TIMESTEP_MS, []).state;

    // 上限を超えるまで左右に振り続ける
    for (let i = 0; i < MAX_LOCK_RESETS + 5; i++) {
      const dx = i % 2 === 0 ? -1 : 1;
      state = step(state, FIXED_TIMESTEP_MS, [{ kind: 'move', dx }]).state;
      if (state.active === null) break;
    }

    expect(state.lockResets).toBeLessThanOrEqual(MAX_LOCK_RESETS);
  });

  it('接地していない間はロックタイマーが動かない', () => {
    const base = emptyBoardState();
    const state = withPiece(base, 'O', 0, 4, 5);

    const result = step(state, FIXED_TIMESTEP_MS, []);
    expect(result.state.lockTimerMs).toBeNull();
  });
});
