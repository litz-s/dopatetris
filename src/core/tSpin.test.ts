import { describe, expect, it } from 'vitest';
import { createEmptyBoard } from './board';
import { classifyTSpin } from './tSpin';
import type { ActivePiece, Rotation } from './types';

const piece: ActivePiece = {
  type: 'T',
  rot: 0,
  x: 3,
  y: 8,
  eventCellIndex: null,
  eventKind: null,
};
const positions = [
  [3, 8],
  [5, 8],
  [5, 10],
  [3, 10],
] as const;
function boardWith(...corners: number[]) {
  const board = createEmptyBoard();
  for (const index of corners) {
    const [x, y] = positions[index]!;
    board[y]![x] = { color: 'J', event: null };
  }
  return board;
}

describe('T-Spin corner / Mini rules', () => {
  it.each([
    [0, [0, 1, 2], [0, 2, 3]],
    [1, [1, 2, 3], [0, 1, 3]],
    [2, [0, 2, 3], [0, 1, 2]],
    [3, [0, 1, 3], [1, 2, 3]],
  ] as const)('orientation %i uses its facing corners', (rot, full, mini) => {
    expect(classifyTSpin(boardWith(...full), { ...piece, rot }, true, 0)).toBe('full');
    for (const kick of [0, 1, 2, 3]) {
      expect(classifyTSpin(boardWith(...mini), { ...piece, rot }, true, kick)).toBe('mini');
    }
    // Fin/TST: fifth candidate overrides only the front-corner test.
    expect(classifyTSpin(boardWith(...mini), { ...piece, rot }, true, 4)).toBe('full');
  });

  it('even the fifth kick needs three corners and a final rotation', () => {
    expect(classifyTSpin(boardWith(0, 1), piece, true, 4)).toBe('none');
    expect(classifyTSpin(boardWith(0, 1, 2), piece, false, 4)).toBe('none');
    expect(classifyTSpin(boardWith(0, 1, 2), { ...piece, type: 'J' }, true, 4)).toBe('none');
  });

  it('four occupied corners are full in every orientation', () => {
    for (const rot of [0, 1, 2, 3] as Rotation[]) {
      expect(classifyTSpin(boardWith(0, 1, 2, 3), { ...piece, rot }, true, 0)).toBe('full');
    }
  });

  it('the floor and walls count as occupied, without mutating the board', () => {
    const board = createEmptyBoard();
    board[20]![3] = { color: 'J', event: null };
    board[10]![1] = { color: 'J', event: null };
    const before = JSON.stringify(board);
    expect(classifyTSpin(board, { ...piece, rot: 0, y: 20 }, true, 0)).toBe('mini');
    expect(classifyTSpin(board, { ...piece, rot: 1, x: -1 }, true, 0)).toBe('mini');
    expect(JSON.stringify(board)).toBe(before);
  });
});
