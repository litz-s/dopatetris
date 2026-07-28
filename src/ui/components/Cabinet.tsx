/**
 * 全画面で共通のクリーム樹脂の筐体。
 * 1120×720 の固定設計をビューポートに合わせて等倍スケールする。
 */
import { useEffect, useState } from 'react';
import type { ReactNode, RefObject } from 'react';

export const CABINET_WIDTH = 1120;
export const CABINET_HEIGHT = 720;

/**
 * 筐体の拡縮率を求める。
 * CSS では長さ（vw / vh）から無次元のスケール値を作れないため JS で計算する。
 */
export function useCabinetScale(): number {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const compute = (): void => {
      const margin = 32;
      const next = Math.min(
        (window.innerWidth - margin) / CABINET_WIDTH,
        (window.innerHeight - margin) / CABINET_HEIGHT,
      );
      setScale(Math.max(0.3, next));
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, []);

  return scale;
}

type Props = {
  scale: number;
  children: ReactNode;
  className?: string;
  innerRef?: RefObject<HTMLDivElement | null>;
};

export function Cabinet({ scale, children, className = '', innerRef }: Props) {
  return (
    <div className="stage" style={{ '--cabinet-scale': scale } as React.CSSProperties}>
      <div ref={innerRef} className={`cabinet ${className}`}>
        <div className="cabinet-noise" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}
