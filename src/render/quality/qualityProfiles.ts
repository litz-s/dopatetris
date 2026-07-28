/**
 * 品質段階と自動品質調整（QualityManager）、および設定画面のユーザー調整値。
 *
 * デザイン仕様（05 NOTES / PERFORMANCE）:
 *   - アニメは transform / opacity / filter のみ
 *   - 同時パーティクル上限 120個、超過分は破棄
 *   - フィーバー＋爆発の同時発火時はパーティクルを50%間引き
 *   - prefers-reduced-motion で振幅・点滅を1/4に
 *   - box-shadow アニメは同時5要素まで
 *
 * ユーザー設定（3e CONFIG）がまず上限キャップとなり、
 * 自動調整はその範囲内でのみ段階を上下させる。
 */

export type QualityTier = 'ULTRA' | 'HIGH' | 'MID' | 'LOW';

export const QUALITY_ORDER: readonly QualityTier[] = ['LOW', 'MID', 'HIGH', 'ULTRA'];

/** 走査線ノイズの強さ（3e CONFIG） */
export type ScanlineLevel = 'off' | 'weak' | 'strong';

/** 設定画面でユーザーが直接いじる値 */
export type EffectSettings = {
  /** 画面揺れ 0〜150% */
  shakeScale: number;
  /** パーティクル量 0〜100% */
  particleScale: number;
  /** フラッシュ / 点滅 0〜100% */
  flashScale: number;
  scanline: ScanlineLevel;
  /** マウス追従の滑らかさ 0〜1（大きいほど機敏） */
  mouseSmoothing: number;
  /** 自動品質調整 */
  autoQuality: boolean;
};

export const DEFAULT_EFFECT_SETTINGS: EffectSettings = {
  shakeScale: 1.2,
  particleScale: 1,
  flashScale: 0.85,
  scanline: 'weak',
  mouseSmoothing: 0.35,
  autoQuality: true,
};

export type QualityProfile = {
  /** パーティクル同時数の上限 */
  particleLimit: number;
  /** 画面揺れの倍率 */
  shakeScale: number;
  /** フラッシュ・ブライトネス系の倍率 */
  flashScale: number;
  /** イベントタイルの外側 glow を描くか */
  eventGlow: boolean;
  /** ソフトスキャン光（走査線とは別の流れる光） */
  scanSweep: boolean;
  /** ライン消去の白リング拡散 */
  clearRing: boolean;
  /** 背景アニメーションの更新間隔（ミリ秒） */
  backgroundIntervalMs: number;
};

export const QUALITY_PROFILES: Record<QualityTier, QualityProfile> = {
  ULTRA: {
    particleLimit: 420,
    shakeScale: 1,
    flashScale: 1,
    eventGlow: true,
    scanSweep: true,
    clearRing: true,
    backgroundIntervalMs: 1000 / 60,
  },
  HIGH: {
    particleLimit: 260,
    shakeScale: 0.85,
    flashScale: 0.85,
    eventGlow: true,
    scanSweep: true,
    clearRing: true,
    backgroundIntervalMs: 1000 / 60,
  },
  MID: {
    particleLimit: 120,
    shakeScale: 0.6,
    flashScale: 0.6,
    eventGlow: true,
    scanSweep: false,
    clearRing: false,
    backgroundIntervalMs: 1000 / 30,
  },
  LOW: {
    particleLimit: 0,
    shakeScale: 0,
    flashScale: 0.3,
    eventGlow: false,
    scanSweep: false,
    clearRing: false,
    backgroundIntervalMs: 1000 / 15,
  },
};

/**
 * エフェクト別の段階パラメータ。新しいエフェクトを追加したらここに登録する。
 * count はデザイン仕様の破片数に合わせてある。
 */
export type EffectScale = { count: number; life: number };

export const EFFECT_SCALES: Record<string, Record<QualityTier, EffectScale>> = {
  /** B: ハードドロップ着地の破片 5〜9個 */
  hardDropDebris: {
    ULTRA: { count: 12, life: 1 },
    HIGH: { count: 8, life: 0.9 },
    MID: { count: 5, life: 0.8 },
    LOW: { count: 0, life: 0 },
  },
  /** 設置時のスプラッシュ。接地面から横に大きく弾ける */
  lockSplash: {
    ULTRA: { count: 20, life: 1 },
    HIGH: { count: 13, life: 0.9 },
    MID: { count: 6, life: 0.8 },
    LOW: { count: 0, life: 0 },
  },
  /** A: ライン消去。1セルあたりの破片 */
  lineClear: {
    ULTRA: { count: 3, life: 1 },
    HIGH: { count: 2, life: 0.9 },
    MID: { count: 1, life: 0.8 },
    LOW: { count: 0, life: 0 },
  },
  /** C: 爆弾。1セルあたりの飛散 */
  bomb: {
    ULTRA: { count: 4, life: 1 },
    HIGH: { count: 3, life: 0.9 },
    MID: { count: 2, life: 0.8 },
    LOW: { count: 0, life: 0 },
  },
  /** D: 重力の着地 */
  gravityLand: {
    ULTRA: { count: 3, life: 1 },
    HIGH: { count: 2, life: 0.85 },
    MID: { count: 0, life: 0 },
    LOW: { count: 0, life: 0 },
  },
  stackGain: {
    ULTRA: { count: 8, life: 1 },
    HIGH: { count: 5, life: 0.9 },
    MID: { count: 3, life: 0.8 },
    LOW: { count: 0, life: 0 },
  },
};

export function getEffectScale(name: string, tier: QualityTier): EffectScale {
  return EFFECT_SCALES[name]?.[tier] ?? { count: 0, life: 0 };
}

// ---------------------------------------------------------------- 自動調整

const SAMPLE_WINDOW = 120;
const FRAME_BUDGET_MS = 1000 / 60;
const DEMOTE_THRESHOLD_MS = FRAME_BUDGET_MS * 1.15;
const PROMOTE_THRESHOLD_MS = FRAME_BUDGET_MS * 0.75;
const DEMOTE_STREAK = 30;
/** 復帰は降格より慎重に。段階が振動するのを防ぐ */
const PROMOTE_STREAK = 300;

export class QualityManager {
  private tier: QualityTier = 'ULTRA';
  private auto = true;
  private settings: EffectSettings = { ...DEFAULT_EFFECT_SETTINGS };
  /** prefers-reduced-motion 検出時は振幅・点滅を 1/4 に */
  private reducedMotion = false;

  private readonly samples: number[] = [];
  private averageMs = FRAME_BUDGET_MS;
  private overStreak = 0;
  private underStreak = 0;

  /** フィーバー＋爆発が重なっている間はパーティクルを50%間引く */
  private congested = false;

  setSettings(settings: Partial<EffectSettings>): void {
    this.settings = { ...this.settings, ...settings };
    this.auto = this.settings.autoQuality;
    if (!this.auto) this.tier = 'ULTRA';
  }

  getSettings(): EffectSettings {
    return this.settings;
  }

  setReducedMotion(enabled: boolean): void {
    this.reducedMotion = enabled;
  }

  setCongested(congested: boolean): void {
    this.congested = congested;
  }

  forceTier(tier: QualityTier): void {
    this.auto = false;
    this.tier = tier;
  }

  getTier(): QualityTier {
    return this.tier;
  }

  getAverageMs(): number {
    return this.averageMs;
  }

  getFps(): number {
    return this.averageMs > 0 ? 1000 / this.averageMs : 0;
  }

  isAuto(): boolean {
    return this.auto;
  }

  /** 段階プロファイルにユーザー設定と reduced-motion を掛け合わせた実効値 */
  getProfile(): QualityProfile {
    const base = QUALITY_PROFILES[this.tier];
    const motionScale = this.reducedMotion ? 0.25 : 1;
    const particleScale = this.settings.particleScale * (this.congested ? 0.5 : 1);

    return {
      ...base,
      particleLimit: Math.round(base.particleLimit * particleScale),
      shakeScale: base.shakeScale * this.settings.shakeScale * motionScale,
      flashScale: base.flashScale * this.settings.flashScale * motionScale,
      scanSweep: base.scanSweep && this.settings.scanline !== 'off',
    };
  }

  /** 走査線の濃さ。設定の3段階をそのまま反映する */
  getScanlineAlpha(baseAlpha: number): number {
    switch (this.settings.scanline) {
      case 'off':
        return 0;
      case 'weak':
        return baseAlpha;
      case 'strong':
        return baseAlpha * 1.9;
    }
  }

  /** 毎フレーム呼ぶ。フレームタイムを記録し、必要なら段階を上下させる */
  sample(frameMs: number): void {
    this.samples.push(frameMs);
    if (this.samples.length > SAMPLE_WINDOW) this.samples.shift();

    let total = 0;
    for (const value of this.samples) total += value;
    this.averageMs = total / this.samples.length;

    if (!this.auto) return;

    if (frameMs > DEMOTE_THRESHOLD_MS) {
      this.overStreak += 1;
      this.underStreak = 0;
    } else if (frameMs < PROMOTE_THRESHOLD_MS) {
      this.underStreak += 1;
      this.overStreak = 0;
    } else {
      this.overStreak = 0;
      this.underStreak = 0;
    }

    if (this.overStreak >= DEMOTE_STREAK) {
      this.shift(-1);
      this.overStreak = 0;
    } else if (this.underStreak >= PROMOTE_STREAK) {
      this.shift(1);
      this.underStreak = 0;
    }
  }

  private shift(direction: -1 | 1): void {
    const index = QUALITY_ORDER.indexOf(this.tier) + direction;
    const next = QUALITY_ORDER[index];
    if (next !== undefined) this.tier = next;
  }
}
