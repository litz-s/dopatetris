/**
 * イベントタイルのアイコン。盤面と同じ地色・記号・ベベルを CSS で再現する。
 * 記号表示のためキャンバスは使わない。
 */
import type { EventKind } from '@core/types';
import { EVENT_COLORS, EVENT_PULSE_MS, EVENT_SYMBOLS, EVENT_SYMBOL_COLORS } from '@render/theme';

type Props = {
  event: EventKind;
  size?: number;
  /** false なら未取得スロットとして暗く表示する */
  filled?: boolean;
  /** 発光レベル。発動可能なときに強くする */
  glow?: 'L1' | 'L2' | 'L3';
};

const GLOW_CSS = {
  L1: '0 0 12px',
  L2: '0 0 22px',
  L3: '0 0 44px',
} as const;

const GLOW_ALPHA = { L1: 0.35, L2: 0.7, L3: 0.95 } as const;

export function EventIcon({ event, size = 48, filled = true, glow = 'L2' }: Props) {
  const color = EVENT_COLORS[event];

  if (!filled) {
    return (
      <div className="event-icon is-empty" style={{ width: size, height: size }}>
        <span />
      </div>
    );
  }

  const bevel = Math.max(2, Math.round(size * (4 / 48)));

  return (
    <div
      className="event-icon"
      style={{
        width: size,
        height: size,
        background: color,
        color: EVENT_SYMBOL_COLORS[event],
        fontSize: Math.round(size * 0.54),
        boxShadow: [
          `inset 0 ${bevel}px 0 rgba(255,255,255,.45)`,
          `inset 0 -${bevel}px 0 rgba(0,0,0,.4)`,
          `${GLOW_CSS[glow]} ${hexToRgba(color, GLOW_ALPHA[glow])}`,
        ].join(','),
        animationDuration: `${EVENT_PULSE_MS[event]}ms`,
      }}
    >
      {EVENT_SYMBOLS[event]}
    </div>
  );
}

function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
