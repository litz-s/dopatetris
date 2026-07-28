/**
 * 対戦のリザルト。3d RESULT のソロ版を対戦向けに組み替えたもの。
 *
 * 相手の成績は最後に受け取った盤面スナップショットから引く。
 * 決着のためだけに専用の集計メッセージを増やすより、
 * すでに200msごとに流れている情報を使い回すほうが単純で確実。
 */
import { EVENT_KINDS } from '@core/types';
import type { BoardSnapshot, PlayerId, PlayerInfo } from '@net/protocol';
import { EVENT_SYMBOLS } from '@render/theme';
import type { HudSnapshot } from '../useGameEngine';

type Props = {
  standings: PlayerInfo[];
  rivals: Map<PlayerId, BoardSnapshot>;
  you: PlayerId | null;
  hud: HudSnapshot | null;
  onRematch: () => void;
  onLeave: () => void;
};

export function VersusResult({ standings, rivals, you, hud, onRematch, onLeave }: Props) {
  const won = standings[0]?.id === you;
  const stats = hud?.stats;

  const breakdown: [string, number][] = [
    ['ライン消去', stats?.breakdown.lines ?? 0],
    ['コンボ倍率', stats?.breakdown.combo ?? 0],
    ['フィーバー', stats?.breakdown.fever ?? 0],
    ['イベント', stats?.breakdown.event ?? 0],
  ];

  /** 自分と相手で成績の取り出し方が違うのを吸収する */
  const statsFor = (player: PlayerInfo): { score: number; lines: number; maxCombo: number } => {
    if (player.id === you) {
      return {
        score: hud?.score ?? 0,
        lines: hud?.lines ?? 0,
        maxCombo: stats?.maxCombo ?? 0,
      };
    }
    const snapshot = rivals.get(player.id);
    return {
      score: snapshot?.score ?? 0,
      lines: snapshot?.lines ?? 0,
      maxCombo: snapshot?.maxCombo ?? 0,
    };
  };

  return (
    <div className="overlay versus-result">
      <div className="versus-result-inner">
        <div className="versus-result-head">
          <h1 className={`overlay-title ${won ? 'is-win' : ''}`}>{won ? 'WINNER!' : 'GAME OVER'}</h1>
          <span className="mono-9">FINAL STANDINGS</span>
        </div>

        <div className="versus-result-body">
          <section className="panel panel-cream versus-result-list">
            <h2 className="panel-label">STANDINGS</h2>
            <ol className="result-list">
              {standings.map((player, index) => {
                const s = statsFor(player);
                return (
                  <li
                    key={player.id}
                    className={`versus-result-row ${player.id === you ? 'is-you' : ''} ${index === 0 ? 'is-top' : ''}`}
                  >
                    <span className="versus-result-place">{player.place ?? index + 1}</span>
                    <span className="versus-result-name">{player.name}</span>
                    <span className="mono-8">LINES {s.lines}</span>
                    <span className="mono-8">COMBO {s.maxCombo}</span>
                    <span className="versus-result-score">{s.score.toLocaleString('en-US')}</span>
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="panel panel-cream versus-result-breakdown">
            <h2 className="panel-label">YOUR BREAKDOWN</h2>
            {breakdown.map(([label, value]) => (
              <div key={label} className="result-row">
                <span className="result-row-label">{label}</span>
                <span className="result-row-value">{value.toLocaleString('en-US')}</span>
              </div>
            ))}
            <div className="result-row is-total">
              <span className="result-row-label">TOTAL</span>
              <span className="result-row-value">{(hud?.score ?? 0).toLocaleString('en-US')}</span>
            </div>
          </section>

          <section className="panel panel-dark versus-result-usage">
            <span className="mono-9 muted">EVENT USAGE</span>
            <div className="result-events">
              {EVENT_KINDS.map((kind) => (
                <div key={kind} className="result-event">
                  <span className={`menu-event-symbol is-${kind}`}>{EVENT_SYMBOLS[kind]}</span>
                  <span className="mono-9">×{stats?.eventUsed[kind] ?? 0}</span>
                </div>
              ))}
            </div>
            <div className="result-fever">
              <span className="mono-8 muted">FEVER 合計</span>
              <span className="result-fever-value">
                {((stats?.feverTotalMs ?? 0) / 1000).toFixed(1)}s
              </span>
            </div>
          </section>
        </div>

        <div className="versus-result-actions">
          <button className="btn" onClick={onRematch}>
            もう一戦
          </button>
          <button className="btn btn-ghost" onClick={onLeave}>
            部屋を出る
          </button>
        </div>
      </div>
    </div>
  );
}
