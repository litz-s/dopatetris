import { describe, expect, it } from 'vitest';
import { canPlace, createEmptyBoard } from './board';
import { createGame, step } from './game';
import { getKicks, getShape, getSpawnPosition } from './pieces';
import { createRng } from './rng';
import { drawNext, refillBag } from './spawner';
import { BOARD_WIDTH, getClearDelayMs } from './config/balance';
import { MINO_TYPES } from './types';
import type { GameState, MinoType, Rotation } from './types';

function lineState(rows: number, b2b = false): GameState {
  const state = createGame(42);
  const board = createEmptyBoard();
  for (let y = 22 - rows; y < 22; y++) {
    for (let x = 1; x < BOARD_WIDTH; x++) board[y]![x] = { color: 'J', event: null };
  }
  return {
    ...state,
    board,
    b2b,
    active: { type: 'I', rot: 1, x: -2, y: 18, eventCellIndex: null, eventKind: null },
  };
}

describe('SRS reference tables (FUN 2024, Tables 2/3; y converted to screen coordinates)', () => {
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
  const jl = [
    [
      [0, 0],
      [-1, 0],
      [-1, -1],
      [0, 2],
      [-1, 2],
    ],
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, -2],
      [1, -2],
    ],
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, -2],
      [1, -2],
    ],
    [
      [0, 0],
      [-1, 0],
      [-1, -1],
      [0, 2],
      [-1, 2],
    ],
    [
      [0, 0],
      [1, 0],
      [1, -1],
      [0, 2],
      [1, 2],
    ],
    [
      [0, 0],
      [-1, 0],
      [-1, 1],
      [0, -2],
      [-1, -2],
    ],
    [
      [0, 0],
      [-1, 0],
      [-1, 1],
      [0, -2],
      [-1, -2],
    ],
    [
      [0, 0],
      [1, 0],
      [1, -1],
      [0, 2],
      [1, 2],
    ],
  ];
  const i = [
    [
      [0, 0],
      [-2, 0],
      [1, 0],
      [-2, 1],
      [1, -2],
    ],
    [
      [0, 0],
      [2, 0],
      [-1, 0],
      [2, -1],
      [-1, 2],
    ],
    [
      [0, 0],
      [-1, 0],
      [2, 0],
      [-1, -2],
      [2, 1],
    ],
    [
      [0, 0],
      [1, 0],
      [-2, 0],
      [1, 2],
      [-2, -1],
    ],
    [
      [0, 0],
      [2, 0],
      [-1, 0],
      [2, -1],
      [-1, 2],
    ],
    [
      [0, 0],
      [-2, 0],
      [1, 0],
      [-2, 1],
      [1, -2],
    ],
    [
      [0, 0],
      [1, 0],
      [-2, 0],
      [1, 2],
      [-2, -1],
    ],
    [
      [0, 0],
      [-1, 0],
      [2, 0],
      [-1, -2],
      [2, 1],
    ],
  ];
  it.each(['J', 'L', 'S', 'T', 'Z', 'I'] as MinoType[])(
    '%s tests every offset in the documented order',
    (type) => {
      transitions.forEach(([from, to], index) => {
        expect(getKicks(type, from, to)).toEqual((type === 'I' ? i : jl)[index]);
      });
    },
  );
});

describe('basic rule integration', () => {
  it('700 consecutive draws have one of each piece per bag, with drought at most 12', () => {
    let { rng, bag } = refillBag(createRng(871));
    const sequence: MinoType[] = [];
    for (let n = 0; n < 700; n++) {
      const drawn = drawNext(rng, bag);
      sequence.push(drawn.type);
      rng = drawn.rng;
      bag = drawn.bag;
    }
    for (let n = 0; n < sequence.length; n += 7) {
      expect([...new Set(sequence.slice(n, n + 7))].sort()).toEqual([...MINO_TYPES].sort());
    }
    for (const type of MINO_TYPES) {
      let previous = -1;
      sequence.forEach((piece, index) => {
        if (piece !== type) return;
        if (previous >= 0) expect(index - previous - 1).toBeLessThanOrEqual(12);
        previous = index;
      });
    }
  });

  it('all spawns fit and hold restores the spawn orientation exactly once per lock', () => {
    for (const type of MINO_TYPES) {
      const spawn = getSpawnPosition(type);
      expect(canPlace(createEmptyBoard(), type, 0, spawn.x, spawn.y)).toBe(true);
    }
    const held = step(createGame(42), 0, [{ kind: 'hold' }]).state;
    expect(step(held, 0, [{ kind: 'hold' }]).state.hold).toEqual(held.hold);
    const locked = step(held, 0, [{ kind: 'hardDrop' }]).state;
    expect(locked.holdUsed).toBe(0);
    expect(step(locked, 0, [{ kind: 'hold' }]).state.active?.rot).toBe(0);
  });

  it('ends the game when the next piece overlaps its spawn, as specified for this game', () => {
    const state = lineState(0);
    const type = state.next[0]!.type;
    const spawn = getSpawnPosition(type);
    const [dx, dy] = getShape(type, 0)[0]!;
    state.board[spawn.y + dy]![spawn.x + dx] = { color: 'J', event: null };
    const result = step(state, 0, [{ kind: 'hardDrop' }]);
    expect(result.state.status).toBe('over');
    expect(result.state.active).toBeNull();
    expect(result.events.some((e) => e.kind === 'gameOver')).toBe(true);
  });

  it('B2B survives a no-clear placement and breaks on a normal clear', () => {
    const hard = step(lineState(4), 0, [{ kind: 'hardDrop' }]).state;
    expect(hard.b2b).toBe(true);
    const ready = step(hard, getClearDelayMs(4)).state;
    const none = step(ready, 0, [{ kind: 'hardDrop' }]).state;
    expect(none.b2b).toBe(true);
    const ordinary = step(lineState(1, true), 0, [{ kind: 'hardDrop' }]);
    expect(ordinary.state.b2b).toBe(false);
    expect(ordinary.events.find((e) => e.kind === 'linesCleared')).toMatchObject({
      score: 100,
      b2b: false,
    });
  });

  it('a second difficult clear receives B2B, without awarding it on the first', () => {
    for (const previous of [false, true]) {
      const result = step(lineState(4, previous), 0, [{ kind: 'hardDrop' }]);
      expect(result.events.find((e) => e.kind === 'linesCleared')).toMatchObject({
        score: previous ? 1200 : 800,
        b2b: previous,
      });
    }
  });

  it('blocks the rest of an input batch as soon as line clearing starts', () => {
    const state = { ...lineState(1), stack: { kind: 'bomb' as const, count: 2, cooldownUntil: 0 } };
    const result = step(state, 0, [{ kind: 'hardDrop' }, { kind: 'triggerStack' }]);
    expect(result.state.clearing?.rows).toEqual([21]);
    expect(result.events.some((e) => e.kind === 'bombCleared')).toBe(false);
    expect(result.state.stack.count).toBe(2);
  });

  it('does not hard-drop an active piece during a gravity animation started in the same batch', () => {
    const state = createGame(42);
    state.board[10]![0] = { color: 'S', event: null };
    state.stack = { kind: 'heart', count: 3, cooldownUntil: 0 };
    const result = step(state, 0, [{ kind: 'triggerStack' }, { kind: 'hardDrop' }]);
    expect(result.state.gravity).not.toBeNull();
    expect(result.events.some((e) => e.kind === 'pieceLocked')).toBe(false);
    expect(result.state.active).toEqual(state.active);
  });

  it.each([false, true])(
    'garbage overflow ends play without spawning another piece (after clear: %s)',
    (clear) => {
      const state = lineState(clear ? 1 : 0);
      // Corner block does not overlap any spawn, but garbage pushes it out.
      state.board[0]![0] = { color: 'J', event: null };
      state.pendingGarbage = [{ lines: clear ? 2 : 1, holeColumn: 0, readyAt: 0 }];
      let result = step(state, 0, [{ kind: 'hardDrop' }]);
      if (clear) result = step(result.state, getClearDelayMs(1));
      expect(result.state.status).toBe('over');
      expect(result.state.active).toBeNull();
      expect(result.events.filter((e) => e.kind === 'gameOver')).toHaveLength(1);
      expect(result.events.some((e) => e.kind === 'pieceSpawned')).toBe(false);
    },
  );

  it('checks overflow cumulatively across garbage packets and permits safe insertion', () => {
    for (const top of [1, 2]) {
      const state = lineState(0);
      state.board[top]![0] = { color: 'J', event: null };
      state.pendingGarbage = [
        { lines: 1, holeColumn: 0, readyAt: 0 },
        { lines: 1, holeColumn: 0, readyAt: 0 },
      ];
      const result = step(state, 0, [{ kind: 'hardDrop' }]);
      expect(result.state.status).toBe(top === 1 ? 'over' : 'playing');
    }
  });
});
