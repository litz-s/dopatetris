/**
 * 05 HYPE MOMENTS の文字グラフィック。
 *
 * 盤面の中身は Canvas が描くが、T-SPIN / TETRIS のバッジとスコアポップは
 * 大きな文字を扱うため DOM 側で描く。フォント（Bungee / Press Start 2P）を
 * そのまま使えるのと、字詰めがきれいに出るのが理由。
 */
import { BOARD_BUFFER_HEIGHT, BOARD_WIDTH } from '@core/config/balance';
import type { GameEvent } from '@core/events';
import type { ClearType } from '@core/types';
import { SCORE_POP, TSPIN, TETRIS_FX } from '@render/motion';

/** スコアポップの段階。デザイン仕様 05-J の色分けに対応する */
export type ScoreTier = 'double' | 'triple' | 'gold';

export type HypeEvent =
  /** T-SPIN バッジ */
  | { id: number; kind: 'tspin'; label: string; tier: number; endsAt: number }
  /** TETRIS の文字 */
  | { id: number; kind: 'tetris'; endsAt: number }
  /** 消した場所に叩き出すスコア */
  | {
      id: number;
      kind: 'score';
      amount: number;
      /** 盤面座標での中心（可視領域基準、セル単位） */
      cellX: number;
      cellY: number;
      tier: ScoreTier;
      tags: string[];
      endsAt: number;
    };

let nextId = 1;

/** T-Spin の表示名。SINGLE / DOUBLE / TRIPLE */
function tspinLabel(clearType: ClearType): string {
  switch (clearType) {
    case 'tspin-triple':
      return 'TRIPLE';
    case 'tspin-double':
      return 'DOUBLE';
    case 'tspin-mini':
      return 'MINI';
    default:
      return 'SINGLE';
  }
}

function tspinTier(clearType: ClearType): number {
  if (clearType === 'tspin-triple') return 2;
  if (clearType === 'tspin-double') return 1;
  return 0;
}

/** 段階色。2列シアン／3列マゼンタ／4列・T-Spin ゴールド */
function scoreTier(rows: number, isTspin: boolean): ScoreTier {
  if (isTspin || rows >= 4) return 'gold';
  if (rows === 3) return 'triple';
  return 'double';
}

/** バッジ表示の総時間。スラムイン→保持→上へ抜ける */
export const TSPIN_BADGE_MS = TSPIN.badgeSlamMs + TSPIN.badgeHoldMs + TSPIN.badgeExitMs;
export const TETRIS_WORD_MS = TETRIS_FX.wordSlamMs + TETRIS_FX.wordHoldMs + 220;

/**
 * core のイベントから、画面に出す文字グラフィックを組み立てる。
 * 消えた行の重心を出現位置にするため、rows をそのまま使う。
 */
export function buildHypeEvents(
  events: readonly GameEvent[],
  now: number,
  comboRate: number,
  feverActive: boolean,
): HypeEvent[] {
  const result: HypeEvent[] = [];

  for (const event of events) {
    if (event.kind !== 'linesCleared') continue;

    const isTspin = event.clearType.startsWith('tspin');
    const rowCount = event.rows.length;

    if (isTspin) {
      result.push({
        id: nextId++,
        kind: 'tspin',
        label: tspinLabel(event.clearType),
        tier: tspinTier(event.clearType),
        endsAt: now + TSPIN_BADGE_MS,
      });
    } else if (rowCount >= 4) {
      result.push({
        id: nextId++,
        kind: 'tetris',
        endsAt: now + TETRIS_WORD_MS,
      });
    }

    // スコアポップは2列以上のみ。1列は既存の小さいポップに任せる
    if (rowCount < SCORE_POP.minRows) continue;

    // 消えた行の重心。複数行なら平均を取る
    let sum = 0;
    for (const row of event.rows) sum += row;
    const centerRow = sum / event.rows.length - BOARD_BUFFER_HEIGHT;

    const tags: string[] = [];
    if (isTspin) tags.push(`T-SPIN ${tspinLabel(event.clearType)}`);
    else if (rowCount >= 4) tags.push('TETRIS');
    else if (rowCount === 3) tags.push('TRIPLE');
    else tags.push('DOUBLE');

    if (event.combo > 1) {
      tags.push(`×${(1 + comboRate * (event.combo - 1)).toFixed(2)}`);
      tags.push(`COMBO ${event.combo}`);
    }
    if (feverActive) tags.push('FEVER ×1.5');
    if (event.b2b) tags.push('B2B');

    result.push({
      id: nextId++,
      kind: 'score',
      amount: event.score,
      cellX: BOARD_WIDTH / 2,
      cellY: centerRow + 0.5,
      tier: scoreTier(rowCount, isTspin),
      tags,
      endsAt: now + SCORE_POP.totalMs,
    });
  }

  return result;
}
