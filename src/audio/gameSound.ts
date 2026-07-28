/**
 * core が返す GameEvent を SoundCue へ変換する層。
 *
 * core は音の存在を知らず、ここが唯一の接続点になる。
 * 発火点はデザイン仕様（05 NOTES / SOUND HOOK）で確定済み:
 *   移動 / 回転 / ソフト着地 / ハードドロップ / 各列ポップ（左→右で音程上昇）/
 *   爆発 / 重力着地 / フィーバー突入・終了 / コンボ加算（段階でピッチ+）
 */
import { BOARD_WIDTH, LINE_CLEAR_COLUMN_DELAY_MS } from '@core/config/balance';
import type { GameEvent } from '@core/events';
import type { AudioEngine } from './audioEngine';

/** コンボ段階ごとのピッチ上げ（半音）。段階が上がるほど高くなる */
function comboSemitones(combo: number): number {
  if (combo <= 0) return 0;
  // 1コンボごとに1半音、上限は2オクターブ
  return Math.min(24, combo);
}

/** スタック数に応じたピッチ上げ。溜まるほど期待感が上がる */
function stackSemitones(count: number): number {
  return (count - 1) * 3;
}

export function playForEvents(engine: AudioEngine, events: readonly GameEvent[]): void {
  for (const event of events) {
    switch (event.kind) {
      case 'pieceMoved':
        engine.play('move');
        break;

      case 'pieceRotated':
        engine.play('rotate');
        break;

      case 'hardDropped':
        engine.play('hardDrop', { velocity: 0.7 + Math.min(0.3, event.distance * 0.02) });
        break;

      case 'pieceLocked':
        engine.play('softLand');
        break;

      case 'holdUsed':
        engine.play('hold');
        break;

      case 'linesCleared': {
        // 列ごとに 45ms ずらし、左→右で音程を上げていく
        for (let x = 0; x < BOARD_WIDTH; x++) {
          engine.play('clearPop', {
            delayMs: x * LINE_CLEAR_COLUMN_DELAY_MS,
            semitones: x * 2,
            velocity: 0.55,
          });
        }

        engine.play(event.rows.length >= 4 ? 'tetris' : 'lineClear', {
          velocity: 0.8 + event.rows.length * 0.05,
        });

        if (event.combo > 1) {
          engine.play('combo', {
            semitones: comboSemitones(event.combo),
            delayMs: 60,
          });
        }
        break;
      }

      case 'stackLocked':
        engine.play('stackLock');
        break;

      case 'stackGained':
        engine.play('stackGain', { semitones: stackSemitones(event.count) });
        break;

      case 'stackRejected':
        engine.play('uiMove', { velocity: 0.6 });
        break;

      case 'stackTriggered':
        engine.play('stackTrigger', { semitones: stackSemitones(event.count) });
        break;

      case 'stackMisfire':
        engine.play('stackMisfire');
        break;

      case 'bombCleared':
        engine.play('explode');
        break;

      case 'gravityApplied':
        engine.play('gravityLand');
        break;

      case 'feverStarted':
        engine.play('feverStart');
        engine.setFever(true);
        break;

      case 'feverEnded':
        engine.play('feverEnd');
        engine.setFever(false);
        break;

      case 'levelUp':
        engine.play('levelUp');
        break;

      case 'perfectClear':
        engine.play('tetris', { semitones: 5 });
        break;

      case 'garbageQueued':
        // 溜まるほど高くして、危険度が耳でも分かるようにする
        engine.play('garbageIncoming', { semitones: Math.min(12, event.lines) });
        break;

      case 'garbageApplied':
        engine.play('garbageLand', { velocity: 0.7 + Math.min(0.3, event.lines * 0.06) });
        break;

      case 'garbageSent':
        engine.play('attackSent', { semitones: Math.min(12, event.lines * 2) });
        break;

      case 'gameOver':
        engine.stopMusic();
        engine.play('gameOver');
        break;

      default:
        break;
    }
  }
}
