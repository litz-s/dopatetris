import { describe, expect, it } from 'vitest';
import { createGame, step } from './game';
import { FIXED_TIMESTEP_MS, TIME_PRESSURE_INTERVAL_MS } from './config/balance';
import type { GameState } from './types';

function falling(level: number): GameState {
  return {
    ...createGame(42),
    level,
    active: { type: 'I', rot: 0, x: 3, y: 0, eventKind: null, eventCellIndex: null },
  };
}

function frames(state: GameState, count: number, soft = true) {
  let current = state;
  let dropped = 0;
  let locked = false;
  for (let i = 0; i < count; i++) {
    const result = step(current, FIXED_TIMESTEP_MS, [{ kind: 'softDrop', active: soft }]);
    current = result.state;
    dropped += result.events.filter((e) => e.kind === 'softDropped').length;
    locked ||= result.events.some((e) => e.kind === 'pieceLocked');
  }
  return { state: current, dropped, locked };
}

describe('ソフトドロップのテンポ', () => {
  it('初期速度で20マスを約1秒かけて降り、着地後にも操作猶予を残す', () => {
    expect(frames(falling(1), 30).state.active?.y).toBe(10);
    const landed = frames(falling(1), 60);
    expect(landed.state.active?.y).toBe(20);
    expect(landed.dropped).toBe(20);
    expect(landed.state.score).toBe(20);
    expect(landed.locked).toBe(false);
    expect(landed.state.lockTimerMs).toBeGreaterThan(450);
  });

  it.each([
    [1, 6, 2],
    [5, 6, 5],
    [10, 1, 5],
  ])('レベル%iの自然落下間隔に同じ20倍を掛ける', (level, count, cells) => {
    expect(frames(falling(level!), count!).state.active?.y).toBe(cells);
  });

  it('マルチの時間加速でも同じ実効レベルの速度へ連動する', () => {
    const timed = { ...falling(1), timePressure: true, elapsedMs: TIME_PRESSURE_INTERVAL_MS * 4 };
    expect(frames(timed, 6).state.active?.y).toBe(frames(falling(5), 6).state.active?.y);
    expect(frames(timed, 6).state.active?.y).toBeGreaterThan(frames(falling(1), 6).state.active!.y);
  });

  it.each([
    [1, 6, 2, 1],
    [5, 6, 5, 2],
    [13, 1, 18, 9],
  ])('レベル%iでコインの減速後の自然落下速度へ20倍を掛ける', (level, count, cells, slowedCells) => {
    const normal = falling(level!);
    const slowed = { ...normal, slow: { until: 1e9, rate: 0.5 } };
    expect(frames(normal, count!).state.active?.y).toBe(cells);
    expect(frames(slowed, count!).state.active?.y).toBe(slowedCells);
  });

  it('最高速でも共通上限に詰まらず着地できるが、ハードドロップのように即固定しない', () => {
    const soft = frames(falling(21), 1);
    expect(soft.state.active?.y).toBe(20);
    expect(soft.dropped).toBe(20);
    expect(soft.locked).toBe(false);
    expect(soft.state.lockTimerMs).toBeGreaterThan(450);
    expect(frames(falling(21), 1, false).state.active?.y).toBe(2);
  });

  it('高速でも途中のブロックをすり抜けず、実際に降りた分だけ加点する', () => {
    const state = falling(21);
    for (let x = 3; x < 7; x++) state.board[10]![x] = { color: 'J', event: null };
    const landed = frames(state, 1);
    expect(landed.state.active?.y).toBe(8);
    expect(landed.state.score).toBe(8);
    expect(landed.locked).toBe(false);
  });

  it.each([1, 21])('レベル%iで離すと溜まった時間を捨てて自然落下へ戻る', (level) => {
    const state = { ...falling(level), softDropping: true, dropTimerMs: 100 };
    const released = step(state, 0, [{ kind: 'softDrop', active: false }]).state;
    expect(released.dropTimerMs).toBe(0);
    const natural = step(released, FIXED_TIMESTEP_MS);
    expect(natural.state.active!.y).toBe(level === 1 ? 0 : 2);
    expect(natural.state.score).toBe(0);
    expect(natural.events.some((e) => e.kind === 'softDropped')).toBe(false);
  });
});
