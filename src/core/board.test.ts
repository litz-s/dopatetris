import { describe, expect, it } from 'vitest';
import {
  applyGravity,
  cellAt,
  collectEventsInRows,
  computeGravityMoves,
  createEmptyBoard,
  findFullRows,
  removeBottomRows,
  removeRows,
} from './board';
import { BOARD_HEIGHT, BOARD_WIDTH } from './config/balance';
import type { Board, EventKind, MinoType } from './types';

function fillRow(board: Board, y: number, color: MinoType = 'T'): void {
  const row = board[y];
  if (row === undefined) return;
  for (let x = 0; x < BOARD_WIDTH; x++) row[x] = { color, event: null };
}

function setEvent(board: Board, x: number, y: number, event: EventKind): void {
  const row = board[y];
  if (row === undefined) return;
  row[x] = { color: 'T', event };
}

describe('盤面', () => {
  it('空の盤面は正しいサイズを持つ', () => {
    const board = createEmptyBoard();
    expect(board).toHaveLength(BOARD_HEIGHT);
    expect(board[0]).toHaveLength(BOARD_WIDTH);
  });

  it('揃った行を検出できる', () => {
    const board = createEmptyBoard();
    fillRow(board, 5);
    fillRow(board, 7);
    expect(findFullRows(board)).toEqual([5, 7]);
  });

  it('行を削除すると上の行が落ちてくる', () => {
    const board = createEmptyBoard();
    fillRow(board, BOARD_HEIGHT - 1);
    setEvent(board, 0, BOARD_HEIGHT - 2, 'bomb');

    const next = removeRows(board, [BOARD_HEIGHT - 1]);
    expect(cellAt(next, 0, BOARD_HEIGHT - 1)?.event).toBe('bomb');
  });
});

describe('イベントタイルの収集順序', () => {
  it('列は左から右に向かって消えるため、左のイベントが先に列挙される', () => {
    const board = createEmptyBoard();
    const y = BOARD_HEIGHT - 1;
    fillRow(board, y);
    setEvent(board, 5, y, 'heart');
    setEvent(board, 2, y, 'bomb');

    expect(collectEventsInRows(board, [y])).toEqual(['bomb', 'heart']);
  });

  it('複数行同時消しでも左優先で列挙される', () => {
    const board = createEmptyBoard();
    const y1 = BOARD_HEIGHT - 1;
    const y2 = BOARD_HEIGHT - 2;
    fillRow(board, y1);
    fillRow(board, y2);
    setEvent(board, 1, y1, 'coin');
    setEvent(board, 0, y2, 'clover');

    expect(collectEventsInRows(board, [y1, y2])).toEqual(['clover', 'coin']);
  });
});

describe('爆弾による下層削除', () => {
  it('最下層から指定行数を削除する', () => {
    const board = createEmptyBoard();
    fillRow(board, BOARD_HEIGHT - 1, 'I');
    fillRow(board, BOARD_HEIGHT - 2, 'J');
    fillRow(board, BOARD_HEIGHT - 3, 'L');

    const result = removeBottomRows(board, 2);
    expect(result.rows).toHaveLength(2);
    expect(cellAt(result.board, 0, BOARD_HEIGHT - 1)?.color).toBe('L');
  });
});

describe('重力', () => {
  it('浮いているブロックが下に落ちて隙間が埋まる', () => {
    const board = createEmptyBoard();
    const row = board[10];
    if (row !== undefined) row[3] = { color: 'S', event: null };

    const result = applyGravity(board);
    expect(result.moved).toBe(true);
    expect(cellAt(result.board, 3, BOARD_HEIGHT - 1)?.color).toBe('S');
    expect(cellAt(result.board, 3, 10)).toBeNull();
  });

  it('落下するブロックの移動一覧を求められる', () => {
    const board = createEmptyBoard();
    const a = board[8];
    const b = board[12];
    if (a !== undefined) a[2] = { color: 'I', event: null };
    if (b !== undefined) b[5] = { color: 'T', event: null };

    const moves = computeGravityMoves(board);
    expect(moves).toHaveLength(2);
    // どちらも最下段まで落ちる
    for (const move of moves) {
      expect(move.toY).toBe(BOARD_HEIGHT - 1);
      expect(move.toY).toBeGreaterThan(move.fromY);
    }
  });

  it('接地済みのブロックは移動一覧に含まれない', () => {
    const board = createEmptyBoard();
    fillRow(board, BOARD_HEIGHT - 1);
    expect(computeGravityMoves(board)).toHaveLength(0);
  });

  it('隙間がない場合は盤面を変更しない', () => {
    const board = createEmptyBoard();
    fillRow(board, BOARD_HEIGHT - 1);

    const result = applyGravity(board);
    expect(result.moved).toBe(false);
    expect(result.board).toBe(board);
  });
});
