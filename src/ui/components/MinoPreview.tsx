/**
 * Next / Hold 用のミノプレビュー。
 * 盤面と同じベベルを小さなキャンバスで再現し、見た目の一貫性を保つ。
 */
import { useEffect, useRef } from 'react';
import { getShape } from '@core/pieces';
import type { MinoType } from '@core/types';
import { drawBlock } from '@render/blocks';
import { MINO_COLORS } from '@render/theme';

type Props = {
  type: MinoType | null;
  /** イベントタイルを持つミノであることを示す枠 */
  hasEvent?: boolean;
  /** 描画領域の一辺（CSS px） */
  size?: number;
  /** セルの実体サイズ。省略時は領域から自動計算する */
  cell?: number;
  dimmed?: boolean;
};

export function MinoPreview({ type, hasEvent = false, size = 80, cell, dimmed = false }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (canvas === null) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);

    const ctx = canvas.getContext('2d');
    if (ctx === null) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    if (type === null) return;

    const shape = getShape(type, 0);
    let minX = 9;
    let maxX = -9;
    let minY = 9;
    let maxY = -9;
    for (const [dx, dy] of shape) {
      minX = Math.min(minX, dx);
      maxX = Math.max(maxX, dx);
      minY = Math.min(minY, dy);
      maxY = Math.max(maxY, dy);
    }

    const cols = maxX - minX + 1;
    const rows = maxY - minY + 1;
    const pitch = cell ?? Math.floor(Math.min(size / (cols + 0.5), size / (rows + 0.5)));
    const body = Math.round(pitch * (26 / 28));
    const offsetX = Math.round((size - pitch * cols) / 2);
    const offsetY = Math.round((size - pitch * rows) / 2);

    for (const [dx, dy] of shape) {
      drawBlock(
        ctx,
        offsetX + (dx - minX) * pitch,
        offsetY + (dy - minY) * pitch,
        body,
        MINO_COLORS[type],
        { alpha: dimmed ? 0.42 : 1 },
      );
    }
  }, [type, size, cell, dimmed]);

  return (
    <div className={`mino-preview ${hasEvent ? 'has-event' : ''}`} style={{ width: size, height: size }}>
      <canvas ref={ref} style={{ width: size, height: size }} />
    </div>
  );
}
