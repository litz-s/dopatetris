import { describe, expect, it } from 'vitest';
import {
  computeAttack,
  computeStackAttack,
  getComboGarbage,
  getFeverAttackRate,
  offsetGarbage,
} from './garbage';
import { countGarbageOverflow, createEmptyBoard, insertGarbage, cellAt } from './board';
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  GARBAGE_MAX_PER_PIECE,
  GARBAGE_PERFECT_CLEAR,
} from './config/balance';
import type { AttackContext } from './garbage';
import type { Board, MinoType } from './types';

const BASE: AttackContext = {
  clearType: 'single',
  combo: 1,
  b2b: false,
  perfectClear: false,
  feverActive: false,
  feverAttackRate: 1,
};

function fillRow(board: Board, y: number, color: MinoType = 'T'): void {
  const row = board[y];
  if (row === undefined) return;
  for (let x = 0; x < BOARD_WIDTH; x++) row[x] = { color, event: null };
}

describe('攻撃力の計算', () => {
  it('シングルでは送れない', () => {
    expect(computeAttack(BASE)).toBe(0);
  });

  it('消去行数が多いほど強い', () => {
    const double = computeAttack({ ...BASE, clearType: 'double' });
    const triple = computeAttack({ ...BASE, clearType: 'triple' });
    const tetris = computeAttack({ ...BASE, clearType: 'tetris' });

    expect(double).toBeLessThan(triple);
    expect(triple).toBeLessThan(tetris);
  });

  it('T-Spin は同じ行数の通常消去より強い', () => {
    const double = computeAttack({ ...BASE, clearType: 'double' });
    const tspin = computeAttack({ ...BASE, clearType: 'tspin-double' });
    expect(tspin).toBeGreaterThan(double);
  });

  it('Back-to-Back で加算される', () => {
    const normal = computeAttack({ ...BASE, clearType: 'tetris' });
    const b2b = computeAttack({ ...BASE, clearType: 'tetris', b2b: true });
    expect(b2b).toBe(normal + 1);
  });

  it('コンボが伸びるほど加算が増える', () => {
    expect(getComboGarbage(0)).toBe(0);
    expect(getComboGarbage(1)).toBe(0);
    expect(getComboGarbage(5)).toBeGreaterThan(getComboGarbage(2));
    // 表を超えても壊れず、最大値で頭打ちになる
    expect(getComboGarbage(999)).toBe(getComboGarbage(12));
  });

  it('パーフェクトクリアは大きく加算される', () => {
    const normal = computeAttack({ ...BASE, clearType: 'double' });
    const perfect = computeAttack({ ...BASE, clearType: 'double', perfectClear: true });
    // 上限があるため単純加算にはならないが、確実に強くなる
    expect(perfect).toBeGreaterThan(normal);
    expect(perfect).toBeLessThanOrEqual(GARBAGE_MAX_PER_PIECE);
  });

  it('フィーバー中はクローバー倍率が乗る', () => {
    const normal = computeAttack({ ...BASE, clearType: 'triple', combo: 5 });
    const fever = computeAttack({
      ...BASE,
      clearType: 'triple',
      combo: 5,
      feverActive: true,
      feverAttackRate: 1.5,
    });
    expect(fever).toBeGreaterThan(normal);
  });

  it('1回の設置で送れる量に上限がある', () => {
    const huge = computeAttack({
      ...BASE,
      clearType: 'tspin-triple',
      combo: 20,
      b2b: true,
      perfectClear: true,
      feverActive: true,
      feverAttackRate: 1.5,
    });
    expect(huge).toBe(GARBAGE_MAX_PER_PIECE);
  });

  it('加算されても負にならない', () => {
    expect(computeAttack({ ...BASE, clearType: 'tspin-mini', combo: 0 })).toBeGreaterThanOrEqual(0);
  });
});

describe('イベントスタックによる追加攻撃', () => {
  it('爆弾は消し飛ばした行数だけ送る', () => {
    expect(computeStackAttack('bomb', 1)).toBe(1);
    expect(computeStackAttack('bomb', 4)).toBe(4);
  });

  it('ハートとコインは攻撃しない', () => {
    expect(computeStackAttack('heart', 3)).toBe(0);
    expect(computeStackAttack('coin', 3)).toBe(0);
  });

  it('クローバーは直接送らず、攻撃倍率を上げる', () => {
    expect(computeStackAttack('clover', 4)).toBe(0);
    expect(getFeverAttackRate('clover', 2)).toBeGreaterThan(1);
    expect(getFeverAttackRate('clover', 4)).toBeGreaterThan(getFeverAttackRate('clover', 2));
  });

  it('クローバー1は不発なので倍率が上がらない', () => {
    expect(getFeverAttackRate('clover', 1)).toBe(1);
  });

  it('爆弾では攻撃倍率は変わらない', () => {
    expect(getFeverAttackRate('bomb', 4)).toBe(1);
  });
});

describe('相殺', () => {
  it('受けと送りが同数なら両方消える', () => {
    expect(offsetGarbage(4, 4)).toEqual({ pending: 0, attack: 0 });
  });

  it('送りが多ければ差分だけ相手へ届く', () => {
    expect(offsetGarbage(2, 6)).toEqual({ pending: 0, attack: 4 });
  });

  it('受けが多ければ差分だけ自分に残る', () => {
    expect(offsetGarbage(7, 3)).toEqual({ pending: 4, attack: 0 });
  });

  it('片方が0なら何も起きない', () => {
    expect(offsetGarbage(0, 5)).toEqual({ pending: 0, attack: 5 });
    expect(offsetGarbage(5, 0)).toEqual({ pending: 5, attack: 0 });
  });
});

describe('おじゃま行の挿入', () => {
  it('指定した行数が下から入り、1マスだけ穴が開く', () => {
    const board = insertGarbage(createEmptyBoard(), 2, 3);

    for (const y of [BOARD_HEIGHT - 1, BOARD_HEIGHT - 2]) {
      expect(cellAt(board, 3, y)).toBeNull();
      expect(cellAt(board, 0, y)?.garbage).toBe(true);
      expect(cellAt(board, 9, y)?.garbage).toBe(true);
    }
  });

  it('既存のブロックが押し上げられる', () => {
    const board = createEmptyBoard();
    fillRow(board, BOARD_HEIGHT - 1, 'S');
    // 穴があるので消えない状態にする
    const bottom = board[BOARD_HEIGHT - 1];
    if (bottom !== undefined) bottom[0] = null;

    const next = insertGarbage(board, 3, 5);
    expect(cellAt(next, 1, BOARD_HEIGHT - 4)?.color).toBe('S');
  });

  it('盤面の高さを超えない', () => {
    const board = insertGarbage(createEmptyBoard(), 30, 0);
    expect(board).toHaveLength(BOARD_HEIGHT);
  });

  it('0行なら盤面を変更しない', () => {
    const board = createEmptyBoard();
    expect(insertGarbage(board, 0, 4)).toBe(board);
  });

  it('穴の位置が範囲外でも盤内に丸められる', () => {
    const board = insertGarbage(createEmptyBoard(), 1, 99);
    const row = board[BOARD_HEIGHT - 1];
    const holes = row?.filter((cell) => cell === null).length ?? 0;
    expect(holes).toBe(1);
  });

  it('積み上がっているとあふれる量を検出できる', () => {
    const board = createEmptyBoard();
    for (let y = 2; y < BOARD_HEIGHT; y++) fillRow(board, y);

    // 空きは上2行しかないので、5行入れると3行あふれる
    expect(countGarbageOverflow(board, 5)).toBe(3);
    expect(countGarbageOverflow(board, 2)).toBe(0);
  });

  it('空の盤面ならあふれない', () => {
    expect(countGarbageOverflow(createEmptyBoard(), 10)).toBe(0);
  });
});

describe('パーフェクトクリアの重み', () => {
  it('加算値が定数と一致する', () => {
    const withoutPc = computeAttack({ ...BASE, clearType: 'single', combo: 0 });
    const withPc = computeAttack({ ...BASE, clearType: 'single', combo: 0, perfectClear: true });
    expect(withPc - withoutPc).toBe(GARBAGE_PERFECT_CLEAR);
  });
});
