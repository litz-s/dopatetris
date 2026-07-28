/**
 * ミノ1マスの描画。出典は docs/design/design-spec.html（02 TOKENS / 03 TILES）。
 *
 * ミノ本体のベベルは全種共通で固定:
 *   inset 0 4px 0 rgba(255,255,255,.45) ＋ inset 0 -4px 0 rgba(0,0,0,.4)
 * 外側 glow はイベントタイルのみ。通常ミノには一切かけない。
 */
import type { EventKind } from '@core/types';
import {
  BEVEL,
  EVENT_COLORS,
  EVENT_PULSE_MS,
  EVENT_SYMBOLS,
  EVENT_SYMBOL_COLORS,
  GLOW,
  NEON,
  withAlpha,
} from './theme';
import type { GlowLevel } from './theme';

export type BlockOptions = {
  /** 全体の不透明度 */
  alpha: number;
  /** 明度倍率。ライン消去のフラッシュで使う */
  brightness: number;
};

const DEFAULT_OPTIONS: BlockOptions = { alpha: 1, brightness: 1 };

/**
 * ミノを1マス描く。size は「実体サイズ」（セルピッチではない）。
 * 呼び出し側がピッチ 28px に対して 26px を渡すことで、2px の隙間が生まれる。
 */
export function drawBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
  options: Partial<BlockOptions> = {},
): void {
  const { alpha, brightness } = { ...DEFAULT_OPTIONS, ...options };
  const bevel = Math.max(1, Math.round(size * BEVEL.ratio));

  ctx.globalAlpha = alpha;
  if (brightness !== 1) ctx.filter = `brightness(${brightness})`;

  // 本体
  ctx.fillStyle = color;
  ctx.fillRect(x, y, size, size);

  // inset 上ハイライト
  ctx.fillStyle = `rgba(255, 255, 255, ${BEVEL.highlightAlpha})`;
  ctx.fillRect(x, y, size, bevel);

  // inset 下シャドウ
  ctx.fillStyle = `rgba(0, 0, 0, ${BEVEL.shadowAlpha})`;
  ctx.fillRect(x, y + size - bevel, size, bevel);

  if (brightness !== 1) ctx.filter = 'none';
  ctx.globalAlpha = 1;
}

/**
 * イベントタイルを描く。地色はミノ色を上書きし、記号は暗色で置く。
 * 通常ミノと違い、外側 glow を持つ。
 */
export function drawEventTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  event: EventKind,
  glowLevel: GlowLevel,
  /** 呼吸パルス用の経過時間（ミリ秒） */
  elapsedMs: number,
  options: Partial<BlockOptions> = {},
): void {
  const { alpha, brightness } = { ...DEFAULT_OPTIONS, ...options };
  const color = EVENT_COLORS[event];
  const glow = GLOW[glowLevel];

  // 待機時 0.9〜1.2s の呼吸パルス。scale 1 → 1.06、brightness 1 → 1.35
  const period = EVENT_PULSE_MS[event];
  const phase = (elapsedMs % period) / period;
  const pulse = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
  const pulseScale = 1 + 0.06 * pulse;
  const pulseBrightness = 1 + 0.35 * pulse;

  const center = size / 2;
  ctx.save();
  ctx.translate(x + center, y + center);
  ctx.scale(pulseScale, pulseScale);
  ctx.translate(-center, -center);

  ctx.globalAlpha = alpha;
  ctx.filter = `brightness(${brightness * pulseBrightness})`;

  // 外側 glow
  ctx.shadowColor = withAlpha(color, glow.alpha);
  ctx.shadowBlur = glow.blur;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  ctx.shadowBlur = 0;

  // ベベルは通常ミノと共通
  ctx.fillStyle = `rgba(255, 255, 255, ${BEVEL.highlightAlpha})`;
  ctx.fillRect(0, 0, size, Math.max(1, Math.round(size * BEVEL.ratio)));
  ctx.fillStyle = `rgba(0, 0, 0, ${BEVEL.shadowAlpha})`;
  ctx.fillRect(
    0,
    size - Math.max(1, Math.round(size * BEVEL.ratio)),
    size,
    Math.max(1, Math.round(size * BEVEL.ratio)),
  );

  // 記号
  ctx.filter = 'none';
  ctx.fillStyle = EVENT_SYMBOL_COLORS[event];
  ctx.font = `${Math.round(size * 0.62)}px 'DotGothic16', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(EVENT_SYMBOLS[event], center, center + size * 0.02);

  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * ゴースト（落下予定位置）。
 * ミノ色ではなく、シアン固定で描く（デザイン案の REFERENCE SCREEN 準拠）。
 */
export function drawGhostBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): void {
  ctx.fillStyle = withAlpha(NEON.cyan, 0.1);
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = withAlpha(NEON.cyan, 0.55);
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
}

/**
 * ライン消去のポップ。scale 1 → 1.34（brightness 2.6・白リング拡散）→ 0。
 * progress は 0-1。
 */
export function drawClearingBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
  progress: number,
): void {
  if (progress >= 1) return;

  // scale: 0 → 1.34 まで立ち上がり、その後 0 へ潰れる
  const rise = 0.28;
  const scale =
    progress < rise
      ? 1 + 0.34 * (progress / rise)
      : Math.max(0, 1.34 * (1 - (progress - rise) / (1 - rise)));
  const brightness = progress < rise ? 1 + 1.6 * (progress / rise) : 2.6;

  const center = size / 2;
  ctx.save();
  ctx.translate(x + center, y + center);
  ctx.rotate((progress < rise ? -3 : 8) * (Math.PI / 180) * progress);
  ctx.scale(scale, scale);
  ctx.translate(-center, -center);
  drawBlock(ctx, 0, 0, size, color, { brightness });
  ctx.restore();

  // 白リングの拡散
  if (progress > 0.1) {
    const ringT = Math.min(1, (progress - 0.1) / 0.4);
    const spread = size * 0.24 * ringT;
    ctx.globalAlpha = Math.max(0, 1 - ringT);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - spread, y - spread, size + spread * 2, size + spread * 2);
    ctx.globalAlpha = 1;
  }
}
