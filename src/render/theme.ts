/**
 * デザイントークン。出典は docs/design/design-spec.html（02 TOKENS）。
 *
 * 中心原則: **光るのはブラウン管の中だけ。**
 * クリーム樹脂の筐体面には glow を一切かけず、厚み影 `0 5px 0 #C3B69C` だけで立体を出す。
 */
import type { EventKind, MinoType } from '@core/types';

/** SURFACE / 筐体（発光しない） */
export const SURFACE = {
  page: '#ded3bd',
  plate: '#efe6d2',
  panel: '#e5dac3',
  /** 枠線兼・厚み影 */
  border: '#c3b69c',
  borderDark: '#b8ab92',
  well: '#cdc1a9',
  muted: '#8d8271',
  ink: '#23201c',
  inkDeep: '#14120f',
  inkSoft: '#3d372f',
} as const;

/** SCREEN / ブラウン管内（ここだけ発光） */
export const SCREEN = {
  board: '#07040c',
  bezel: '#302b25',
  bezelShadow: '#1d1a16',
  boardBorder: '#14181c',
  text: '#e8dcc4',
} as const;

/** NEON / アクセント（画面内・強調） */
export const NEON = {
  /** bomb / combo */
  magenta: '#ff2f92',
  /** ghost / key */
  cyan: '#00e5ff',
  /** score / coin / fever */
  yellow: '#ffe600',
  /** clover / OK */
  green: '#34d94b',
} as const;

/** クリーム面上の可読アクセント（暗いバージョン） */
export const ACCENT = {
  magenta: '#c4116a',
  cyan: '#0090a8',
} as const;

/** ミノの色。design-spec 03 TILES より */
export const MINO_COLORS: Record<MinoType, string> = {
  I: '#00e5ff',
  O: '#ffe600',
  T: '#a855ff',
  S: '#34d94b',
  Z: '#ff5a2f',
  J: '#3a7bff',
  L: '#ff2f92',
};

/**
 * おじゃまブロックの色。
 * ミノ7色のどれとも被らない無彩色にして、自分で置いたブロックと即座に見分けられるようにする。
 */
export const GARBAGE_COLOR = '#6b6157';

/** イベントタイルの地色。ミノ色を上書きする */
export const EVENT_COLORS: Record<EventKind, string> = {
  bomb: '#ff2f92',
  heart: '#ff5a7a',
  coin: '#ffe600',
  clover: '#34d94b',
};

/** イベント記号に使う暗色（コントラスト確保） */
export const EVENT_SYMBOL_COLORS: Record<EventKind, string> = {
  bomb: '#180008',
  heart: '#3a000c',
  coin: '#2a2000',
  clover: '#062d0c',
};

/** イベント記号。ドット絵ではなく記号を用いる（デザイン案準拠） */
export const EVENT_SYMBOLS: Record<EventKind, string> = {
  bomb: '●',
  heart: '♥',
  coin: '◎',
  clover: '✦',
};

/** 待機時の呼吸パルス周期（ミリ秒）。種別ごとにずらして単調さを避ける */
export const EVENT_PULSE_MS: Record<EventKind, number> = {
  bomb: 900,
  heart: 1100,
  coin: 1000,
  clover: 1200,
};

/**
 * GLOW 規則。
 * L1 待機 / L2 有効 / L3 発動・フィーバー の3段階のみを使う。
 */
export const GLOW = {
  L1: { blur: 12, alpha: 0.35 },
  L2: { blur: 22, alpha: 0.7 },
  L3: { blur: 44, alpha: 0.95 },
} as const;

export type GlowLevel = keyof typeof GLOW;

/** ミノ本体のベベル。全ミノ共通で固定 */
export const BEVEL = {
  /** inset 0 4px 0 rgba(255,255,255,.45) 相当 */
  highlightAlpha: 0.45,
  /** inset 0 -4px 0 rgba(0,0,0,.4) 相当 */
  shadowAlpha: 0.4,
  /** セルサイズに対するベベル厚みの比率（26px セルで 4px） */
  ratio: 4 / 26,
} as const;

/** SPACING / GRID */
export const GRID = {
  /** セルの実体サイズ */
  cellBody: 26,
  /** セル間の隙間 */
  cellGap: 2,
  /** 論理セルピッチ */
  cellPitch: 28,
  /** サイドパネル幅 */
  panelWidth: 250,
  /** 枠線は3px固定 */
  borderWidth: 3,
  /** 角丸はベゼルのみ */
  bezelRadius: 12,
} as const;

export const SPACING = [6, 8, 12, 16, 22, 26] as const;

/** 走査線ルール（弱め）。盤面背景のみに適用し、ミノとクリーム面には乗せない */
export const SCANLINE = {
  /** rgba(0,0,0,.14) の横線を 1px / 4px 周期で */
  lineAlpha: 0.14,
  linePeriod: 4,
  /** ソフトスキャン光の周期 */
  sweepMs: 6500,
  sweepHeightRatio: 0.16,
  sweepAlpha: 0.045,
} as const;

// ---------------------------------------------------------------- ユーティリティ

/** 16進カラーを rgba 文字列に変換する */
export function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** 明度を調整する（amount > 0 で明るく、< 0 で暗く） */
export function shade(hex: string, amount: number): string {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
  const adjusted = channels.map((c) => {
    const next = amount >= 0 ? c + (255 - c) * amount : c * (1 + amount);
    return Math.max(0, Math.min(255, Math.round(next)));
  });
  return `#${adjusted.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}
