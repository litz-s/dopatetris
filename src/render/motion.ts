/**
 * モーション値。出典は docs/design/design-spec.html（04 MOTION / 05 NOTES）。
 * 数値はそのまま実装値として使う。調整するときは必ずここを直す。
 */

/** タイミング基準。全モーションはこの拍グリッドに乗せる */
export const BPM = 174;
/** 1拍 ≒ 345ms */
export const BEAT_MS = 60_000 / BPM;
/** UI跳ね = 1/2拍 */
export const HALF_BEAT_MS = BEAT_MS / 2;
/** フィーバー脈動 = 2拍 */
export const DOUBLE_BEAT_MS = BEAT_MS * 2;

/** A: ライン消去 — 左から1個ずつポップ */
export const LINE_CLEAR = {
  /** 列ごとの遅延（左→右） */
  columnDelayMs: 45,
  /** 1セルのポップ時間 */
  cellMs: 210,
  /** scale 1 → この値 → 0 */
  peakScale: 1.34,
  peakBrightness: 2.6,
  /** 10列ぶんの総時間 */
  totalMs: 45 * 9 + 210,
  /** 消滅後の段落下 */
  dropMs: 230,
  /** 段落下のオーバーシュート */
  dropOvershoot: 0.09,
} as const;

/** B: ハードドロップ — ドン＋スプラッシュ */
export const HARD_DROP = {
  fallMs: 110,
  trailMs: 90,
  /** 着地スカッシュ scaleY .70 / scaleX 1.20 → 1.10 → 1.00 */
  squashMs: 260,
  squashY: 0.7,
  squashX: 1.2,
  /** 衝撃波が横一直線に拡散する時間 */
  shockwaveMs: 140,
  /** 破片の個数レンジ */
  debrisMin: 5,
  debrisMax: 9,
  debrisMs: 420,
} as const;

/** C: 爆弾 — 左下端から右上へ爆ぜていく */
export const BOMB = {
  /** 列ごとの遅延 */
  columnDelayMs: 26,
  /** 行ごとの遅延 */
  rowDelayMs: 14,
  /** セルごとの白フラッシュ */
  flashMs: 60,
  /** 飛散 */
  scatterMs: 420,
  /** 飛散時の回転量（度） */
  scatterSpinDeg: 320,
  /** 全画面フラッシュ */
  screenFlashMs: 70,
  screenFlashMax: 0.85,
  /** 放射の中心（画面幅に対する比率） */
  screenFlashOriginX: 0.2,
} as const;

/** D: 重力（ハート3） */
export const GRAVITY = {
  /** 列ごとに左→右へずらす */
  columnDelayMs: 32,
  /** 1ブロックの落下時間 */
  blockMs: 270,
  /** 着地時の小バウンド（px） */
  bouncePx: 9,
  /** 残像 */
  trailMs: 120,
  trailAlpha: 0.35,
} as const;

/** E: フィーバー */
export const FEVER = {
  /** 突入時のバナースラムイン */
  enterMs: 260,
  enterFlashMs: 80,
  enterShakePx: 10,
  /** 継続中の跳ね周期 */
  bounceMs: 460,
  bouncePx: -16,
  /** 要素ごとのウェーブ遅延 */
  waveDelayMs: 70,
  /** 点滅（1拍） */
  blinkMs: BEAT_MS,
  /** 終了時の減衰 */
  exitMs: 600,
  /** 最後の1秒はカウントが赤点滅 */
  warningMs: 1000,
} as const;

/** F: コンボ加算 */
export const COMBO = {
  popMs: 260,
  /** scale 1 → 1.5 → .94 → 1 */
  popPeak: 1.5,
  popUnder: 0.94,
  /** ±4°の首振り */
  tiltDeg: 4,
  /** 「+1 ×倍率」のライズ＆フェード */
  riseMs: 560,
  /** 20コンボ以降は文字自体が点滅 */
  blinkFrom: 20,
  blinkMs: BEAT_MS,
} as const;

/** コンボ段階ごとの文字サイズ（px） */
export const COMBO_SIZE_STEPS: readonly { from: number; size: number }[] = [
  { from: 0, size: 44 },
  { from: 5, size: 60 },
  { from: 10, size: 78 },
  { from: 20, size: 96 },
];

export function getComboSize(combo: number): number {
  let size = 44;
  for (const step of COMBO_SIZE_STEPS) {
    if (combo >= step.from) size = step.size;
  }
  return size;
}

/**
 * 画面シェイク量。
 * シェイクは盤面ラッパーにのみ適用し、クリーム筐体とHUDは固定する（酔い対策）。
 */
export type ShakeSpec = { amplitude: number; durationMs: number; rotationDeg: number };

export const SHAKE = {
  clear1: { amplitude: 4, durationMs: 90, rotationDeg: 0 },
  clear2: { amplitude: 8, durationMs: 140, rotationDeg: 0 },
  clear3: { amplitude: 13, durationMs: 200, rotationDeg: 0 },
  /** 4列（TETRIS） */
  clear4: { amplitude: 20, durationMs: 300, rotationDeg: 0.7 },
  /** 爆弾3〜4 */
  bombBig: { amplitude: 26, durationMs: 380, rotationDeg: 1.0 },
  hardDrop: { amplitude: 6, durationMs: 110, rotationDeg: 0 },
  feverEnter: { amplitude: 10, durationMs: 200, rotationDeg: 0 },
} as const satisfies Record<string, ShakeSpec>;

/** 減衰は振幅を毎回 ×0.62 */
export const SHAKE_DECAY = 0.62;

/** 消去行数からシェイク量を引く */
export function getClearShake(rows: number): ShakeSpec {
  if (rows >= 4) return SHAKE.clear4;
  if (rows === 3) return SHAKE.clear3;
  if (rows === 2) return SHAKE.clear2;
  return SHAKE.clear1;
}

/** イージング。CSS の cubic-bezier をそのまま JS で使うための定義 */
export const EASING = {
  /** ライン消去のポップ */
  pop: [0.2, 1.5, 0.35, 1],
  /** 段落下 */
  drop: [0.22, 1, 0.36, 1],
  /** ハードドロップの加速 */
  fall: [0.36, 0, 0.66, -0.2],
  /** 爆弾の飛散 */
  scatter: [0.15, 0.85, 0.25, 1],
  /** 重力落下 */
  gravity: [0.34, 1.3, 0.5, 1],
  /** コンボのポップ */
  comboPop: [0.2, 1.6, 0.3, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>;

/**
 * 三次ベジェを数値評価する。CSS と同じ形状のイージングを Canvas 側でも使うため。
 * ニュートン法で x から t を求め、その t での y を返す。
 */
export function cubicBezier(
  spec: readonly [number, number, number, number],
  x: number,
): number {
  const [x1, y1, x2, y2] = spec;
  const clamped = x < 0 ? 0 : x > 1 ? 1 : x;

  const bezier = (a: number, b: number, t: number): number => {
    const u = 1 - t;
    return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t;
  };

  let t = clamped;
  for (let i = 0; i < 6; i++) {
    const currentX = bezier(x1, x2, t) - clamped;
    if (Math.abs(currentX) < 1e-4) break;
    const u = 1 - t;
    const derivative =
      3 * u * u * x1 + 6 * u * t * (x2 - x1) + 3 * t * t * (1 - x2);
    if (Math.abs(derivative) < 1e-6) break;
    t -= currentX / derivative;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
  }

  return bezier(y1, y2, t);
}

/**
 * サウンドフック。デザイン仕様で発火点だけ確定済み。
 * 実装は後日。ここでは空関数として口だけ用意しておく。
 */
export type SoundCue =
  | 'move'
  | 'rotate'
  | 'softLand'
  | 'hardDrop'
  /** 各列ポップ。左→右で音程が上昇する */
  | 'clearPop'
  | 'explode'
  | 'gravityLand'
  | 'feverStart'
  | 'feverEnd'
  /** コンボ加算。段階でピッチが上がる */
  | 'combo';
