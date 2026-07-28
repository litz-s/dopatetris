/**
 * 自動品質調整の検証。
 * 「負荷が続けば下がる」「余裕が続けば戻る」「LOW では演出が止まる」を固定する。
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EFFECT_SETTINGS,
  EFFECT_SCALES,
  QUALITY_ORDER,
  QUALITY_PROFILES,
  QualityManager,
  getEffectScale,
} from './qualityProfiles';
import type { QualityTier } from './qualityProfiles';

const SMOOTH_FRAME_MS = 1000 / 120;
const HEAVY_FRAME_MS = 40;

/** 同じフレームタイムを繰り返し食わせる */
function feed(manager: QualityManager, frameMs: number, frames: number): void {
  for (let i = 0; i < frames; i++) manager.sample(frameMs);
}

describe('品質段階の定義', () => {
  it('段階は軽い順に並んでいる', () => {
    expect(QUALITY_ORDER).toEqual(['LOW', 'MID', 'HIGH', 'ULTRA']);
  });

  it('段階が上がるほどパーティクル上限が増える', () => {
    let previous = -1;
    for (const tier of QUALITY_ORDER) {
      const limit = QUALITY_PROFILES[tier].particleLimit;
      expect(limit).toBeGreaterThan(previous);
      previous = limit;
    }
  });

  it('LOW では演出が止まる', () => {
    const low = QUALITY_PROFILES.LOW;
    expect(low.particleLimit).toBe(0);
    expect(low.shakeScale).toBe(0);
    expect(low.eventGlow).toBe(false);
    expect(low.scanSweep).toBe(false);
    expect(low.clearRing).toBe(false);
  });

  it('登録済みエフェクトはすべて LOW で発生しない', () => {
    for (const name of Object.keys(EFFECT_SCALES)) {
      expect(getEffectScale(name, 'LOW').count).toBe(0);
    }
  });

  it('未登録のエフェクト名は無効扱いになる', () => {
    expect(getEffectScale('存在しないエフェクト', 'ULTRA')).toEqual({ count: 0, life: 0 });
  });
});

describe('自動調整', () => {
  it('初期状態は最上位', () => {
    expect(new QualityManager().getTier()).toBe('ULTRA');
  });

  it('予算超過が続くと段階が下がる', () => {
    const manager = new QualityManager();
    feed(manager, HEAVY_FRAME_MS, 60);
    expect(manager.getTier()).not.toBe('ULTRA');
  });

  it('負荷が続けば最下位まで落ちるが、それ以上は下がらない', () => {
    const manager = new QualityManager();
    feed(manager, HEAVY_FRAME_MS, 1000);
    expect(manager.getTier()).toBe('LOW');
  });

  it('余裕が長く続くと段階が戻る', () => {
    const manager = new QualityManager();
    feed(manager, HEAVY_FRAME_MS, 60);
    const demoted = manager.getTier();

    feed(manager, SMOOTH_FRAME_MS, 400);
    expect(rank(manager.getTier())).toBeGreaterThan(rank(demoted));
  });

  it('降格より復帰の方が慎重で、短い余裕では戻らない', () => {
    const manager = new QualityManager();
    feed(manager, HEAVY_FRAME_MS, 60);
    const demoted = manager.getTier();

    // 降格に必要なフレーム数と同じだけ余裕を与えても戻らない
    feed(manager, SMOOTH_FRAME_MS, 60);
    expect(manager.getTier()).toBe(demoted);
  });

  it('自動調整を切ると段階が動かない', () => {
    const manager = new QualityManager();
    manager.setSettings({ ...DEFAULT_EFFECT_SETTINGS, autoQuality: false });

    feed(manager, HEAVY_FRAME_MS, 500);
    expect(manager.getTier()).toBe('ULTRA');
    expect(manager.isAuto()).toBe(false);
  });

  it('フレームタイムの平均から fps を算出する', () => {
    const manager = new QualityManager();
    feed(manager, 1000 / 60, 120);
    expect(manager.getFps()).toBeCloseTo(60, 0);
  });
});

describe('ユーザー設定の反映', () => {
  it('パーティクル量を0にすると1つも出せない', () => {
    const manager = new QualityManager();
    manager.setSettings({ particleScale: 0 });
    expect(manager.getProfile().particleLimit).toBe(0);
  });

  it('画面揺れを0にすると揺れない', () => {
    const manager = new QualityManager();
    manager.setSettings({ shakeScale: 0 });
    expect(manager.getProfile().shakeScale).toBe(0);
  });

  it('画面揺れは150%まで強められる', () => {
    const manager = new QualityManager();
    manager.setSettings({ shakeScale: 1.5 });
    expect(manager.getProfile().shakeScale).toBeCloseTo(1.5, 5);
  });

  it('フラッシュを0にすると光らない', () => {
    const manager = new QualityManager();
    manager.setSettings({ flashScale: 0 });
    expect(manager.getProfile().flashScale).toBe(0);
  });

  it('走査線をOFFにすると濃さが0になる', () => {
    const manager = new QualityManager();
    manager.setSettings({ scanline: 'off' });
    expect(manager.getScanlineAlpha(0.14)).toBe(0);
    expect(manager.getProfile().scanSweep).toBe(false);
  });

  it('走査線の強弱で濃さが変わる', () => {
    const manager = new QualityManager();
    manager.setSettings({ scanline: 'weak' });
    const weak = manager.getScanlineAlpha(0.14);
    manager.setSettings({ scanline: 'strong' });
    expect(manager.getScanlineAlpha(0.14)).toBeGreaterThan(weak);
  });

  it('prefers-reduced-motion で振幅と点滅が1/4になる', () => {
    const manager = new QualityManager();
    const normal = manager.getProfile();

    manager.setReducedMotion(true);
    const reduced = manager.getProfile();

    expect(reduced.shakeScale).toBeCloseTo(normal.shakeScale * 0.25, 5);
    expect(reduced.flashScale).toBeCloseTo(normal.flashScale * 0.25, 5);
  });

  it('フィーバーと爆発が重なるとパーティクルを半減する', () => {
    const manager = new QualityManager();
    const normal = manager.getProfile().particleLimit;

    manager.setCongested(true);
    expect(manager.getProfile().particleLimit).toBe(Math.round(normal * 0.5));
  });
});

function rank(tier: QualityTier): number {
  return QUALITY_ORDER.indexOf(tier);
}
