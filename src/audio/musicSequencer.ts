/**
 * BGM シーケンサ。BPM 174 の16分グリッドでチップチューンを鳴らす。
 *
 * ルックアヘッド方式で先の音を予約するため、
 * setInterval のジッタがあってもリズムはサンプル精度で保たれる。
 * 拍の位相は演出側（背景の脈動・グリッド明滅）からも参照される。
 */
import { playVoice } from './synth';
import type { Voice } from './synth';

/** デザイン仕様の基準テンポ */
export const BPM = 174;
/** 16分音符1つぶんの秒数 */
export const STEP_SEC = 60 / BPM / 4;
/** 1拍（4分音符）の秒数 */
export const BEAT_SEC = 60 / BPM;

const STEPS = 16;
/** 何秒先まで予約しておくか */
const LOOKAHEAD_SEC = 0.2;
/** 予約処理を回す間隔 */
const TICK_MS = 40;

/** 音階（Hz）。A マイナー系でまとめる */
const NOTE = {
  A2: 110,
  C3: 130.81,
  D3: 146.83,
  E3: 164.81,
  G3: 196,
  A3: 220,
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  G4: 392,
  A4: 440,
  C5: 523.25,
  E5: 659.25,
} as const;

/** ベースライン。null は休符 */
const BASS: readonly (number | null)[] = [
  NOTE.A2, null, NOTE.A2, null,
  NOTE.G3 / 2, null, NOTE.A2, null,
  NOTE.C3, null, NOTE.C3, null,
  NOTE.E3, null, NOTE.D3, null,
];

/** アルペジオ */
const ARP: readonly (number | null)[] = [
  NOTE.A3, NOTE.C4, NOTE.E4, NOTE.C4,
  NOTE.A3, NOTE.C4, NOTE.E4, NOTE.G4,
  NOTE.A3, NOTE.C4, NOTE.E4, NOTE.C4,
  NOTE.D4, NOTE.E4, NOTE.G4, NOTE.E4,
];

/** フィーバー中に足す上物 */
const LEAD: readonly (number | null)[] = [
  NOTE.A4, null, NOTE.C5, null,
  NOTE.E5, null, NOTE.C5, NOTE.A4,
  NOTE.G4, null, NOTE.A4, null,
  NOTE.C5, NOTE.E5, null, NOTE.G4,
];

/** キック（4つ打ち） */
const KICK: readonly boolean[] = [
  true, false, false, false,
  true, false, false, false,
  true, false, false, false,
  true, false, false, false,
];

/** ハイハット */
const HAT: readonly boolean[] = [
  false, false, true, false,
  false, false, true, false,
  false, false, true, false,
  false, true, true, true,
];

export class MusicSequencer {
  private timer: number | null = null;
  private step = 0;
  /** 次に予約すべきステップの時刻 */
  private nextTime = 0;
  private running = false;
  private fever = false;

  /**
   * ループの開始時刻。位相はここを原点に計算する。
   *
   * 予約済みステップの時刻を基準にすると、ルックアヘッドのぶんだけ
   * 常に未来を指してしまい位相が 0 に張り付く。グリッドは開始時刻から
   * 一定間隔で並んでいるので、原点だけ覚えておけば正確に求められる。
   */
  private startTime = 0;

  constructor(
    private readonly ctx: AudioContext,
    private readonly destination: AudioNode,
  ) {}

  isRunning(): boolean {
    return this.running;
  }

  setFever(fever: boolean): void {
    this.fever = fever;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.startTime = this.nextTime;
    this.timer = window.setInterval(() => this.schedule(), TICK_MS);
    this.schedule();
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.running = false;
  }

  /**
   * 現在の拍内位相（0-1）。
   * 背景の脈動やグリッド明滅をビートに合わせるために使う。
   */
  getBeatPhase(): number {
    if (!this.running) return 0;
    const elapsed = this.ctx.currentTime - this.startTime;
    // 再生開始前（先頭の予約待ち）は 0 を返す
    if (elapsed <= 0) return 0;
    return (elapsed % BEAT_SEC) / BEAT_SEC;
  }

  /** ルックアヘッド範囲に入ったステップを予約する */
  private schedule(): void {
    if (!this.running) return;

    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD_SEC) {
      this.scheduleStep(this.step, this.nextTime);

      this.nextTime += STEP_SEC;
      this.step = (this.step + 1) % STEPS;
    }
  }

  private scheduleStep(step: number, time: number): void {
    const voices: Voice[] = [];

    const bass = BASS[step];
    if (bass != null) {
      voices.push({
        wave: 'square12',
        freq: bass,
        durationMs: 150,
        gain: this.fever ? 0.15 : 0.11,
        fixedPitch: true,
      });
    }

    const arp = ARP[step];
    if (arp != null) {
      voices.push({
        wave: 'square25',
        freq: arp,
        durationMs: 80,
        gain: this.fever ? 0.075 : 0.05,
        attackMs: 1,
        fixedPitch: true,
      });
    }

    if (this.fever) {
      const lead = LEAD[step];
      if (lead != null) {
        voices.push({
          wave: 'square',
          freq: lead,
          durationMs: 110,
          gain: 0.06,
          attackMs: 1,
          fixedPitch: true,
        });
      }
    }

    if (KICK[step] === true) {
      voices.push({
        wave: 'triangle',
        freq: 150,
        freqEnd: 45,
        durationMs: 140,
        gain: this.fever ? 0.3 : 0.24,
        fixedPitch: true,
      });
    }

    if (HAT[step] === true) {
      voices.push({
        wave: 'noise',
        freq: 0,
        durationMs: 40,
        gain: this.fever ? 0.05 : 0.035,
        lowpassHz: 9000,
        fixedPitch: true,
      });
    }

    for (const voice of voices) {
      playVoice(this.ctx, this.destination, voice, { time, velocity: 1, semitones: 0 });
    }
  }
}
