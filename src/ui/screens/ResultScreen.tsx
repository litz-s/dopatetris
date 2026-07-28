/**
 * リザルト。出典は docs/design/design-screens.html（3d RESULT）。
 * スコア内訳とイベント使用履歴を、カウントアップで積み上げて見せる。
 * マルチ版の FINAL STANDINGS はソロでは「ローカル上位」に置き換える。
 */
import { useEffect, useState } from 'react';
import { EVENT_KINDS } from '@core/types';
import { EVENT_SYMBOLS } from '@render/theme';
import { Cabinet, useCabinetScale } from '../components/Cabinet';
import { loadHighScores } from '../storage';
import type { RunResult } from '../storage';

type Props = {
  result: RunResult;
  onRetry: () => void;
  onMenu: () => void;
};

/** 数値をカウントアップさせる。durationMs かけて target まで積む */
function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (target <= 0) {
      setValue(0);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / durationMs);
      // 終盤をゆっくり見せる
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return value;
}

export function ResultScreen({ result, onRetry, onMenu }: Props) {
  const scale = useCabinetScale();
  const total = useCountUp(result.score, 1100);
  const scores = loadHighScores();

  const rows: [string, number][] = [
    ['ライン消去', result.breakdown.lines],
    ['コンボ倍率', result.breakdown.combo],
    ['フィーバー', result.breakdown.fever],
    ['イベント', result.breakdown.event],
  ];

  return (
    <Cabinet scale={scale}>
      <div className="result">
        <div className="result-head">
          <span className="mono-9">SOLO PLAY — ENDLESS 終了</span>
          <h1 className="result-title">RESULT</h1>
        </div>

        <div className="result-hero">
          {result.isBest && <div className="result-star">★ NEW BEST</div>}
          <div className="result-score">{total.toLocaleString('en-US')}</div>
          <div className="result-meta">
            <span className="mono-8">LINES {result.lines}</span>
            <span className="mono-8">LEVEL {result.level}</span>
            <span className="mono-8">MAX COMBO {result.maxCombo}</span>
            {result.rank !== null && <span className="result-rank">LOCAL #{result.rank}</span>}
          </div>
        </div>

        <div className="result-columns">
          <section className="panel panel-cream result-breakdown">
            <h2 className="panel-label">BREAKDOWN</h2>
            {rows.map(([label, value]) => (
              <div key={label} className="result-row">
                <span className="result-row-label">{label}</span>
                <span className="result-row-value">{value.toLocaleString('en-US')}</span>
              </div>
            ))}
            <div className="result-row is-total">
              <span className="result-row-label">TOTAL</span>
              <span className="result-row-value">{result.score.toLocaleString('en-US')}</span>
            </div>
          </section>

          <section className="panel panel-dark result-usage">
            <span className="mono-9 muted">EVENT USAGE</span>
            <div className="result-events">
              {EVENT_KINDS.map((kind) => (
                <div key={kind} className="result-event">
                  <span className={`menu-event-symbol is-${kind}`}>{EVENT_SYMBOLS[kind]}</span>
                  <span className="mono-9">×{result.eventUsed[kind]}</span>
                </div>
              ))}
            </div>
            <div className="result-fever">
              <span className="mono-8 muted">FEVER 合計</span>
              <span className="result-fever-value">
                {(result.feverTotalMs / 1000).toFixed(1)}s
              </span>
            </div>
          </section>

          <section className="panel panel-cream result-ranking">
            <h2 className="panel-label">LOCAL TOP 5</h2>
            <ol className="result-list">
              {scores.slice(0, 5).map((entry, i) => (
                <li
                  key={`${entry.date}-${i}`}
                  className={`result-list-row ${entry.score === result.score && i + 1 === result.rank ? 'is-you' : ''}`}
                >
                  <span className="mono-9">{i + 1}</span>
                  <span className="result-list-score">{entry.score.toLocaleString('en-US')}</span>
                  <span className="mono-8">L{entry.lines}</span>
                </li>
              ))}
              {scores.length === 0 && <li className="result-list-empty">記録なし</li>}
            </ol>
          </section>
        </div>

        <div className="result-actions">
          <button className="btn" onClick={onRetry}>
            もう一戦
          </button>
          <button className="btn btn-ghost" onClick={onMenu}>
            メニューへ
          </button>
        </div>
      </div>
    </Cabinet>
  );
}
