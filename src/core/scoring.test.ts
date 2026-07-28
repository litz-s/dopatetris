import { describe, expect, it } from 'vitest';
import { computeClearBreakdown, computeClearScore, resolveClearType } from './scoring';
import { COMBO_RATE_BASE, FEVER_SCORE_MULTIPLIER, SCORE_TABLE } from './config/balance';
import type { ScoreContext } from './scoring';

const BASE: ScoreContext = {
  clearType: 'single',
  level: 1,
  combo: 0,
  feverActive: false,
  feverComboRate: 0.15,
  b2b: false,
};

describe('スコア計算', () => {
  it('コンボ0・非フィーバーなら素点そのまま', () => {
    expect(computeClearScore({ ...BASE, clearType: 'tetris' })).toBe(SCORE_TABLE.tetris);
  });

  it('レベルが上がるほど素点が増える', () => {
    const lv1 = computeClearScore({ ...BASE, level: 1 });
    const lv5 = computeClearScore({ ...BASE, level: 5 });
    expect(lv5).toBe(lv1 * 5);
  });

  it('コンボ倍率は 1 + 0.15 × コンボ数', () => {
    const score = computeClearScore({ ...BASE, combo: 4 });
    expect(score).toBe(Math.round(SCORE_TABLE.single * (1 + COMBO_RATE_BASE * 4)));
  });

  it('フィーバー中はさらに1.5倍', () => {
    const normal = computeClearScore(BASE);
    const fever = computeClearScore({ ...BASE, feverActive: true });
    expect(fever).toBe(Math.round(normal * FEVER_SCORE_MULTIPLIER));
  });

  it('クローバー以外のフィーバーでは不正な0指定でもコンボ係数を0.15未満にしない', () => {
    const score = computeClearScore({
      ...BASE,
      combo: 4,
      feverActive: true,
      feverComboRate: 0,
    });
    const expected = Math.round(
      SCORE_TABLE.single * (1 + COMBO_RATE_BASE * 4) * FEVER_SCORE_MULTIPLIER,
    );
    expect(score).toBe(expected);
  });

  it('クローバー効果でフィーバー中のコンボ係数が上がる', () => {
    const base = computeClearScore({ ...BASE, combo: 10, feverActive: true, feverComboRate: 0.15 });
    const boosted = computeClearScore({
      ...BASE,
      combo: 10,
      feverActive: true,
      feverComboRate: 0.25,
    });
    expect(boosted).toBeGreaterThan(base);
  });
});

describe('スコア内訳', () => {
  it('内訳の合計は必ず総額と一致する', () => {
    const cases: ScoreContext[] = [
      BASE,
      { ...BASE, clearType: 'tetris', combo: 7, feverActive: true, b2b: true },
      { ...BASE, clearType: 'tspin-double', level: 9, combo: 13, feverComboRate: 0.25 },
      { ...BASE, clearType: 'triple', level: 4, combo: 1, feverActive: true, feverComboRate: 0.2 },
    ];

    for (const ctx of cases) {
      const breakdown = computeClearBreakdown(ctx);
      expect(breakdown.lines + breakdown.combo + breakdown.fever).toBe(breakdown.total);
    }
  });

  it('コンボ0なら コンボ増分は0', () => {
    expect(computeClearBreakdown(BASE).combo).toBe(0);
  });

  it('非フィーバーなら フィーバー増分は0', () => {
    expect(computeClearBreakdown({ ...BASE, combo: 5 }).fever).toBe(0);
  });

  it('内訳の各項目は負にならない', () => {
    const breakdown = computeClearBreakdown({
      ...BASE,
      clearType: 'tetris',
      combo: 20,
      feverActive: true,
      b2b: true,
    });
    expect(breakdown.lines).toBeGreaterThanOrEqual(0);
    expect(breakdown.combo).toBeGreaterThanOrEqual(0);
    expect(breakdown.fever).toBeGreaterThanOrEqual(0);
  });
});

describe('消去種別の判定', () => {
  it('行数から通常の種別を求める', () => {
    expect(resolveClearType(1, 'none')).toBe('single');
    expect(resolveClearType(4, 'none')).toBe('tetris');
  });

  it('T-Spin成立時は専用の種別になる', () => {
    expect(resolveClearType(2, 'full')).toBe('tspin-double');
    expect(resolveClearType(1, 'mini')).toBe('tspin-mini');
  });

  it('消去0行なら null', () => {
    expect(resolveClearType(0, 'none')).toBeNull();
  });
});
