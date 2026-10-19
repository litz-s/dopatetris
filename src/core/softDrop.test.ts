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
  it.each([1, 5, 12])('レベル%iでも通常は100msで5マス、400msで20マス', (level) => {
    expect(frames(falling(level), 6).state.active?.y).toBe(5);
    const landed = frames(falling(level), 24);
    expect(landed.state.active?.y).toBe(20);
    expect(landed.dropped).toBe(20);
    expect(landed.state.score).toBe(20);
    expect(landed.locked).toBe(false);
    expect(landed.state.lockTimerMs).toBeGreaterThan(450);
    expect(frames(falling(level), 1).state.active?.y).toBeLessThan(20);
  });

  it('マルチの時間経過だけでは基準速度が変わらない', () => {
    const timed = { ...falling(1), timePressure: true, elapsedMs: TIME_PRESSURE_INTERVAL_MS * 10 };
    expect(frames(timed, 6).state.active?.y).toBe(5);
  });

  it.each([1, 12, 13, 21])('レベル%iでもコインの減速はソフトに影響しない', (level) => {
    const normal = falling(level);
    const slowed = { ...normal, slow: { until: 1e9, rate: 0.75 } };
    expect(frames(slowed, 6).state.active?.y).toBe(frames(normal, 6).state.active?.y);
  });

  it('高レベルでは自然落下より速く、最高速でも共通上限に詰まらない', () => {
    for (const level of [13, 14, 15, 21]) {
      const soft = frames(falling(level), 6).state;
      const natural = frames(falling(level), 6, false).state;
      expect(soft.active!.y).toBeGreaterThan(natural.active!.y);
    }
    // Seven frames: 14 natural cells vs floor(14 * 1.25) = 17 soft cells.
    expect(frames(falling(21), 7).state.active?.y).toBe(17);
    expect(frames(falling(21), 7, false).state.active?.y).toBe(14);
  });

  it('基準速度を超える時間加速でも自然落下より速くする', () => {
    const fastest = {
      ...falling(1),
      timePressure: true,
      elapsedMs: TIME_PRESSURE_INTERVAL_MS * 30,
    };
    expect(frames(fastest, 7).state.active?.y).toBe(17);
  });

  it.each([1, 21])('レベル%iで離すと溜まった時間を捨てて自然落下へ戻る', (level) => {
    const soft = frames(falling(level), 6).state;
    const released = step(soft, 0, [{ kind: 'softDrop', active: false }]).state;
    expect(released.dropTimerMs).toBe(0);
    const natural = step(released, FIXED_TIMESTEP_MS);
    expect(natural.state.active!.y - released.active!.y).toBe(level === 1 ? 0 : 2);
    expect(natural.state.score).toBe(soft.score);
    expect(natural.events.some((e) => e.kind === 'softDropped')).toBe(false);
  });
});
