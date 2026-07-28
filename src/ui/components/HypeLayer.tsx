/**
 * T-SPIN / TETRIS のバッジと、消した場所に出すスコアポップ。
 * 盤面（280×560）の上に重ね、盤面座標に紐づけて配置する。
 */
import { GRID } from '@render/theme';
import type { HypeEvent } from '../hype';

type Props = {
  events: readonly HypeEvent[];
  /** フィーバー中は文字がビートで微振動する */
  fever: boolean;
};

const TIER_CLASS = ['is-single', 'is-double', 'is-triple'] as const;

export function HypeLayer({ events, fever }: Props) {
  return (
    <div className="hype-layer" aria-hidden="true">
      {events.map((event) => {
        if (event.kind === 'tspin') {
          return (
            <div key={event.id} className={`hype-badge ${TIER_CLASS[event.tier] ?? 'is-single'}`}>
              <div className="hype-badge-box">
                <span className="hype-badge-title">T-SPIN</span>
                <span className="hype-badge-label">{event.label}</span>
              </div>
              <span className="hype-badge-note">PERFECT LOCK</span>
            </div>
          );
        }

        if (event.kind === 'tetris') {
          return (
            <div key={event.id} className="hype-tetris">
              <span className="hype-tetris-word">TETRIS</span>
              <span className="hype-tetris-sub">4 LINES</span>
            </div>
          );
        }

        // 消えた行の重心へ出す。盤面座標をそのまま画素へ変換する
        const left = event.cellX * GRID.cellPitch;
        const top = event.cellY * GRID.cellPitch;

        return (
          <div
            key={event.id}
            className={`score-pop is-${event.tier} ${fever ? 'is-fever' : ''}`}
            style={{ left, top }}
          >
            <span className="score-pop-streak" />
            <span className="score-pop-amount">+{event.amount.toLocaleString('en-US')}</span>
            <span className="score-pop-tags">
              {event.tags.map((tag, index) => (
                <span
                  key={tag}
                  className="score-pop-tag"
                  // 内訳タグは 80ms 差で下から順にライズインする
                  style={{ animationDelay: `${index * 80}ms` }}
                >
                  {tag}
                </span>
              ))}
            </span>
          </div>
        );
      })}
    </div>
  );
}
