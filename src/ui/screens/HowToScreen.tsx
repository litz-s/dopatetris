/**
 * 遊び方。イベントスタックの仕組みを説明する。
 * 効果の数値は balance.ts から直接引き、仕様と説明がずれないようにする。
 */
import { useEffect } from 'react';
import {
  BOMB_EFFECTS,
  CLOVER_EFFECTS,
  COIN_EFFECTS,
  HEART_EFFECTS,
  STACK_MAX,
} from '@core/config/balance';
import { EVENT_KINDS } from '@core/types';
import type { EventKind } from '@core/types';
import { EVENT_SYMBOLS } from '@render/theme';
import { Cabinet, useCabinetScale } from '../components/Cabinet';

type Props = { onClose: () => void };

const NAMES: Record<EventKind, string> = {
  bomb: 'BOMB',
  heart: 'HEART',
  coin: 'COIN',
  clover: 'CLOVER',
};

/** 各段階の効果を1行の文字列にする */
function describe(kind: EventKind, count: number): string {
  switch (kind) {
    case 'bomb': {
      const e = BOMB_EFFECTS[count];
      return e ? `下層${e.clearRows}列消去 ＋ フィーバー${e.feverMs / 1000}秒` : '—';
    }
    case 'heart': {
      const e = HEART_EFFECTS[count];
      if (!e) return '—';
      return e.gravity ? 'ホールド2回 ＋ 重力を1回発生' : 'ホールドが2回できる';
    }
    case 'coin': {
      const e = COIN_EFFECTS[count];
      return e ? `${e.durationMs / 1000}秒間 落下速度 -${e.slowRate * 100}%` : '—';
    }
    case 'clover': {
      const e = CLOVER_EFFECTS[count];
      if (!e) return '不発（スタックは消費しない）';
      return `${e.feverMs / 1000}秒フィーバー ＋ コンボ係数 ${e.comboRate * 100}%`;
    }
  }
}

export function HowToScreen({ onClose }: Props) {
  const scale = useCabinetScale();

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.code === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <Cabinet scale={scale}>
      <div className="simple-screen">
        <h1 className="config-title">HOW TO PLAY</h1>

        <section className="panel panel-dark howto-intro">
          <p>
            ミノの中に <strong>1タイルだけ</strong> イベントが紛れ込みます。
            そのタイルを含む列を消すと <strong>カレント種別がロック</strong> され、
            以降は<strong>同じ種類だけ</strong>が最大{STACK_MAX}個まで溜まります。
          </p>
          <p>
            列は<strong>左から右へ</strong>消えるため、
            同時消しのときは<strong>いちばん左のイベント</strong>が種別を決めます。
            違う種類はスタックされず、ボーナススコアに変わります。
          </p>
          <p>
            <span className="hint-key">E</span> で発動、
            <span className="hint-key">Q</span> で破棄。発動後は10秒のクールタイム。
          </p>
        </section>

        <div className="howto-grid">
          {EVENT_KINDS.map((kind) => (
            <section key={kind} className="panel panel-cream howto-card">
              <div className="howto-card-head">
                <span className={`menu-event-symbol is-${kind}`}>{EVENT_SYMBOLS[kind]}</span>
                <span className="mono-9 ink">{NAMES[kind]}</span>
              </div>
              <ul className="howto-steps">
                {[1, 2, 3, 4].map((count) => (
                  <li key={count}>
                    <span className="howto-count">×{count}</span>
                    <span className="howto-effect">{describe(kind, count)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <p className="howto-footnote">
          ※ 効果は「到達した最高段階のみ」適用され、下位の効果は累積しません。
          フィーバー中はスコア1.5倍、コンボが途切れません。
        </p>

        <button className="btn" onClick={onClose}>
          戻る
        </button>
      </div>
    </Cabinet>
  );
}
