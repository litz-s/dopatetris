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

// ================================================================ 05 HYPE MOMENTS

/**
 * 回転そのものを見せる 90ms（デザイン仕様 05-H）。
 *
 * core は回転を即時に確定させ、描画だけが遅れて追いつく。
 * 仕様の記述は T-SPIN の項にあるが、T-Spin かどうかは固定するまで分からないため
 * 「回転」全般に掛ける。判定・当たりは常に確定後の姿勢で行われる。
 */
export const ROTATE = { durationMs: 90 } as const;

/**
 * 回転の中心（バウンディングボックス内のセル座標）。
 * SRS の回転はこの点まわりなので、確定後の形をここで逆回しすると回転前の形に重なる。
 */
export const ROTATE_CENTER: Record<string, readonly [number, number]> = {
  I: [1.5, 1.5],
  O: [1.5, 0.5],
  J: [1, 1],
  L: [1, 1],
  S: [1, 1],
  T: [1, 1],
  Z: [1, 1],
};

/**
 * H: T-SPIN — カチッとはまる一瞬。
 * 回転から固定までを1フレームで止めるのが要点。
 */
export const TSPIN = {
  /** 回転そのもの */
  rotateMs: 90,
  /** 着地でミノが一瞬潰れる */
  squashMs: 40,
  squashScale: 0.9,
  /** はまった穴の形に沿う白枠の収縮 */
  outlineMs: 140,
  outlineFromScale: 1.75,
  outlineToScale: 1,
  outlineFromWidth: 6,
  outlineToWidth: 2,
  /** 収縮後のフェード */
  outlineFadeMs: 320,
  /** 紫フラッシュ */
  flashMs: 60,
  /** 破片は6〜10片を全方位へ */
  shardMin: 6,
  shardMax: 10,
  shardMs: 560,
  /** バッジのスラムイン */
  badgeSlamMs: 150,
  badgeFromScale: 2.2,
  /** ±2°の首振り */
  badgeTiltDeg: 2,
  badgeHoldMs: 900,
  badgeExitMs: 220,
} as const;

/** T-Spin の段階ごとの枠色。SINGLE→DOUBLE→TRIPLE でシアン→マゼンタ→ゴールドへ昇格 */
export const TSPIN_TIER_COLORS = ['#00e5ff', '#ff2f92', '#ffe600'] as const;

/** 紫フラッシュの色 */
export const TSPIN_FLASH_COLOR = '#a855ff';

/**
 * I: 4列消し — チャージ→白飛び→圧縮。
 * 左からのポップ消去とは別演出であることに注意。
 */
export const TETRIS_FX = {
  /** ①チャージ。4行が下から順に白飛びして膨らむ */
  chargeMs: 240,
  /** 行ごとの遅延（下から） */
  rowStaggerMs: 55,
  chargeBrightness: 3.4,
  chargeScaleY: 1.16,
  /** ②白い横スイープが4行を貫通 */
  wipeMs: 200,
  /** ③スイープ通過後の圧縮消滅 */
  compressMs: 140,
  compressFromScaleY: 0.24,
  /** 金色リングの横楕円拡散 */
  ringMs: 280,
  ringToScale: 2.1,
  /** 盤面下から立ち上がる光の柱 */
  pillarMs: 340,
  /** 文字のスラム */
  wordSlamMs: 170,
  wordFromScale: 2.6,
  wordSkewDeg: -8,
  wordHoldMs: 850,
  /** 圧縮完了から落下再開までのタメ */
  holdBeforeDropMs: 60,
} as const;

export const TETRIS_RING_COLOR = '#ffe600';
export const TETRIS_PILLAR_COLOR = '#ff2f92';

/**
 * J: スコアポップ — 消した場所に叩き出す。
 * 出現位置は消えた行の中心（複数行なら重心）。
 */
export const SCORE_POP = {
  /** 数字の着弾 */
  slamMs: 180,
  fromScale: 3.4,
  fromBlurPx: 6,
  overshootScale: 1.16,
  /** 保持 */
  holdMs: 850,
  /** 上へ抜ける距離 */
  riseUpPx: 72,
  /** 全体の長さ */
  totalMs: 1600,
  /** 内訳タグのライズイン間隔 */
  tagStaggerMs: 80,
  /** これ未満の消去行数では出さない（1列は既存の小ポップのまま） */
  minRows: 2,
} as const;

/** スコアポップの段階色。2列シアン／3列マゼンタ／4列・T-Spinゴールド */
export const SCORE_POP_COLORS = {
  double: '#00e5ff',
  triple: '#ff2f92',
  gold: '#ffe600',
} as const;

/**
 * K: イベントミノを消した瞬間のVFX。
 * ポップ消去がそのタイルに到達したフレームで発火する。
 */
export const EVENT_VFX = {
  bomb: {
    /** 二重の衝撃リング。2本目は80ms遅らせる */
    waveMs: 380,
    waveDelayMs: 80,
    waveToScale: 3.1,
    debris: 8,
    debrisMs: 480,
    flashMs: 50,
    shakePx: 8,
  },
  heart: {
    /** 柔らかいオーラ。爆発感は出さない */
    auraMs: 420,
    auraToScale: 1.9,
    countMin: 4,
    countMax: 6,
    staggerMs: 90,
    floatMs: 720,
    /** 横に軽く蛇行させる振幅 */
    waverPx: 10,
    shakePx: 0,
  },
  coin: {
    countMin: 4,
    countMax: 6,
    spinMs: 760,
    /** rotateY 1080° 相当 */
    spinTurns: 3,
    /** 金の水平ラインが残る時間 */
    lineMs: 500,
    shakePx: 0,
  },
  clover: {
    /** 緑の光柱 */
    beamMs: 340,
    /** 星が螺旋を描いて外へ */
    swirlMs: 820,
    swirlTurns: 760 / 360,
    count: 5,
    staggerMs: 90,
    shakePx: 0,
  },
} as const;

/** 同一ライン内で3個目以降はVFXを間引く（音程だけ上げる） */
export const EVENT_VFX_THIN_FROM = 3;
export const EVENT_VFX_THIN_RATIO = 0.5;

/**
 * L: フィーバー現金砲 — 左右下から等間隔で撃ち上げ。
 * 4拍ごとに交互発射し、リズムとして体に入るようにする。
 */
export const CASH_CANNON = {
  /** 4拍 = 1.38s */
  intervalMs: BEAT_MS * 4,
  /** 左砲が拍1、右砲が拍3。右は2拍ぶん遅らせる */
  rightOffsetMs: BEAT_MS * 2,
  /** 1斉射の弾数 */
  baseCount: 6,
  countAtCombo10: 8,
  countAtCombo20: 10,
  /** 連続射出の間隔 */
  shotStaggerMs: 120,
  /** マズルフラッシュ */
  muzzleMs: 90,
  /** 放物線の飛翔時間 */
  flightMs: 2760,
  /** 頂点の高さ（画面高に対する比） */
  peakMin: 0.6,
  peakMax: 0.85,
  /** 金貨の回転量（度） */
  coinSpinDeg: 760,
  /** 同時表示の上限 */
  maxAlive: 40,
  /** 盤面に重なる区間の不透明度。ミノの視認を妨げない */
  overBoardAlpha: 0.55,
} as const;

/** 弾種。金貨（大・小）／銀貨／札束（緑）／紙幣（白） */
export const CASH_KINDS = ['coinLarge', 'coinSmall', 'silver', 'bundle', 'bill'] as const;
export type CashKind = (typeof CASH_KINDS)[number];

export const CASH_COLORS: Record<CashKind, string> = {
  coinLarge: '#ffe600',
  coinSmall: '#ffd400',
  silver: '#d8d8e0',
  bundle: '#34d94b',
  bill: '#f4f0e2',
};

/**
 * 20コンボ以降は斉射に紙吹雪が足される（05-L 連動）。
 * 弾ではないので、同時40個の上限とは別枠で数える。
 */
export const CASH_CONFETTI = {
  fromCombo: 20,
  /** 1斉射あたりの枚数 */
  count: 18,
  maxAlive: 90,
  fallMs: 2200,
  sizeMin: 5,
  sizeMax: 11,
} as const;

export const CASH_CONFETTI_COLORS = [
  '#ffe600',
  '#ff2f92',
  '#00e5ff',
  '#34d94b',
  '#f4f0e2',
] as const;

/** コンボ段階ごとの斉射数 */
export function getCashVolleyCount(combo: number): number {
  if (combo >= 20) return CASH_CANNON.countAtCombo20;
  if (combo >= 10) return CASH_CANNON.countAtCombo10;
  return CASH_CANNON.baseCount;
}

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
  /** 4列消しの白い横スイープ */
  tetWipe: [0.4, 0, 0.2, 1],
  /** 回転。終端で軽く行き過ぎてから止まる */
  rotate: [0.16, 1.5, 0.3, 1],
  /** T-Spin のはめ込みと文字スラム */
  slam: [0.16, 1.5, 0.3, 1],
  /** 現金砲の放物線 */
  cashFlight: [0.25, 0.6, 0.5, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>;

/**
 * イージングの逆算。ease(t) = value となる t を二分探索で求める。
 * 「白いスイープがこの列を通過した時刻」のように、
 * 出力から入力を逆引きしたい場面で使う。
 */
export function cubicBezierInverse(
  spec: readonly [number, number, number, number],
  value: number,
): number {
  let low = 0;
  let high = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2;
    if (cubicBezier(spec, mid) < value) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/**
 * 三次ベジェを数値評価する。CSS と同じ形状のイージングを Canvas 側でも使うため。
 * ニュートン法で x から t を求め、その t での y を返す。
 */
export function cubicBezier(spec: readonly [number, number, number, number], x: number): number {
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
    const derivative = 3 * u * u * x1 + 6 * u * t * (x2 - x1) + 3 * t * t * (1 - x2);
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
