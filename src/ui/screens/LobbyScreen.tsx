/**
 * 部屋 / ロビー。出典は docs/design/design-screens.html（3b LOBBY）。
 * 部屋作成・参加・Ready・カウントダウン・チャットを1画面に収める。
 */
import { useEffect, useRef, useState } from 'react';
import { MAX_PLAYERS } from '@net/protocol';
import type { RoomRules } from '@net/protocol';
import { Cabinet, useCabinetScale } from '../components/Cabinet';
import type { useRoom } from '../useRoom';

type Props = {
  room: ReturnType<typeof useRoom>;
  onExit: () => void;
};

const RULE_LABELS: { key: keyof RoomRules; label: string; note: string }[] = [
  { key: 'eventStack', label: 'イベントスタック', note: '4種のイベントを出す' },
  { key: 'clover', label: 'クローバー', note: '攻撃倍率が上がる札' },
  { key: 'garbage', label: 'おじゃま送信', note: '消した分だけ相手へ送る' },
  { key: 'timePressure', label: '時間で加速', note: '経過時間で落下が速くなる' },
];

export function LobbyScreen({ room, onExit }: Props) {
  const scale = useCabinetScale();
  const [name, setName] = useState(() => localStorage.getItem('dopatetris.name') ?? '');
  const [joinCode, setJoinCode] = useState('');
  const [chatText, setChatText] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const inRoom = room.code !== null;
  const serverStarting = room.connection === 'connecting' || room.connection === 'waking';

  // 新しい発言が来たら一番下まで送る
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: 'end' });
  }, [room.chat]);

  // 無料サーバーが休止中でも、画面を開いた時点から起動を始める。
  useEffect(() => {
    room.connect();
  }, [room.connect]);

  const remember = (value: string): void => {
    setName(value);
    try {
      localStorage.setItem('dopatetris.name', value);
    } catch {
      // 保存できなくても続行する
    }
  };

  const submitChat = (event: React.FormEvent): void => {
    event.preventDefault();
    const text = chatText.trim();
    if (text.length === 0) return;
    room.sendChat(text);
    setChatText('');
  };

  const copyCode = (): void => {
    if (room.code === null) return;
    void navigator.clipboard?.writeText(room.code);
  };

  return (
    <Cabinet scale={scale}>
      <div className="lobby">
        <div className="lobby-head">
          <div>
            <span className="mono-9">ROOM</span>
            <div className="lobby-code">{room.code ?? '- - - -'}</div>
          </div>

          <div className="lobby-head-right">
            <span className={`lobby-conn is-${room.connection}`}>
              {connectionLabel(room.connection)}
            </span>
            {inRoom && (
              <button className="btn btn-ghost lobby-copy" onClick={copyCode}>
                COPY
              </button>
            )}
          </div>
        </div>

        {room.error !== null && (
          <div className="lobby-error" onClick={room.clearError}>
            {room.error}
          </div>
        )}

        {serverStarting && (
          <div className="lobby-waking" role="status">
            <span className="lobby-waking-dot" aria-hidden="true" />
            <div>
              <strong>対戦サーバーを起動しています</strong>
              <span>無料サーバーの復帰には最大1分ほどかかります。この画面のままお待ちください。</span>
            </div>
          </div>
        )}

        {!inRoom ? (
          <section className="panel panel-cream lobby-entry">
            <h2 className="panel-label">部屋に入る</h2>

            <label className="lobby-field">
              <span className="config-toggle-label">プレイヤー名</span>
              <input
                className="lobby-input"
                value={name}
                maxLength={12}
                placeholder="SUZU"
                onChange={(e) => remember(e.target.value)}
              />
            </label>

            <div className="lobby-entry-actions">
              <button
                className="btn"
                disabled={serverStarting}
                onClick={() => room.createRoom(name)}
              >
                部屋を作る
              </button>

              <div className="lobby-join">
                <input
                  className="lobby-input lobby-input-code"
                  value={joinCode}
                  maxLength={6}
                  placeholder="CODE"
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                />
                <button
                  className="btn btn-ghost"
                  disabled={serverStarting || joinCode.trim().length === 0}
                  onClick={() => room.joinRoom(joinCode, name)}
                >
                  参加する
                </button>
              </div>
            </div>

            <p className="config-note">
              同じ端末で試すときは、別のタブでもう一度この画面を開いて
              同じコードで参加してください。
            </p>
          </section>
        ) : (
          <div className="lobby-body">
            <section className="panel panel-cream lobby-players">
              <h2 className="panel-label">
                PLAYERS {room.players.length} / {MAX_PLAYERS}
              </h2>

              <ul className="lobby-list">
                {room.players.map((player, index) => (
                  <li
                    key={player.id}
                    className={`lobby-player ${player.id === room.you ? 'is-you' : ''}`}
                  >
                    <span className="mono-9 lobby-seat">{index + 1}P</span>
                    <span className="lobby-name">{player.name}</span>
                    {player.host && <span className="lobby-tag">HOST</span>}
                    {player.id === room.you && <span className="lobby-tag is-you">あなた</span>}
                    <span className={`lobby-ready ${player.ready ? 'is-on' : ''}`}>
                      {player.ready ? 'READY' : 'WAIT…'}
                    </span>
                  </li>
                ))}

                {Array.from({ length: MAX_PLAYERS - room.players.length }, (_, i) => (
                  <li key={`empty-${i}`} className="lobby-player is-empty">
                    <span className="mono-9 lobby-seat">{room.players.length + i + 1}P</span>
                    <span className="lobby-name">参加者を待っています</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="panel panel-dark lobby-rules">
              <span className="mono-9 muted">RULES</span>
              {RULE_LABELS.map(({ key, label, note }) => (
                <div key={key} className="lobby-rule">
                  <div className="lobby-rule-text">
                    <span className="config-toggle-label">{label}</span>
                    <span className="lobby-rule-note">{note}</span>
                  </div>
                  <button
                    className={`config-toggle ${room.rules[key] ? 'is-on' : ''}`}
                    disabled={!room.isHost}
                    onClick={() => room.updateRules({ ...room.rules, [key]: !room.rules[key] })}
                  >
                    {room.rules[key] ? 'ON' : 'OFF'}
                  </button>
                </div>
              ))}
              {!room.isHost && <p className="config-note">ルールはホストだけが変更できます</p>}
            </section>

            <section className="panel panel-cream lobby-chat">
              <h2 className="panel-label">CHAT</h2>
              <div className="lobby-chat-log">
                {room.chat.map((line) => (
                  <div key={line.id} className="lobby-chat-line">
                    <span className="lobby-chat-name">{line.name}</span>
                    <span>{line.text}</span>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <form className="lobby-chat-form" onSubmit={submitChat}>
                <input
                  className="lobby-input"
                  value={chatText}
                  maxLength={120}
                  placeholder="メッセージを入力…"
                  onChange={(e) => setChatText(e.target.value)}
                />
                <button className="btn btn-ghost" type="submit">
                  SEND
                </button>
              </form>
            </section>
          </div>
        )}

        {room.countdown !== null && (
          <div className="lobby-countdown">
            <span className="mono-9">STARTING IN</span>
            <div className="lobby-countdown-value" key={room.countdown}>
              {room.countdown}
            </div>
          </div>
        )}

        <div className="lobby-foot">
          {inRoom && (
            <button
              className={`btn ${room.me?.ready === true ? 'btn-ghost' : ''}`}
              onClick={() => room.setReady(room.me?.ready !== true)}
            >
              {room.me?.ready === true ? 'READY 解除' : 'READY!'}
            </button>
          )}
          <button
            className="btn btn-ghost"
            onClick={() => {
              room.leaveRoom();
              onExit();
            }}
          >
            {inRoom ? '部屋を出る' : '戻る'}
          </button>
        </div>
      </div>
    </Cabinet>
  );
}

function connectionLabel(state: string): string {
  switch (state) {
    case 'open':
      return 'CONNECTED';
    case 'connecting':
      return 'CONNECTING…';
    case 'waking':
      return 'SERVER STARTING…';
    case 'closed':
      return 'DISCONNECTED';
    case 'error':
      return 'SERVER NOT FOUND';
    default:
      return 'OFFLINE';
  }
}
