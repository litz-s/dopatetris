import { describe, expect, it } from 'vitest';
import { createGame } from '@core/game';
import { GameRenderer } from './gameRenderer';
import type { GameEvent } from '@core/events';

const spin: GameEvent[] = [
  { kind: 'pieceLocked', x: 3, y: 19, rot: 0, type: 'T', hard: true },
  {
    kind: 'linesCleared',
    rows: [20, 21],
    clearType: 'tspin-double',
    combo: 8,
    b2b: true,
    score: 2400,
  },
];

describe('reward effects budgets', () => {
  it('emits Spin stars, expires them, and never changes game state', () => {
    const state = createGame(42);
    const before = JSON.stringify(state);
    const renderer = new GameRenderer();
    renderer.handleEvents(spin, state);
    expect(renderer.getParticleCount()).toBeGreaterThan(40);
    renderer.update(2000);
    expect(renderer.getParticleCount()).toBe(0);
    expect(JSON.stringify(state)).toBe(before);
  });
  it('obeys zero particles on the first event, without waiting for update', () => {
    const renderer = new GameRenderer();
    renderer.quality.setSettings({ particleScale: 0 });
    renderer.handleEvents(spin, createGame(42));
    expect(renderer.getParticleCount()).toBe(0);
  });
  it('disables new effects in LOW and reduces them for reduced motion', () => {
    const low = new GameRenderer();
    low.quality.forceTier('LOW');
    low.handleEvents(spin, createGame(42));
    expect(low.getParticleCount()).toBe(0);
    const normal = new GameRenderer();
    const reduced = new GameRenderer();
    reduced.quality.setReducedMotion(true);
    normal.handleEvents(spin, createGame(42));
    reduced.handleEvents(spin, createGame(42));
    expect(reduced.getParticleCount()).toBeLessThan(normal.getParticleCount());
  });
  it('keeps repeated fever and bomb bursts within the pool limit', () => {
    const renderer = new GameRenderer();
    const state = createGame(42);
    state.fever.until = 100000;
    for (let i = 0; i < 60; i++) {
      renderer.handleEvents([...spin, { kind: 'bombCleared', rows: [18, 19, 20, 21] }], state);
      renderer.update(16);
      expect(renderer.getParticleCount()).toBeLessThanOrEqual(210);
    }
    renderer.detach();
    expect(renderer.getParticleCount()).toBe(0);
  });

  it('disables continuous fever blooms in LOW and at zero particle strength', () => {
    const state = createGame(42);
    state.fever.until = 100000;
    for (const mode of ['LOW', 'zero'] as const) {
      const renderer = new GameRenderer();
      if (mode === 'LOW') renderer.quality.forceTier('LOW');
      else renderer.quality.setSettings({ particleScale: 0 });
      renderer.handleEvents([], state);
      for (let frame = 0; frame < 120; frame++) renderer.update(16.667);
      expect(renderer.getParticleCount()).toBe(0);
    }
  });

  it('ends continuous fever particles after fever ends, and respects reduced motion', () => {
    const state = createGame(42);
    state.fever.until = 100000;
    const normal = new GameRenderer();
    const reduced = new GameRenderer();
    reduced.quality.setReducedMotion(true);
    for (const renderer of [normal, reduced]) {
      renderer.handleEvents([], state);
      for (let frame = 0; frame < 120; frame++) renderer.update(16.667);
    }
    expect(normal.getParticleCount()).toBeGreaterThan(0);
    expect(reduced.getParticleCount()).toBeLessThan(normal.getParticleCount());
    normal.handleEvents([], createGame(42));
    normal.update(2000);
    expect(normal.getParticleCount()).toBe(0);
  });
});
