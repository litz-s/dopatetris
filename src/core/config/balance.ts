/**
 * ゲームバランス数値の一元管理。
 * ロジック中にマジックナンバーを書かず、必ずここを参照する。調整はこのファイルだけで完結させる。
 */
import type { ClearType, EventKind } from '../types';

// ---------------------------------------------------------------- 盤面

export const BOARD_WIDTH = 10;
/** 可視領域の高さ */
export const BOARD_VISIBLE_HEIGHT = 20;
/** 上部の不可視バッファ */
export const BOARD_BUFFER_HEIGHT = 2;
export const BOARD_HEIGHT = BOARD_VISIBLE_HEIGHT + BOARD_BUFFER_HEIGHT;

// ---------------------------------------------------------------- 落下・ロック

/** 論理更新の固定タイムステップ（ミリ秒） */
export const FIXED_TIMESTEP_MS = 1000 / 60;

/** ロックディレイ（ミリ秒） */
export const LOCK_DELAY_MS = 500;
/** ロックディレイをリセットできる最大回数 */
export const MAX_LOCK_RESETS = 15;

/**
 * ソフトドロップ時の落下速度倍率。
 * ガイドラインの20倍は体感でほぼ即落下だったため、押した実感が残る12倍にしてある。
 */
export const SOFT_DROP_MULTIPLIER = 12;

/**
 * ソフトドロップの最短間隔（ミリ秒）。
 * 高レベルでは自然落下自体が速く、割り算だけだと1フレームに何十マスも落ちてしまう。
 * ここで下限を設けて操作可能な速さに保つ。
 */
export const SOFT_DROP_MIN_INTERVAL_MS = 35;

/**
 * 1ステップで落下できる最大マス数。
 * 落下間隔が急に短くなったときに一気に落ちるのを防ぐ安全弁。
 */
export const MAX_DROP_CELLS_PER_STEP = 2;

/** Next 表示数 */
export const NEXT_COUNT = 5;

/**
 * ライン消去アニメーション中の停止時間。
 *
 * デザイン仕様 04-A の元値は列遅延45ms（＝ポップ615ms・合計845ms）だが、
 * 一般的なテトリスの消去ディレイ（300〜500ms）より明らかに長く、
 * 高レベル帯でもたつくため 30ms に詰めてある。
 * ポップ480ms＋段落下230ms＝710ms。左→右に流れる見え方は保たれる。
 */
export const LINE_CLEAR_COLUMN_DELAY_MS = 30;
export const LINE_CLEAR_CELL_MS = 210;
export const LINE_CLEAR_POP_MS =
  LINE_CLEAR_COLUMN_DELAY_MS * (BOARD_WIDTH - 1) + LINE_CLEAR_CELL_MS;
export const LINE_CLEAR_DROP_MS = 230;
export const LINE_CLEAR_DELAY_MS = LINE_CLEAR_POP_MS + LINE_CLEAR_DROP_MS;

/**
 * 4列消しは左からのポップとは別演出になる（デザイン仕様 05-I）。
 * チャージ → 白い横スイープ → 圧縮消滅 → ひと呼吸置いてから段落下。
 * 「タメを作る」ための 60ms が入るぶん、通常の消去より長い。
 */
export const TETRIS_CHARGE_MS = 240;
export const TETRIS_WIPE_MS = 200;
export const TETRIS_COMPRESS_MS = 140;
export const TETRIS_HOLD_MS = 60;
export const TETRIS_CLEAR_POP_MS =
  TETRIS_CHARGE_MS + TETRIS_WIPE_MS + TETRIS_COMPRESS_MS + TETRIS_HOLD_MS;
export const TETRIS_CLEAR_DELAY_MS = TETRIS_CLEAR_POP_MS + LINE_CLEAR_DROP_MS;

/** 消した行数に応じた消去演出の停止時間 */
export function getClearDelayMs(rowCount: number): number {
  return rowCount >= 4 ? TETRIS_CLEAR_DELAY_MS : LINE_CLEAR_DELAY_MS;
}

/** 段落下が始まるまでの時間（演出の種類で変わる） */
export function getClearPopMs(rowCount: number): number {
  return rowCount >= 4 ? TETRIS_CLEAR_POP_MS : LINE_CLEAR_POP_MS;
}

/**
 * 重力（ハート3）の落下演出中の停止時間。
 * デザイン仕様 04-D: 列ごとに左→右へ32msずらし、1ブロック270msで落ちる。
 */
export const GRAVITY_COLUMN_DELAY_MS = 32;
export const GRAVITY_BLOCK_MS = 270;
export const GRAVITY_DELAY_MS = GRAVITY_COLUMN_DELAY_MS * (BOARD_WIDTH - 1) + GRAVITY_BLOCK_MS;

/**
 * レベルごとの自然落下間隔（ミリ秒）。ガイドライン準拠のカーブ。
 * レベルが表の長さを超えた場合は最終値を使う。
 */
export const GRAVITY_TABLE_MS: readonly number[] = [
  1000, 793, 618, 473, 355, 262, 190, 135, 94, 64, 43, 28, 18, 11, 7, 5, 4, 3, 2, 1.5, 1,
];

/** レベルアップに必要なライン数 */
export const LINES_PER_LEVEL = 10;

/**
 * 対戦（サバイバル）で、時間経過だけでレベルが上がる間隔。
 * ライン数によるレベルとの高い方が採用されるため、
 * 消さずに耐えているだけでは逃げ切れなくなる。
 */
export const TIME_PRESSURE_INTERVAL_MS = 25_000;

// ---------------------------------------------------------------- 入力

/** Delayed Auto Shift: キー長押しで連続移動が始まるまでの時間（ミリ秒） */
export const DAS_MS = 133;
/** Auto Repeat Rate: 連続移動の間隔（ミリ秒） */
export const ARR_MS = 10;

// ---------------------------------------------------------------- スコア

export const SCORE_TABLE = {
  single: 100,
  double: 300,
  triple: 500,
  tetris: 800,
  'tspin-mini': 100,
  'tspin-single': 800,
  'tspin-double': 1200,
  'tspin-triple': 1600,
} as const;

/** Back-to-Back 成立時の倍率 */
export const B2B_MULTIPLIER = 1.5;

/** コンボ1回あたりのスコア増加率（既定） */
export const COMBO_RATE_BASE = 0.15;

/** フィーバータイム中のスコア倍率 */
export const FEVER_SCORE_MULTIPLIER = 1.5;

/** ソフトドロップ1マスあたりの点 */
export const SOFT_DROP_POINT = 1;
/** ハードドロップ1マスあたりの点 */
export const HARD_DROP_POINT = 2;

// ---------------------------------------------------------------- 対戦（おじゃま）

/**
 * ライン消去1回あたりの基本おじゃま送信数。
 * 一般的なテトリスのガイドラインに合わせてある。
 */
export const GARBAGE_TABLE: Record<ClearType, number> = {
  single: 0,
  double: 1,
  triple: 2,
  tetris: 4,
  'tspin-mini': 0,
  'tspin-single': 2,
  'tspin-double': 4,
  'tspin-triple': 6,
};

/** Back-to-Back 成立時の加算 */
export const GARBAGE_B2B_BONUS = 1;

/** コンボ数に応じた加算。添字がコンボ数で、表を超えたら最終値 */
export const GARBAGE_COMBO_TABLE: readonly number[] = [0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5];

/** パーフェクトクリアの加算 */
export const GARBAGE_PERFECT_CLEAR = 10;

/** 1回の設置で送れるおじゃまの上限 */
export const GARBAGE_MAX_PER_PIECE = 12;

/** 受けたおじゃまが盤面に現れるまでの猶予（ミリ秒）。相殺の余地を作る */
export const GARBAGE_DELAY_MS = 900;

/** カレント種別と異なるイベントタイルを消したときのボーナス（× レベル） */
export const OFF_KIND_BONUS = 50;

/** 爆弾による列削除のスコア寄与（通常のライン消去に対する比率） */
export const BOMB_CLEAR_SCORE_RATIO = 0.5;

// ---------------------------------------------------------------- イベントスタック

/** スタックの上限 */
export const STACK_MAX = 4;

/** 種別ごとのスタック上限。未ロック時は STACK_MAX を表示・受付上限に使う。 */
export const STACK_MAX_BY_KIND: Readonly<Record<EventKind, number>> = {
  bomb: 4,
  heart: 3,
  coin: 3,
  clover: 4,
};

export function getStackMax(kind: EventKind | null): number {
  return kind === null ? STACK_MAX : STACK_MAX_BY_KIND[kind];
}

/** 発動後のクールタイム（ミリ秒） */
export const STACK_COOLDOWN_MS = 10_000;

/** 1つの 7-bag のうち、イベントタイルを埋め込むミノの個数 */
export const EVENT_TILES_PER_BAG = 2;

/** フィーバータイムの上限（ミリ秒）。重複発動時は加算されるがここで頭打ち */
export const FEVER_MAX_MS = 15_000;

/** 通常時のホールド可能回数 */
export const HOLD_CAPACITY = 1;

/**
 * 各イベントの段階別効果。添字はスタック数 1-4（0 番は未使用のため null）。
 * 仕様上未定義の段階は直下の定義済み段階へフォールバック済み。
 */
export type BombEffect = { clearRows: number; feverMs: number };
export type HeartEffect = { garbageReduction: number; gravity: boolean };
export type CoinEffect = { slowRate: number; durationMs: number };
export type CloverEffect = { feverMs: number; comboRateStep: number } | null;

export const BOMB_EFFECTS: readonly (BombEffect | null)[] = [
  null,
  { clearRows: 1, feverMs: 3000 },
  { clearRows: 2, feverMs: 5000 },
  { clearRows: 3, feverMs: 7000 },
  { clearRows: 4, feverMs: 9000 },
];

export const HEART_EFFECTS: readonly (HeartEffect | null)[] = [
  null,
  { garbageReduction: 1, gravity: false },
  { garbageReduction: 1, gravity: false }, // ハート2 はハート1 へフォールバック
  { garbageReduction: 1, gravity: true }, // ハート3 は1の効果も併せて発動
  null, // ハートのスタック上限は3
];

export const COIN_EFFECTS: readonly (CoinEffect | null)[] = [
  null,
  { slowRate: 0.1, durationMs: 7000 },
  { slowRate: 0.15, durationMs: 7000 },
  { slowRate: 0.2, durationMs: 7000 },
  null, // コインのスタック上限は3
];

export const CLOVER_EFFECTS: readonly CloverEffect[] = [
  null,
  null, // クローバー1 は不発（スタックを消費しない）
  { feverMs: 10_000, comboRateStep: 0.05 },
  { feverMs: 10_000, comboRateStep: 0.05 }, // クローバー3 は2の効果で全消費
  { feverMs: 10_000, comboRateStep: 0.15 },
];

/** 発動可能かどうか（不発の組み合わせを判定する） */
export function isTriggerable(kind: EventKind, count: number): boolean {
  if (count < 1 || count > getStackMax(kind)) return false;
  switch (kind) {
    case 'bomb':
      return BOMB_EFFECTS[count] != null;
    case 'heart':
      return HEART_EFFECTS[count] != null;
    case 'coin':
      return COIN_EFFECTS[count] != null;
    case 'clover':
      return CLOVER_EFFECTS[count] != null;
  }
}
