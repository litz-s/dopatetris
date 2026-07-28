/**
 * ゲーム画面。クリーム樹脂の筐体（DOM）の中央にブラウン管（Canvas）を嵌める。
 * レイアウトは 1120×720 の固定設計を CSS の scale でビューポートに合わせる。
 * 出典は docs/design/design-spec.html（01 REFERENCE SCREEN）。
 */
import { useEffect, useRef, useState } from 'react';
import { COMBO } from '@render/motion';
import { LINES_PER_LEVEL, STACK_MAX } from '@core/config/balance';
import { BOMB_EFFECTS, CLOVER_EFFECTS, COIN_EFFECTS, HEART_EFFECTS } from '@core/config/balance';
import type { EventKind, GameStats } from '@core/types';
import { formatKey } from '@input/keybinds';
import { Cabinet, useCabinetScale } from './components/Cabinet';
import { EventIcon } from './components/EventIcon';
import { MinoPreview } from './components/MinoPreview';
import { useGameEngine } from './useGameEngine';
import type { HudSnapshot } from './useGameEngine';
import type { Settings } from './storage';

/** 「+1 ×倍率」のライズ＆フェード時間。デザイン仕様 04-F */
const COMBO_POP_MS = COMBO.riseMs;

const STACK_LABELS: Record<EventKind, string> = {
  bomb: 'BOMB',
  heart: 'HEART',
  coin: 'COIN',
  clover: 'CLOVER',
};

/** 現在のスタック数で何が起きるかを一行で説明する */
function describeEffect(kind: EventKind, count: number): string {
  if (count < 1) return '';
  switch (kind) {
    case 'bomb': {
      const effect = BOMB_EFFECTS[count];
      return effect ? `下層${effect.clearRows}列消去＋フィーバー${effect.feverMs / 1000}秒` : '';
    }
    case 'heart': {
      const effect = HEART_EFFECTS[count];
      if (!effect) return '';
      return effect.gravity ? 'ホールド2回＋重力を1回発生' : 'ホールドが2回できる';
    }
    case 'coin': {
      const effect = COIN_EFFECTS[count];
      return effect ? `${effect.durationMs / 1000}秒間 落下速度-${effect.slowRate * 100}%` : '';
    }
    case 'clover': {
      const effect = CLOVER_EFFECTS[count];
      if (!effect) return 'あと1つでフィーバー（今は不発）';
      return `${effect.feverMs / 1000}秒フィーバー＋コンボ毎+${Math.round((effect.comboRate - 0.15) * 100)}%`;
    }
  }
}

type Props = {
  settings: Settings;
  /** ゲームオーバー時に呼ばれる。リザルト画面へ渡す集計を返す */
  onFinish: (stats: GameStats, score: number, lines: number, level: number) => void;
  /** メニューへ戻る */
  onExit: () => void;
};

export function GameScreen({ settings, onFinish, onExit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shakeRef = useRef<HTMLDivElement>(null);
  const cabinetRef = useRef<HTMLDivElement>(null);
  const scale = useCabinetScale();
  const finishedRef = useRef(false);

  const { hud, paused, restart, togglePause } = useGameEngine(
    { canvasRef, shakeRef, cabinetRef },
    scale,
    settings,
  );

  // ゲームオーバーはリザルト画面へ引き渡す。多重発火を防ぐ
  useEffect(() => {
    if (hud?.status !== 'over' || finishedRef.current) return;
    finishedRef.current = true;
    onFinish(hud.stats, hud.score, hud.lines, hud.level);
  }, [hud?.status, hud, onFinish]);

  const fever = hud?.fever === true;

  return (
    <Cabinet scale={scale} innerRef={cabinetRef} className={fever ? 'is-fever' : ''}>

        <TopBar hud={hud} />

        <div className="plate plate-left">
          <HoldPanel hud={hud} />
          <StackPanel hud={hud} />
          <KeyLog hud={hud} />
        </div>

        <div ref={shakeRef} className="board-shake">
          <div className="bezel">
            <div className="crt">
              <canvas ref={canvasRef} className="playfield" />
            </div>
          </div>
        </div>

        <div className="plate plate-right">
          <NextPanel hud={hud} />
          <ScorePanel hud={hud} />
          <ComboPanel hud={hud} />
          <KeyHints />
        </div>

        {fever && (
          <div className="fever-banner">
            <span className="fever-banner-text">FEVER TIME</span>
            <span className="fever-banner-count">{((hud?.feverRemainingMs ?? 0) / 1000).toFixed(1)}</span>
          </div>
        )}

      {paused && hud?.status === 'playing' && (
        <Overlay title="PAUSED">
          <button className="btn" onClick={togglePause}>
            RESUME
          </button>
          <button className="btn btn-ghost" onClick={restart}>
            RESTART
          </button>
          <button className="btn btn-ghost" onClick={onExit}>
            MENU
          </button>
        </Overlay>
      )}

      <div className="perf-readout">
        <span>{Math.round(hud?.fps ?? 0)} FPS</span>
        <span>{hud?.tier ?? 'ULTRA'}</span>
        <span>PARTICLES {hud?.particles ?? 0}</span>
      </div>
    </Cabinet>
  );
}

// ---------------------------------------------------------------- 各パーツ

function TopBar({ hud }: { hud: HudSnapshot | null }) {
  const lines = hud?.lines ?? 0;
  const progress = (lines % LINES_PER_LEVEL) / LINES_PER_LEVEL;
  const filled = Math.round(progress * 3);

  return (
    <div className="topbar">
      <div className="topbar-left">
        <div className="topbar-badge" />
        <span className="mono-9">SOLO PLAY / ENDLESS</span>
      </div>
      <div className="topbar-right">
        <span className="mono-9 ink">LV {String(hud?.level ?? 1).padStart(2, '0')}</span>
        <div className="level-bars">
          {[0, 1, 2].map((i) => (
            <div key={i} className={`level-bar ${i < filled ? 'is-on' : ''}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function HoldPanel({ hud }: { hud: HudSnapshot | null }) {
  const capacity = hud?.holdCapacity ?? 1;
  return (
    <section className="panel panel-cream">
      <h2 className="panel-label">HOLD {capacity === 2 ? '×2' : '×1'}</h2>
      <div className="hold-row">
        <div className="hold-slot">
          <MinoPreview type={hud?.hold ?? null} size={72} cell={20} />
        </div>
        <div className={`hold-slot hold-slot-2nd ${capacity === 2 ? 'is-open' : ''}`}>
          <span className="hold-2nd-mark">♥</span>
          <span className="mono-8">2ND</span>
        </div>
      </div>
    </section>
  );
}

/*
 * 以下のパネル群はソロと対戦で共通。VersusScreen からも読むため公開している。
 */

export function StackPanel({ hud }: { hud: HudSnapshot | null }) {
  const kind = hud?.stack.kind ?? null;
  const count = hud?.stack.count ?? 0;
  const cooldown = hud?.stackCooldownMs ?? 0;
  const onCooldown = cooldown > 0;
  const ratio = onCooldown ? 1 - cooldown / 10000 : 1;

  return (
    <section className={`panel panel-dark ${kind !== null ? 'is-locked' : ''}`}>
      <div className="panel-head">
        <span className="mono-9 muted">EVENT STACK</span>
        <span className="mono-9 stack-kind">{kind !== null ? STACK_LABELS[kind] : '- - -'}</span>
      </div>

      <div className="stack-slots">
        {Array.from({ length: STACK_MAX }, (_, index) =>
          kind !== null && index < count ? (
            <EventIcon key={index} event={kind} size={48} glow="L2" />
          ) : (
            <div key={index} className="stack-slot-empty">
              <span className="mono-8">{index + 1}</span>
            </div>
          ),
        )}
      </div>

      <div className="stack-effect">
        {kind !== null && count > 0 ? describeEffect(kind, count) : 'イベントタイルを消して溜める'}
      </div>

      <div className="cooldown">
        <div className="cooldown-fill" style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </div>
      <div className="panel-foot">
        <span className="mono-8">COOLDOWN</span>
        <span className="mono-8">{onCooldown ? `${(cooldown / 1000).toFixed(1)}s` : 'READY'}</span>
      </div>
    </section>
  );
}

export function KeyLog({ hud }: { hud: HudSnapshot | null }) {
  const recent = hud?.keyLog ?? [];
  const shown = recent.slice(-4);

  return (
    <div className="keylog">
      <div className="mono-8 muted">KEY LOG</div>
      <div className="keylog-row">
        {shown.length === 0 ? (
          <span className="keycap is-idle">—</span>
        ) : (
          shown.map((entry, index) => (
            <span
              key={`${entry.code}-${entry.at}`}
              className={`keycap ${index === shown.length - 1 ? 'is-hot' : ''}`}
            >
              {formatKey(entry.code)}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

export function NextPanel({ hud }: { hud: HudSnapshot | null }) {
  const next = hud?.next ?? [];
  return (
    <section className="panel panel-cream">
      <h2 className="panel-label">NEXT</h2>
      <div className="next-list">
        {next.map((item, index) => (
          <div
            key={`${item.type}-${index}`}
            className={`next-row ${index === 0 ? 'is-lead' : ''} ${item.hasEvent ? 'has-event' : ''}`}
          >
            <MinoPreview
              type={item.type}
              size={index === 0 ? 56 : 46}
              cell={index === 0 ? 16 : 14}
              dimmed={index > 0}
            />
            <span className="mono-8 next-label">{item.type}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ScorePanel({ hud }: { hud: HudSnapshot | null }) {
  return (
    <section className="panel panel-cream">
      <h2 className="panel-label">SCORE</h2>
      <div className="score-value">{(hud?.score ?? 0).toLocaleString('en-US')}</div>
      <div className="score-meta">
        <span className="mono-8 muted">LINES {hud?.lines ?? 0}</span>
        {hud?.fever === true && <span className="fever-chip">×1.5 FEVER</span>}
        {hud?.b2b === true && <span className="b2b-chip">B2B</span>}
      </div>
    </section>
  );
}

/** コンボ加算のたびに上へ流れる「+1 ×倍率」のポップ */
type ComboPop = { id: number; multiplier: number };

export function ComboPanel({ hud }: { hud: HudSnapshot | null }) {
  const combo = hud?.combo ?? 0;
  const comboRate = hud?.comboRate ?? 0.15;
  const tier = combo >= 20 ? 'tier4' : combo >= 10 ? 'tier3' : combo >= 5 ? 'tier2' : 'tier1';

  const [pops, setPops] = useState<ComboPop[]>([]);
  const prevCombo = useRef(0);
  const popId = useRef(0);

  useEffect(() => {
    // コンボが伸びた瞬間だけポップを出す。途切れた（0に戻った）ときは出さない
    if (combo > prevCombo.current && combo > 0) {
      const id = popId.current++;
      const multiplier = 1 + comboRate * combo;
      setPops((current) => [...current, { id, multiplier }]);
      // ライズ＆フェードは 560ms
      window.setTimeout(() => {
        setPops((current) => current.filter((p) => p.id !== id));
      }, COMBO_POP_MS);
    }
    prevCombo.current = combo;
  }, [combo, comboRate]);

  const fever = hud?.fever === true;

  return (
    <section className={`panel panel-dark combo-panel ${fever ? 'is-fever' : ''}`}>
      <div className="combo-stage">
        <div
          className={`combo-value ${tier} ${combo > 0 ? 'is-hot' : ''} ${fever ? 'is-disco' : ''}`}
          key={combo}
        >
          {combo}
        </div>
        {pops.map((pop) => (
          <span key={pop.id} className="combo-pop">
            +1 ×{pop.multiplier.toFixed(2)}
          </span>
        ))}
      </div>
      <div className="mono-9 muted">COMBO</div>
    </section>
  );
}

function KeyHints() {
  const hints: [string, string][] = [
    ['MOUSE', '追従'],
    ['A/D', '移動'],
    ['W/S', '回転'],
    ['SPC', 'HARD DROP'],
    ['E', 'STACK'],
    ['Q', '破棄'],
    ['SHIFT', 'HOLD'],
  ];

  return (
    <div className="hints">
      {hints.map(([key, label]) => (
        <div key={key} className="hint">
          <span className="hint-key">{key}</span>
          <span className="hint-label">{label}</span>
        </div>
      ))}
    </div>
  );
}

export function Overlay({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overlay">
      <div className="overlay-inner">
        <h1 className="overlay-title">{title}</h1>
        {children}
      </div>
    </div>
  );
}
