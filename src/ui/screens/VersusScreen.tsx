/**
 * 対戦画面。出典は docs/design/design-screens.html（3c VERSUS 4P）。
 * 自分の盤面は中央フルサイズ、相手は右に縮小盤で並べる。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BoardSnapshot, PlayerId } from '@net/protocol';
import { Cabinet, useCabinetScale } from '../components/Cabinet';
import { RivalBoard } from '../components/RivalBoard';
import { VersusResult } from '../components/VersusResult';
import {
  ComboPanel,
  HoldPanel,
  KeyLog,
  NextPanel,
  Overlay,
  ScorePanel,
  StackPanel,
} from '../GameScreen';
import { useGameEngine } from '../useGameEngine';
import type { MultiplayerHooks } from '../useGameEngine';
import type { Settings } from '../storage';
import type { useRoom } from '../useRoom';

type Props = {
  room: ReturnType<typeof useRoom>;
  settings: Settings;
  seed: number;
  timePressure: boolean;
  /** ロビーへ戻る（同じ顔ぶれで再戦できる状態にする） */
  onExit: () => void;
  /** 部屋そのものを出る */
  onLeave: () => void;
};

/** 相手の盤面は毎フレーム変わるので、React へは間引いて渡す */
const RIVAL_REFRESH_MS = 120;

/** 攻撃ポップが飛んでいく時間 */
const ATTACK_POP_MS = 700;

export function VersusScreen({ room, settings, seed, timePressure, onExit, onLeave }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shakeRef = useRef<HTMLDivElement>(null);
  const cabinetRef = useRef<HTMLDivElement>(null);
  const scale = useCabinetScale();

  const [rivals, setRivals] = useState<Map<PlayerId, BoardSnapshot>>(new Map());
  const [elapsed, setElapsed] = useState(0);
  /** 送った攻撃を右へ飛ばす表示 */
  const [sentPops, setSentPops] = useState<{ id: number; lines: number }[]>([]);
  const popId = useRef(0);

  const sendAttack = room.sendAttack;
  const showAttack = useCallback(
    (lines: number, holeColumn: number) => {
      sendAttack(lines, holeColumn);

      const id = popId.current++;
      setSentPops((current) => [...current, { id, lines }]);
      window.setTimeout(() => {
        setSentPops((current) => current.filter((p) => p.id !== id));
      }, ATTACK_POP_MS);
    },
    [sendAttack],
  );

  const multiplayer = useMemo<MultiplayerHooks>(
    () => ({
      seed,
      timePressure,
      onAttack: showAttack,
      onTopOut: room.sendTopOut,
      onSnapshot: room.sendBoard,
      drainIncoming: room.drainIncoming,
    }),
    [seed, timePressure, showAttack, room.sendTopOut, room.sendBoard, room.drainIncoming],
  );

  const { hud, paused, togglePause } = useGameEngine(
    { canvasRef, shakeRef, cabinetRef },
    scale,
    settings,
    multiplayer,
  );

  // 相手の盤面と経過時間を一定間隔で拾い上げる
  useEffect(() => {
    const timer = window.setInterval(() => {
      setRivals(new Map(room.rivalsRef.current));
      setElapsed((current) => current + RIVAL_REFRESH_MS);
    }, RIVAL_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [room.rivalsRef]);

  const others = room.players.filter((p) => p.id !== room.you);
  const alive = room.players.filter((p) => !p.out).length;
  const myRank = room.me?.place;

  const fever = hud?.fever === true;
  const finished = room.standings !== null;

  return (
    <Cabinet scale={scale} innerRef={cabinetRef} className={fever ? 'is-fever' : ''}>
      <div className="topbar">
        <div className="topbar-left">
          <div className="topbar-badge" />
          <span className="mono-9">ROOM #{room.code ?? '----'}</span>
        </div>
        <div className="topbar-right">
          <span className="mono-9 ink">
            RANK {myRank ?? alive} / {room.players.length}
          </span>
          <span className="mono-9 ink">{formatTime(elapsed)}</span>
        </div>
      </div>

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

        {/* 送った攻撃が相手側（右）へ飛んでいく */}
        {sentPops.map((pop) => (
          <span key={pop.id} className="attack-pop">
            +{pop.lines}
          </span>
        ))}

        {/* 着弾待ちの警告 */}
        {(hud?.pendingGarbage ?? 0) > 0 && (
          <div className="incoming-warning">
            <span className="incoming-label">INCOMING</span>
            <span className="incoming-count">{hud?.pendingGarbage}</span>
          </div>
        )}
      </div>

      <div className="plate plate-right versus-right">
        <ScorePanel hud={hud} />
        <ComboPanel hud={hud} />
        <NextPanel hud={hud} />
      </div>

      <section className="versus-rivals">
        <span className="mono-9 muted">RIVALS</span>
        <div className="versus-rival-list">
          {others.map((player) => (
            <RivalBoard key={player.id} player={player} snapshot={rivals.get(player.id)} />
          ))}
          {others.length === 0 && <span className="config-note">相手がいません</span>}
        </div>
      </section>

      {hud?.status === 'over' && !finished && (
        <Overlay title="K.O.">
          <div className="final-score">{(hud.score ?? 0).toLocaleString('en-US')}</div>
          <p className="config-note">他のプレイヤーの決着を待っています…</p>
          <button className="btn btn-ghost" onClick={onExit}>
            ロビーへ戻る
          </button>
        </Overlay>
      )}

      {finished && room.standings !== null && (
        <VersusResult
          standings={room.standings}
          rivals={rivals}
          you={room.you}
          hud={hud}
          onRematch={onExit}
          onLeave={onLeave}
        />
      )}

      {paused && hud?.status === 'playing' && (
        <Overlay title="PAUSED">
          <p className="config-note">対戦中は相手を待たせています。早めに再開してください。</p>
          <button className="btn" onClick={togglePause}>
            RESUME
          </button>
        </Overlay>
      )}
    </Cabinet>
  );
}

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const minutes = String(Math.floor(total / 60)).padStart(2, '0');
  const seconds = String(total % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}
