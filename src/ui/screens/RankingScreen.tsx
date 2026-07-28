/**
 * ローカルランキング。MVPではサーバーを持たないため、localStorage の上位10件を出す。
 */
import { useEffect } from 'react';
import { Cabinet, useCabinetScale } from '../components/Cabinet';
import { loadHighScores } from '../storage';

type Props = { onClose: () => void };

export function RankingScreen({ onClose }: Props) {
  const scale = useCabinetScale();
  const scores = loadHighScores();

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
        <h1 className="config-title">RANKING</h1>
        <span className="mono-9">LOCAL TOP 10 — この端末に保存された記録</span>

        <section className="panel panel-cream ranking-panel">
          {scores.length === 0 ? (
            <p className="ranking-empty">まだ記録がありません。SOLO PLAY で1戦してみてください。</p>
          ) : (
            <ol className="ranking-list">
              {scores.map((entry, i) => (
                <li key={`${entry.date}-${i}`} className="ranking-row">
                  <span className={`ranking-rank ${i === 0 ? 'is-top' : ''}`}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="ranking-score">{entry.score.toLocaleString('en-US')}</span>
                  <span className="mono-8">LINES {entry.lines}</span>
                  <span className="mono-8">LV {entry.level}</span>
                  <span className="mono-8">COMBO {entry.maxCombo}</span>
                  <span className="ranking-date">
                    {new Date(entry.date).toLocaleDateString('ja-JP')}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <button className="btn" onClick={onClose}>
          戻る
        </button>
      </div>
    </Cabinet>
  );
}
