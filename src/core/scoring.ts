/**
 * スコア計算。仕様書 3-4 に対応する。
 *
 *   獲得スコア = 基礎点 × コンボ倍率 × フィーバー倍率 × B2B倍率
 *   コンボ倍率 = 1 + コンボ係数 × コンボ数
 */
import {
  B2B_MULTIPLIER,
  COMBO_RATE_BASE,
  FEVER_SCORE_MULTIPLIER,
  SCORE_TABLE,
} from './config/balance';
import type { ClearType } from './types';

export type ScoreContext = {
  /** 消去の種類 */
  clearType: ClearType;
  level: number;
  /** 加算前のコンボ数（0 なら初回消去） */
  combo: number;
  /** フィーバー中か */
  feverActive: boolean;
  /** フィーバー中に適用されるコンボ係数。非フィーバー時は既定値が使われる */
  feverComboRate: number;
  /** Back-to-Back 成立中か */
  b2b: boolean;
};

/** 現在有効なコンボ係数を返す */
export function getComboRate(feverActive: boolean, feverComboRate: number): number {
  return feverActive ? feverComboRate : COMBO_RATE_BASE;
}

/**
 * ライン消去1回分のスコアを、リザルト画面の内訳表示に使える形で返す。
 *
 *   total = base × コンボ倍率 × フィーバー倍率
 *
 * 内訳は「素点」「コンボ倍率で増えたぶん」「フィーバー倍率で増えたぶん」に分解する。
 * 3つの合計は必ず total と一致する（端数は fever 側で吸収する）。
 */
export type ScoreBreakdown = {
  total: number;
  /** 素点（B2B倍率込み） */
  lines: number;
  /** コンボ倍率による増分 */
  combo: number;
  /** フィーバー倍率による増分 */
  fever: number;
};

export function computeClearBreakdown(ctx: ScoreContext): ScoreBreakdown {
  const b2bMultiplier = ctx.b2b && isB2bEligible(ctx.clearType) ? B2B_MULTIPLIER : 1;
  const base = SCORE_TABLE[ctx.clearType] * Math.max(1, ctx.level) * b2bMultiplier;

  const comboRate = getComboRate(ctx.feverActive, ctx.feverComboRate);
  const comboMultiplier = 1 + comboRate * ctx.combo;
  const feverMultiplier = ctx.feverActive ? FEVER_SCORE_MULTIPLIER : 1;

  const lines = Math.round(base);
  const withCombo = Math.round(base * comboMultiplier);
  const total = Math.round(base * comboMultiplier * feverMultiplier);

  return {
    total,
    lines,
    combo: withCombo - lines,
    fever: total - withCombo,
  };
}

/** ライン消去1回分のスコアを返す */
export function computeClearScore(ctx: ScoreContext): number {
  return computeClearBreakdown(ctx).total;
}

/** Back-to-Back の対象となる消去か（テトリスと T-Spin 系） */
export function isB2bEligible(clearType: ClearType): boolean {
  return clearType === 'tetris' || clearType.startsWith('tspin');
}

/** 消去行数から通常消去の種類を求める */
export function clearTypeFromLines(lines: number): ClearType | null {
  switch (lines) {
    case 1:
      return 'single';
    case 2:
      return 'double';
    case 3:
      return 'triple';
    case 4:
      return 'tetris';
    default:
      return null;
  }
}

/** T-Spin 判定込みで消去の種類を求める */
export function resolveClearType(lines: number, tspin: 'none' | 'mini' | 'full'): ClearType | null {
  if (lines === 0) return null;
  if (tspin === 'full') {
    if (lines === 1) return 'tspin-single';
    if (lines === 2) return 'tspin-double';
    if (lines >= 3) return 'tspin-triple';
  }
  if (tspin === 'mini') return 'tspin-mini';
  return clearTypeFromLines(lines);
}
