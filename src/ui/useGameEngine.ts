/**
 * ゲームループの統括。React の外で固定タイムステップを回し、
 * HUD 表示に必要な値だけを間引いて React 側へ流す。
 * 画面揺れは renderer が DOM の transform を直接書き換えるため、React は再描画しない。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createGame, getFeverRemaining, getStackCooldownRemaining, isFever, step } from '@core/game';
import {
  BOARD_WIDTH,
  COMBO_RATE_BASE,
  FIXED_TIMESTEP_MS,
  GARBAGE_DELAY_MS,
} from '@core/config/balance';
import { getPendingGarbage, receiveGarbage } from '@core/game';
import { BOARD_SYNC_INTERVAL_MS } from '@net/protocol';
import type { BoardSnapshot } from '@net/protocol';
import { encodeBoard } from '@net/snapshot';
import type { EventStack, GameState, GameStats, MinoType, QueuedMino } from '@core/types';
import { InputManager } from '@input/inputManager';
import type { KeyLogEntry } from '@input/inputManager';
import { audioEngine } from '@audio/audioEngine';
import { playForEvents } from '@audio/gameSound';
import { GameRenderer } from '@render/gameRenderer';
import { GRID } from '@render/theme';
import type { QualityTier } from '@render/quality/qualityProfiles';
import { DEFAULT_SETTINGS } from './storage';
import type { Settings } from './storage';

export type HudSnapshot = {
  score: number;
  level: number;
  lines: number;
  combo: number;
  /** 現在有効なコンボ係数。フィーバー中はクローバー効果で上がる */
  comboRate: number;
  b2b: boolean;
  next: QueuedMino[];
  hold: MinoType | null;
  holdCapacity: number;
  stack: EventStack;
  stackCooldownMs: number;
  fever: boolean;
  feverRemainingMs: number;
  status: GameState['status'];
  stats: GameStats;
  /** 着弾待ちのおじゃま行数（対戦時のみ動く） */
  pendingGarbage: number;
  clearing: boolean;
  keyLog: KeyLogEntry[];
  fps: number;
  tier: QualityTier;
  particles: number;
};

/** HUD の更新間隔。60fps で React を回さないための間引き */
const HUD_INTERVAL_MS = 70;

export type EngineRefs = {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** 画面揺れを適用する盤面ラッパー */
  shakeRef: React.RefObject<HTMLDivElement | null>;
  /** マウス追従の基準となる筐体要素 */
  cabinetRef: React.RefObject<HTMLDivElement | null>;
};

/**
 * 対戦時に外から差し込む口。
 * 指定がなければソロとして動き、ゲームループは通信を一切知らない。
 */
export type MultiplayerHooks = {
  /** 全員で共有する乱数シード */
  seed: number;
  /** 時間経過で加速するか */
  timePressure: boolean;
  /** 相手へ送るおじゃまが確定した */
  onAttack: (lines: number, holeColumn: number) => void;
  /** 力尽きた */
  onTopOut: () => void;
  /** 盤面スナップショットの定期送信 */
  onSnapshot: (snapshot: BoardSnapshot) => void;
  /** 受信済みのおじゃまを取り出す */
  drainIncoming: () => { lines: number; holeColumn: number }[];
};

export function useGameEngine(
  { canvasRef, shakeRef, cabinetRef }: EngineRefs,
  cabinetScale = 1,
  settings: Settings = DEFAULT_SETTINGS,
  multiplayer?: MultiplayerHooks,
) {
  const scaleRef = useRef(cabinetScale);
  scaleRef.current = cabinetScale;

  // コールバックは毎レンダー変わりうるので、ループを作り直さないよう ref で受ける
  const multiRef = useRef(multiplayer);
  multiRef.current = multiplayer;

  const stateRef = useRef<GameState | null>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const inputRef = useRef<InputManager | null>(null);
  const rafRef = useRef<number>(0);
  const pausedRef = useRef(false);

  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [paused, setPaused] = useState(false);

  const restart = useCallback(() => {
    const multi = multiRef.current;
    // 対戦では全員が同じシードで始める必要があるため、勝手に振り直さない
    stateRef.current =
      multi !== undefined
        ? createGame(multi.seed, { timePressure: multi.timePressure })
        : createGame(Math.floor(Math.random() * 0x7fffffff));
    pausedRef.current = false;
    setPaused(false);
  }, []);

  const togglePause = useCallback(() => {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const cabinet = cabinetRef.current;
    if (canvas === null || cabinet === null) return;

    const renderer = new GameRenderer();
    const input = new InputManager();
    rendererRef.current = renderer;
    inputRef.current = input;

    renderer.attach(canvas, shakeRef.current);
    renderer.resize(canvas, scaleRef.current);
    input.attach(cabinet);

    // OS の設定を尊重して振幅・点滅を落とす
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    renderer.quality.setReducedMotion(motionQuery.matches);
    const onMotionChange = (event: MediaQueryListEvent): void =>
      renderer.quality.setReducedMotion(event.matches);
    motionQuery.addEventListener('change', onMotionChange);

    /** 筐体の中での盤面の位置を求め、マウス列の算出に渡す */
    const syncPlayfieldRect = (): void => {
      const cabinetRect = cabinet.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      const scale = cabinetRect.width / cabinet.offsetWidth || 1;
      input.setPlayfieldRect((canvasRect.left - cabinetRect.left) / scale, GRID.cellPitch);
    };

    const onResize = (): void => {
      renderer.resize(canvas, scaleRef.current);
      syncPlayfieldRect();
    };
    window.addEventListener('resize', onResize);
    syncPlayfieldRect();

    const multi = multiRef.current;
    stateRef.current =
      multi !== undefined
        ? createGame(multi.seed, { timePressure: multi.timePressure })
        : createGame(Math.floor(Math.random() * 0x7fffffff));

    audioEngine.setFever(false);
    audioEngine.startMusic();

    let last = performance.now();
    let accumulator = 0;
    let hudTimer = 0;
    let snapshotTimer = 0;
    let reportedTopOut = false;

    const frame = (now: number): void => {
      rafRef.current = requestAnimationFrame(frame);

      const frameMs = Math.min(100, now - last);
      last = now;
      renderer.quality.sample(frameMs);

      if (input.consumePauseRequest()) {
        pausedRef.current = !pausedRef.current;
        setPaused(pausedRef.current);
      }

      const state = stateRef.current;
      if (state === null) return;

      const multiplayerHooks = multiRef.current;

      if (!pausedRef.current && state.status === 'playing') {
        // 届いたおじゃまを待機列へ入れてから進める
        if (multiplayerHooks !== undefined) {
          for (const incoming of multiplayerHooks.drainIncoming()) {
            stateRef.current = receiveGarbage(
              stateRef.current ?? state,
              incoming.lines,
              incoming.holeColumn,
            );
          }
        }

        accumulator += frameMs;
        let steps = 0;
        while (accumulator >= FIXED_TIMESTEP_MS && steps < 5) {
          const commands = input.update(FIXED_TIMESTEP_MS);
          const result = step(stateRef.current ?? state, FIXED_TIMESTEP_MS, commands);
          stateRef.current = result.state;
          if (result.events.length > 0) {
            renderer.handleEvents(result.events, result.state);
            playForEvents(audioEngine, result.events);

            // 攻撃が確定したら相手へ送る。穴の位置は送信側が決めて相手へ伝える
            if (multiplayerHooks !== undefined) {
              for (const event of result.events) {
                if (event.kind !== 'garbageSent') continue;
                multiplayerHooks.onAttack(
                  event.lines,
                  Math.floor(Math.random() * BOARD_WIDTH),
                );
              }
            }
          }
          accumulator -= FIXED_TIMESTEP_MS;
          steps += 1;
        }
        // 溜まりすぎたぶんは捨てる（タブ復帰時の早送りを防ぐ）
        if (steps >= 5) accumulator = 0;
      }

      const current = stateRef.current;
      if (current === null) return;

      renderer.update(frameMs);
      // BGM の拍を描画へ渡し、背景の脈動とグリッド明滅を曲に同期させる
      renderer.setBeatPhase(audioEngine.getBeatPhase());
      renderer.render(current);

      if (multiplayerHooks !== undefined) {
        // 着弾待ちのおじゃまを描画側へ伝える。切迫度は最も早く落ちてくるものを基準にする
        const pending = getPendingGarbage(current);
        let urgency = 0;
        if (current.pendingGarbage.length > 0) {
          let soonest = Infinity;
          for (const entry of current.pendingGarbage) soonest = Math.min(soonest, entry.readyAt);
          const remain = Math.max(0, soonest - current.elapsedMs);
          urgency = 1 - Math.min(1, remain / GARBAGE_DELAY_MS);
        }
        renderer.setPendingGarbage(pending, urgency);

        // 盤面スナップショットを定期送信する
        snapshotTimer += frameMs;
        if (snapshotTimer >= BOARD_SYNC_INTERVAL_MS) {
          snapshotTimer = 0;
          multiplayerHooks.onSnapshot(encodeBoard(current));
        }

        // 力尽きたことは1度だけ通知する
        if (current.status === 'over' && !reportedTopOut) {
          reportedTopOut = true;
          multiplayerHooks.onTopOut();
        }
      }

      hudTimer += frameMs;
      if (hudTimer >= HUD_INTERVAL_MS) {
        hudTimer = 0;
        setHud({
          score: current.score,
          level: current.level,
          lines: current.lines,
          combo: current.combo,
          comboRate: isFever(current) ? current.fever.comboRate : COMBO_RATE_BASE,
          b2b: current.b2b,
          next: current.next,
          hold: current.hold,
          holdCapacity: current.holdCapacity,
          stack: current.stack,
          stackCooldownMs: getStackCooldownRemaining(current),
          fever: isFever(current),
          feverRemainingMs: getFeverRemaining(current),
          status: current.status,
          stats: current.stats,
          pendingGarbage: getPendingGarbage(current),
          clearing: current.clearing !== null,
          keyLog: input.getKeyLog(now),
          fps: renderer.quality.getFps(),
          tier: renderer.quality.getTier(),
          particles: renderer.getParticleCount(),
        });
      }
    };

    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      audioEngine.stopMusic();
      window.removeEventListener('resize', onResize);
      motionQuery.removeEventListener('change', onMotionChange);
      input.detach();
      renderer.detach();
      rendererRef.current = null;
      inputRef.current = null;
    };
  }, [canvasRef, shakeRef, cabinetRef]);

  // 設定変更を描画・入力へ反映する
  useEffect(() => {
    rendererRef.current?.quality.setSettings(settings);
    inputRef.current?.setOptions({
      mouseFollow: settings.mouseFollow,
      smoothing: settings.mouseSmoothing,
    });
  }, [settings]);

  // 筐体の拡縮率が変わったらキャンバスの実解像度を追従させる
  useEffect(() => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (canvas === null || renderer === null) return;
    renderer.resize(canvas, cabinetScale);
  }, [cabinetScale, canvasRef]);

  return { hud, paused, restart, togglePause, renderer: rendererRef, input: inputRef };
}
