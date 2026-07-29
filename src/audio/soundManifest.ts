/**
 * サウンドマニフェスト。キューと音源実装の対応表。
 *
 * ここが「合成音」と「音源ファイル」の差し替えポイント。
 * 音源ファイルが用意できたら、該当行を
 *   bomb: new SampleSource('/sfx/bomb.wav')
 * のように置き換えるだけでよい。ゲームロジックは変更しない。
 *
 * 発火点はデザイン仕様（05 NOTES / SOUND HOOK）で確定済み。
 */
import type { AudioSource } from './audioSource';
import { SynthSource } from './synth';

export type SoundCue =
  | 'move'
  | 'rotate'
  | 'softLand'
  | 'hardDrop'
  /** ライン消去の各列ポップ。左→右で音程が上昇する */
  | 'clearPop'
  | 'lineClear'
  | 'tetris'
  /** 4列消しのチャージ。240ms かけて唸りながら上がる */
  | 'tetrisCharge'
  /** 白い横スイープが盤面を貫く 200ms */
  | 'tetrisSweep'
  /** 圧縮消滅の着弾 */
  | 'tetrisImpact'
  /** T-Spin の「カチッ」。紫フラッシュと同フレーム */
  | 'tspin'
  | 'explode'
  | 'gravityLand'
  | 'feverStart'
  | 'feverEnd'
  /** コンボ加算。段階でピッチが上がる */
  | 'combo'
  | 'stackGain'
  | 'stackLock'
  | 'stackTrigger'
  | 'stackMisfire'
  | 'hold'
  | 'levelUp'
  | 'gameOver'
  | 'uiMove'
  | 'uiConfirm'
  /** おじゃまが届いて待機列に入った */
  | 'garbageIncoming'
  /** おじゃまが盤面へ着弾した */
  | 'garbageLand'
  /** 相手へ攻撃を送った */
  | 'attackSent';

export const SOUND_MANIFEST: Record<SoundCue, AudioSource> = {
  // ---- 操作
  move: new SynthSource([{ wave: 'square25', freq: 320, durationMs: 32, gain: 0.1, attackMs: 1 }]),
  rotate: new SynthSource([
    { wave: 'square', freq: 420, freqEnd: 620, durationMs: 55, gain: 0.12, attackMs: 1 },
  ]),
  hold: new SynthSource([
    { wave: 'triangle', freq: 300, freqEnd: 520, durationMs: 110, gain: 0.16 },
    { wave: 'square25', freq: 600, durationMs: 60, gain: 0.07, delayMs: 40 },
  ]),
  softLand: new SynthSource([
    { wave: 'triangle', freq: 150, freqEnd: 90, durationMs: 70, gain: 0.14 },
  ]),
  hardDrop: new SynthSource([
    { wave: 'noise', freq: 0, durationMs: 130, gain: 0.2, lowpassHz: 1800, freqEnd: 200 },
    { wave: 'triangle', freq: 220, freqEnd: 55, durationMs: 150, gain: 0.3 },
    { wave: 'square12', freq: 880, freqEnd: 180, durationMs: 90, gain: 0.09 },
  ]),

  // ---- ライン消去
  /** 1列ぶんのポップ。呼び出し側が semitones を +2ずつ上げていく */
  clearPop: new SynthSource([
    { wave: 'square25', freq: 520, freqEnd: 780, durationMs: 70, gain: 0.11, attackMs: 1 },
  ]),
  lineClear: new SynthSource([
    { wave: 'square', freq: 523, durationMs: 90, gain: 0.13 },
    { wave: 'square', freq: 659, durationMs: 90, gain: 0.13, delayMs: 60 },
    { wave: 'square', freq: 784, durationMs: 140, gain: 0.13, delayMs: 120 },
  ]),
  tetris: new SynthSource([
    { wave: 'square', freq: 523, durationMs: 90, gain: 0.16 },
    { wave: 'square', freq: 659, durationMs: 90, gain: 0.16, delayMs: 55 },
    { wave: 'square', freq: 784, durationMs: 90, gain: 0.16, delayMs: 110 },
    { wave: 'square', freq: 1046, durationMs: 220, gain: 0.18, delayMs: 165 },
    { wave: 'triangle', freq: 130, durationMs: 300, gain: 0.22 },
  ]),

  /**
   * 4列消しは左→右のポップではなく「チャージ→スイープ→圧縮」なので、
   * 音も clearPop の連打をやめて絵の3段に合わせる（デザイン仕様 05-I）。
   */
  tetrisCharge: new SynthSource([
    // 下から溜まっていく唸り。240ms かけて持ち上げる
    { wave: 'triangle', freq: 70, freqEnd: 300, durationMs: 240, gain: 0.24, attackMs: 40 },
    { wave: 'square12', freq: 140, freqEnd: 600, durationMs: 240, gain: 0.08, attackMs: 60 },
  ]),
  tetrisSweep: new SynthSource([
    // 盤面を横に走る白い帯。ノイズを開いていく
    { wave: 'noise', freq: 0, durationMs: 200, gain: 0.2, lowpassHz: 1200, freqEnd: 9000 },
    { wave: 'square25', freq: 900, freqEnd: 1800, durationMs: 200, gain: 0.09 },
  ]),
  tetrisImpact: new SynthSource([
    // 圧縮して消える瞬間の着弾
    { wave: 'triangle', freq: 320, freqEnd: 60, durationMs: 220, gain: 0.34 },
    { wave: 'noise', freq: 0, durationMs: 140, gain: 0.16, lowpassHz: 5000, freqEnd: 300 },
  ]),

  /** 回転→固定を1フレームで止める感触。短く硬い一撃＋昇る2音 */
  tspin: new SynthSource([
    { wave: 'square12', freq: 1600, freqEnd: 900, durationMs: 60, gain: 0.16, attackMs: 1 },
    { wave: 'noise', freq: 0, durationMs: 70, gain: 0.1, lowpassHz: 7000, freqEnd: 2000 },
    { wave: 'square', freq: 988, durationMs: 80, gain: 0.14, delayMs: 60 },
    { wave: 'square', freq: 1319, durationMs: 200, gain: 0.15, delayMs: 150 },
  ]),

  // ---- イベントスタック
  stackGain: new SynthSource([
    { wave: 'square25', freq: 880, freqEnd: 1320, durationMs: 70, gain: 0.12, attackMs: 1 },
  ]),
  stackLock: new SynthSource([
    { wave: 'square', freq: 440, durationMs: 60, gain: 0.12 },
    { wave: 'square', freq: 880, durationMs: 90, gain: 0.12, delayMs: 55 },
  ]),
  stackTrigger: new SynthSource([
    { wave: 'square12', freq: 260, freqEnd: 1400, durationMs: 160, gain: 0.16 },
    { wave: 'noise', freq: 0, durationMs: 200, gain: 0.14, lowpassHz: 4000, freqEnd: 600 },
  ]),
  stackMisfire: new SynthSource([
    { wave: 'square', freq: 180, freqEnd: 110, durationMs: 130, gain: 0.12 },
  ]),
  explode: new SynthSource([
    { wave: 'noise', freq: 0, durationMs: 520, gain: 0.34, lowpassHz: 6000, freqEnd: 120 },
    { wave: 'triangle', freq: 180, freqEnd: 38, durationMs: 460, gain: 0.34 },
    { wave: 'square12', freq: 90, freqEnd: 40, durationMs: 300, gain: 0.16 },
  ]),
  gravityLand: new SynthSource([
    { wave: 'triangle', freq: 120, freqEnd: 60, durationMs: 180, gain: 0.24 },
    { wave: 'noise', freq: 0, durationMs: 120, gain: 0.12, lowpassHz: 900 },
  ]),

  // ---- 状態
  feverStart: new SynthSource([
    { wave: 'square', freq: 523, durationMs: 70, gain: 0.16 },
    { wave: 'square', freq: 659, durationMs: 70, gain: 0.16, delayMs: 60 },
    { wave: 'square', freq: 784, durationMs: 70, gain: 0.16, delayMs: 120 },
    { wave: 'square', freq: 1046, durationMs: 70, gain: 0.16, delayMs: 180 },
    { wave: 'square', freq: 1318, durationMs: 260, gain: 0.18, delayMs: 240 },
    { wave: 'noise', freq: 0, durationMs: 320, gain: 0.14, lowpassHz: 8000, freqEnd: 1200 },
  ]),
  feverEnd: new SynthSource([
    { wave: 'square25', freq: 784, durationMs: 90, gain: 0.12 },
    { wave: 'square25', freq: 523, durationMs: 90, gain: 0.12, delayMs: 80 },
    { wave: 'square25', freq: 349, durationMs: 200, gain: 0.12, delayMs: 160 },
  ]),
  /** コンボ加算。呼び出し側が段階に応じて semitones を上げる */
  combo: new SynthSource([
    { wave: 'square25', freq: 660, freqEnd: 990, durationMs: 90, gain: 0.13, attackMs: 1 },
  ]),
  levelUp: new SynthSource([
    { wave: 'square', freq: 392, durationMs: 80, gain: 0.14 },
    { wave: 'square', freq: 587, durationMs: 80, gain: 0.14, delayMs: 70 },
    { wave: 'square', freq: 784, durationMs: 200, gain: 0.15, delayMs: 140 },
  ]),
  gameOver: new SynthSource([
    { wave: 'square', freq: 440, durationMs: 180, gain: 0.16 },
    { wave: 'square', freq: 349, durationMs: 180, gain: 0.16, delayMs: 170 },
    { wave: 'square', freq: 262, durationMs: 200, gain: 0.16, delayMs: 340 },
    { wave: 'triangle', freq: 131, freqEnd: 60, durationMs: 700, gain: 0.24, delayMs: 500 },
  ]),

  // ---- UI
  uiMove: new SynthSource([
    { wave: 'square25', freq: 520, durationMs: 30, gain: 0.09, attackMs: 1 },
  ]),
  uiConfirm: new SynthSource([
    { wave: 'square', freq: 660, durationMs: 50, gain: 0.12 },
    { wave: 'square', freq: 990, durationMs: 110, gain: 0.12, delayMs: 45 },
  ]),

  // ---- 対戦
  /** 届いた合図。低く不穏に鳴らして身構えさせる */
  garbageIncoming: new SynthSource([
    { wave: 'square12', freq: 220, freqEnd: 160, durationMs: 160, gain: 0.13 },
    { wave: 'square12', freq: 165, freqEnd: 120, durationMs: 200, gain: 0.11, delayMs: 90 },
  ]),
  /** 着弾。下から突き上げる重い音 */
  garbageLand: new SynthSource([
    { wave: 'triangle', freq: 90, freqEnd: 40, durationMs: 260, gain: 0.34 },
    { wave: 'noise', freq: 0, durationMs: 200, gain: 0.18, lowpassHz: 1200, freqEnd: 200 },
  ]),
  /** 攻撃を送った。抜けの良い上昇音 */
  attackSent: new SynthSource([
    { wave: 'square25', freq: 520, freqEnd: 1560, durationMs: 180, gain: 0.16, attackMs: 1 },
    { wave: 'noise', freq: 0, durationMs: 120, gain: 0.08, lowpassHz: 6000, freqEnd: 2000 },
  ]),
};
