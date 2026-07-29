/**
 * 画面遷移の統括。
 *
 *   [初回のみ WARNING] → MENU ─┬─ GAME → RESULT → MENU / GAME
 *                              ├─ RANKING
 *                              ├─ CONFIG
 *                              └─ HOW TO
 */
import { useCallback, useEffect, useState } from 'react';
import { audioEngine } from '@audio/audioEngine';
import type { GameStats } from '@core/types';
import { GameScreen } from './GameScreen';
import { ConfigScreen } from './screens/ConfigScreen';
import { HowToScreen } from './screens/HowToScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { VersusScreen } from './screens/VersusScreen';
import { MenuScreen } from './screens/MenuScreen';
import type { MenuAction } from './screens/MenuScreen';
import { RankingScreen } from './screens/RankingScreen';
import { ResultScreen } from './screens/ResultScreen';
import { WarningScreen } from './screens/WarningScreen';
import {
  hasSeenPhotosensitiveWarning,
  loadSettings,
  markPhotosensitiveWarningSeen,
  saveSettings,
  submitHighScore,
} from './storage';
import type { RunResult, Settings } from './storage';
import { useRoom } from './useRoom';
import './styles.css';

type Screen =
  'warning' | 'menu' | 'game' | 'result' | 'ranking' | 'config' | 'howto' | 'lobby' | 'versus';

export function App() {
  const [screen, setScreen] = useState<Screen>(() =>
    hasSeenPhotosensitiveWarning() ? 'menu' : 'warning',
  );
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const room = useRoom();
  const [result, setResult] = useState<RunResult | null>(null);
  /** ゲーム画面を作り直すためのキー。リトライで状態を完全にリセットする */
  const [runId, setRunId] = useState(0);

  /*
   * ブラウザの自動再生制限があるため、ユーザー操作で AudioContext を解放する。
   * 操作の種類によっては拒否されることがあるので、成功するまで listener を外さない。
   */
  useEffect(() => {
    let done = false;

    const detach = (): void => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };

    function unlock(): void {
      if (done) return;
      void audioEngine.unlock().then((ok) => {
        if (!ok) return;
        done = true;
        detach();
      });
    }

    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return detach;
  }, []);

  // 音量設定を反映する
  useEffect(() => {
    audioEngine.setVolumes({
      master: settings.masterVolume,
      sfx: settings.sfxVolume,
      music: settings.musicVolume,
      muted: settings.muted,
    });
  }, [settings.masterVolume, settings.sfxVolume, settings.musicVolume, settings.muted]);

  // サーバーから開始の合図が来たら対戦画面へ移る
  useEffect(() => {
    if (room.match !== null) setScreen('versus');
  }, [room.match]);

  const updateSettings = useCallback((next: Settings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  const startGame = useCallback(() => {
    setRunId((id) => id + 1);
    setScreen('game');
  }, []);

  const handleMenu = useCallback(
    (action: MenuAction) => {
      switch (action) {
        case 'solo':
          startGame();
          break;
        case 'ranking':
          setScreen('ranking');
          break;
        case 'config':
          setScreen('config');
          break;
        case 'howto':
          setScreen('howto');
          break;
        case 'room':
          setScreen('lobby');
          break;
      }
    },
    [startGame],
  );

  const handleFinish = useCallback(
    (stats: GameStats, score: number, lines: number, level: number) => {
      const entry = {
        score,
        lines,
        level,
        maxCombo: stats.maxCombo,
        date: new Date().toISOString(),
      };
      const { rank } = submitHighScore(entry);

      setResult({
        score,
        lines,
        level,
        maxCombo: stats.maxCombo,
        feverTotalMs: stats.feverTotalMs,
        eventUsed: stats.eventUsed,
        breakdown: stats.breakdown,
        rank,
        isBest: rank === 1,
      });
      setScreen('result');
    },
    [],
  );

  switch (screen) {
    case 'warning':
      return (
        <WarningScreen
          onAccept={() => {
            markPhotosensitiveWarningSeen();
            setScreen('menu');
          }}
        />
      );

    case 'game':
      return (
        <GameScreen
          key={runId}
          settings={settings}
          onFinish={handleFinish}
          onExit={() => setScreen('menu')}
        />
      );

    case 'result':
      return result === null ? (
        <MenuScreen onSelect={handleMenu} />
      ) : (
        <ResultScreen result={result} onRetry={startGame} onMenu={() => setScreen('menu')} />
      );

    case 'ranking':
      return <RankingScreen onClose={() => setScreen('menu')} />;

    case 'config':
      return (
        <ConfigScreen
          settings={settings}
          onChange={updateSettings}
          onClose={() => setScreen('menu')}
        />
      );

    case 'lobby':
      return <LobbyScreen room={room} onExit={() => setScreen('menu')} />;

    case 'versus':
      return room.match === null ? (
        <LobbyScreen room={room} onExit={() => setScreen('menu')} />
      ) : (
        <VersusScreen
          key={room.match.seed}
          room={room}
          settings={settings}
          seed={room.match.seed}
          timePressure={room.match.rules.timePressure}
          onExit={() => {
            // サーバー側の部屋も待機状態へ戻し、同じ顔ぶれで再戦できるようにする
            room.returnToLobby();
            setScreen('lobby');
          }}
          onLeave={() => {
            room.returnToLobby();
            room.leaveRoom();
            setScreen('menu');
          }}
        />
      );

    case 'howto':
      return <HowToScreen onClose={() => setScreen('menu')} />;

    case 'menu':
      return <MenuScreen onSelect={handleMenu} />;
  }
}
