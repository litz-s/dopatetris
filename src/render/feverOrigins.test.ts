import { expect, it } from 'vitest';
import { feverOrigin } from './feverOrigins';

it('visits every interior zone, including the center, within 12 bursts', () => {
  const zones = new Set<string>();
  for (let i = 0; i < 12; i++) {
    const p = feverOrigin(i, 0.5, 0.5);
    zones.add(`${Math.floor(p.x * 3)},${Math.floor(p.y * 4)}`);
  }
  expect(zones.size).toBe(12);
});

it('keeps the most extreme jitter inside the board and repeats its cycle', () => {
  for (let i = 0; i < 24; i++) {
    for (const jitter of [0, 1]) {
      const p = feverOrigin(i, jitter, 1 - jitter);
      expect(p.x).toBeGreaterThan(0.06);
      expect(p.x).toBeLessThan(0.94);
      expect(p.y).toBeGreaterThanOrEqual(0.05);
      expect(p.y).toBeLessThan(0.951);
      expect(p).toEqual(feverOrigin(i + 12, jitter, 1 - jitter));
    }
  }
});
