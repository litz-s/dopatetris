/**
 * メインメニュー。出典は docs/design/design-screens.html（3a MENU）。
 * タイトルは画面内（暗いパネル）で発光させ、選択肢はクリーム面の物理ボタンとして置く。
 */
import { useCallback, useEffect, useState } from 'react';
import { EVENT_KINDS } from '@core/types';
import { EVENT_SYMBOLS } from '@render/theme';
import { Cabinet, useCabinetScale } from '../components/Cabinet';
import { getBestScore, loadHighScores } from '../storage';

export type MenuAction = 'solo' | 'room' | 'ranking' | 'config' | 'howto';

type Item = {
  action: MenuAction;
  label: string;
  note: string;
  /** 未実装項目。選ぶと COMING SOON を出す */
  locked?: boolean;
};

const ITEMS: Item[] = [
  { action: 'solo', label: 'SOLO PLAY', note: 'ひとりで記録に挑む' },
  { action: 'room', label: 'ROOM', note: '部屋を作る / 参加する' },
  { action: 'ranking', label: 'RANKING', note: 'ローカル記録 上位10件' },
  { action: 'config', label: 'CONFIG', note: 'キー割当・演出強度' },
  { action: 'howto', label: 'HOW TO', note: 'イベントスタックの遊び方' },
];

const EVENT_NAMES: Record<string, string> = {
  bomb: 'BOMB',
  heart: 'HEART',
  coin: 'COIN',
  clover: 'CLOVER',
};

type Props = {
  onSelect: (action: MenuAction) => void;
};

/**
 * 下部を流れるマーキー。
 * オンライン版では「NOW PLAYING」等が流れる想定だが、ソロ版ではローカル記録と
 * 遊び方のヒントを流す。同じ内容を2組並べて隙間なくループさせる。
 */
function Marquee({ best, plays }: { best: number; plays: number }) {
  const messages =
    best > 0
      ? [
          `YOUR BEST ${best.toLocaleString('en-US')}`,
          `PLAYED ${plays}`,
          'CLOVER×4 IS BROKEN',
          '列は左から右へ消える',
          'BOMB×4 で下層4列が吹き飛ぶ',
        ]
      : [
          'まだ記録がありません',
          'SOLO PLAY で1戦してみよう',
          'イベントは同じ種類を揃えて撃つ',
          'E で発動 / Q で破棄',
        ];

  const strip = (
    <span className="marquee-strip" aria-hidden="true">
      {messages.map((text, i) => (
        <span key={i} className="marquee-item">
          {text}
          <span className="marquee-sep">///</span>
        </span>
      ))}
    </span>
  );

  return (
    <div className="marquee">
      <div className="marquee-track">
        {strip}
        {strip}
      </div>
    </div>
  );
}

export function MenuScreen({ onSelect }: Props) {
  const scale = useCabinetScale();
  const [index, setIndex] = useState(0);
  const [locked, setLocked] = useState(false);
  const best = getBestScore();
  const playCount = loadHighScores().length;

  const choose = useCallback(
    (i: number) => {
      const item = ITEMS[i];
      if (item === undefined) return;
      if (item.locked === true) {
        setLocked(true);
        window.setTimeout(() => setLocked(false), 1600);
        return;
      }
      onSelect(item.action);
    },
    [onSelect],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.code === 'ArrowDown' || event.code === 'KeyS') {
        event.preventDefault();
        setIndex((i) => (i + 1) % ITEMS.length);
      } else if (event.code === 'ArrowUp' || event.code === 'KeyW') {
        event.preventDefault();
        setIndex((i) => (i - 1 + ITEMS.length) % ITEMS.length);
      } else if (event.code === 'Enter' || event.code === 'Space') {
        event.preventDefault();
        setIndex((i) => {
          choose(i);
          return i;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [choose]);

  return (
    <Cabinet scale={scale}>
      <div className="menu">
        <div className="menu-left">
          <span className="mono-9">FAMILY BLOCK SYSTEM / v0.1</span>

          <div className="menu-logo">
            <span className="menu-logo-line">DOPAGAKI</span>
            <span className="menu-logo-line is-accent">TETRIS</span>
          </div>

          <span className="menu-press mono-9">PRESS ENTER TO START</span>

          <nav className="menu-list">
            {ITEMS.map((item, i) => (
              <button
                key={item.action}
                className={`menu-item ${i === index ? 'is-active' : ''} ${item.locked === true ? 'is-locked' : ''}`}
                onMouseEnter={() => setIndex(i)}
                onClick={() => choose(i)}
              >
                <span className="menu-item-arrow">▶</span>
                <span className="menu-item-label">{item.label}</span>
                <span className="menu-item-note">{item.note}</span>
                {item.locked === true && <span className="menu-item-tag">SOON</span>}
              </button>
            ))}
          </nav>

          {locked && <div className="menu-toast">COMING SOON — 第2弾で実装します</div>}
        </div>

        <Marquee best={best?.score ?? 0} plays={playCount} />

        <div className="menu-right">
          <section className="panel panel-cream">
            <h2 className="panel-label">YOUR BEST</h2>
            <div className="menu-best">{(best?.score ?? 0).toLocaleString('en-US')}</div>
            <div className="menu-best-meta">
              <span className="mono-8">MAX COMBO {best?.maxCombo ?? 0}</span>
              <span className="mono-8">LINES {best?.lines ?? 0}</span>
            </div>
          </section>

          <section className="panel panel-dark">
            <span className="mono-9 muted">EVENT</span>
            <div className="menu-events">
              {EVENT_KINDS.map((kind) => (
                <div key={kind} className="menu-event">
                  <span className={`menu-event-symbol is-${kind}`}>{EVENT_SYMBOLS[kind]}</span>
                  <span className="mono-8">{EVENT_NAMES[kind]}</span>
                </div>
              ))}
            </div>
            <p className="menu-event-note">
              ミノに紛れる4種のイベント。
              <br />
              溜めて撃つ。
            </p>
          </section>
        </div>

        <div className="menu-hints">
          <span className="hint-key">↑↓</span>
          <span className="hint-label">選択</span>
          <span className="hint-key">ENTER</span>
          <span className="hint-label">決定</span>
          <span className="hint-key">ESC</span>
          <span className="hint-label">戻る</span>
        </div>
      </div>
    </Cabinet>
  );
}
