/**
 * 対戦のおじゃま計算。
 *
 * 攻撃力は「標準テトリス準拠のライン消去」を土台に、
 * イベントスタックの発動を追加の大技として上乗せする方式。
 * ここも純関数だけで構成し、通信層からもそのまま使えるようにしてある。
 */
import {
  BOMB_EFFECTS,
  CLOVER_EFFECTS,
  COMBO_RATE_BASE,
  GARBAGE_B2B_BONUS,
  GARBAGE_COMBO_TABLE,
  GARBAGE_MAX_PER_PIECE,
  GARBAGE_PERFECT_CLEAR,
  GARBAGE_TABLE,
} from './config/balance';
import type { ClearType, EventKind } from './types';

export type AttackContext = {
  clearType: ClearType;
  /** 加算後のコンボ数（1回目の消去なら1） */
  combo: number;
  /** Back-to-Back が成立しているか */
  b2b: boolean;
  /** 盤面が空になったか */
  perfectClear: boolean;
  /** フィーバー中か。クローバー効果の倍率がかかる */
  feverActive: boolean;
  /** フィーバー中の攻撃倍率。1 なら補正なし */
  feverAttackRate: number;
};

/** コンボ数に応じた加算を引く */
export function getComboGarbage(combo: number): number {
  if (combo <= 0) return 0;
  const index = Math.min(combo, GARBAGE_COMBO_TABLE.length - 1);
  return GARBAGE_COMBO_TABLE[index] ?? 0;
}

/**
 * ライン消去1回で送るおじゃまの行数を求める。
 * 上限を設けて、1回の設置で盤面が即死しないようにする。
 */
export function computeAttack(ctx: AttackContext): number {
  let lines = GARBAGE_TABLE[ctx.clearType];

  if (ctx.b2b) lines += GARBAGE_B2B_BONUS;
  lines += getComboGarbage(ctx.combo);
  if (ctx.perfectClear) lines += GARBAGE_PERFECT_CLEAR;

  // フィーバー中はクローバーの強化ぶんだけ攻撃力が上がる
  if (ctx.feverActive && ctx.feverAttackRate > 1) {
    lines = Math.round(lines * ctx.feverAttackRate);
  }

  return Math.max(0, Math.min(GARBAGE_MAX_PER_PIECE, lines));
}

/**
 * イベントスタック発動による追加攻撃。
 *
 *   爆弾   … 消し飛ばした行数と同じだけ相手へ送る（最大の攻撃手段）
 *   クローバー … 直接は送らず、フィーバー中の攻撃倍率を上げる
 *   ハート / コイン … 攻撃しない（防御・自己強化のための札）
 */
export function computeStackAttack(kind: EventKind, count: number): number {
  if (kind !== 'bomb') return 0;
  const effect = BOMB_EFFECTS[count];
  return effect?.clearRows ?? 0;
}

/**
 * クローバー発動時のフィーバー攻撃倍率。
 * コンボ係数の上がり幅をそのまま攻撃力にも反映させ、
 * 「クローバーを積むと殴りが強くなる」を成立させる。
 */
export function getFeverAttackRate(kind: EventKind, count: number): number {
  if (kind !== 'clover') return 1;
  const effect = CLOVER_EFFECTS[count];
  if (effect == null) return 1;
  return attackRateFromComboRate(COMBO_RATE_BASE + effect.comboRateStep);
}

/**
 * フィーバー中のコンボ係数から攻撃倍率を求める。
 * クローバーの強化がそのまま殴りの強さに繋がるようにしてある。
 */
export function attackRateFromComboRate(comboRate: number): number {
  if (comboRate >= 0.25) return 1.5;
  if (comboRate >= 0.2) return 1.2;
  return 1;
}

/**
 * 送信と受信を相殺する。
 * 受け側に溜まっているおじゃまを、自分の攻撃で打ち消してから残りを送る。
 * 戻り値の pending は相殺後に自分が受ける残り、attack は相手へ送る残り。
 */
export function offsetGarbage(
  pending: number,
  attack: number,
): { pending: number; attack: number } {
  if (pending <= 0) return { pending: 0, attack };
  if (attack <= 0) return { pending, attack: 0 };

  const cancelled = Math.min(pending, attack);
  return { pending: pending - cancelled, attack: attack - cancelled };
}
