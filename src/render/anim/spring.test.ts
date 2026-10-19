import { describe, expect, it } from 'vitest';
import { jellyDeformation } from './spring';
import { CANDY_FX } from '../motion';

const sample = (t: number) =>
  jellyDeformation(
    t,
    CANDY_FX.compression,
    CANDY_FX.compressUntil,
    CANDY_FX.oscillations,
    CANDY_FX.damping,
  );

describe('jelly landing', () => {
  it('starts and ends at the logical footprint without a discontinuity at release', () => {
    expect(sample(0)).toBe(0);
    expect(sample(1)).toBe(0);
    expect(sample(CANDY_FX.compressUntil - 0.00001)).toBeCloseTo(sample(CANDY_FX.compressUntil), 4);
  });
  it('compresses, rebounds, then settles with smaller oscillations', () => {
    expect(sample(0.12)).toBeLessThan(-0.3);
    expect(sample(0.3)).toBeGreaterThan(0.05);
    expect(Math.abs(sample(0.8))).toBeLessThan(0.01);
    for (let i = 0; i <= 100; i++) expect(1 + sample(i / 100)).toBeGreaterThan(0.65);
  });
});
