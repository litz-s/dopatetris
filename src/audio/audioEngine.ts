/**
 * オーディオの窓口。ゲームロジックはこのクラスだけを触る。
 *
 * - AudioContext はブラウザの自動再生制限があるため、最初のユーザー操作で解放する
 * - SE と BGM は別バスに分け、音量を個別に調整できる
 * - 同一キューの連打で音が潰れないよう、最小発音間隔を設ける
 */
import { DEFAULT_PLAY_OPTIONS } from './audioSource';
import { MusicSequencer } from './musicSequencer';
import { SOUND_MANIFEST } from './soundManifest';
import type { SoundCue } from './soundManifest';

export type AudioVolumes = {
  master: number;
  sfx: number;
  music: number;
  muted: boolean;
};

export const DEFAULT_VOLUMES: AudioVolumes = {
  master: 0.7,
  sfx: 1,
  music: 0.6,
  muted: false,
};

/** 同じキューを鳴らせる最小間隔（ミリ秒）。移動音の連打対策 */
const MIN_INTERVAL_MS: Partial<Record<SoundCue, number>> = {
  move: 28,
  rotate: 40,
  softLand: 60,
  stackGain: 40,
  clearPop: 12,
};

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sequencer: MusicSequencer | null = null;

  private volumes: AudioVolumes = { ...DEFAULT_VOLUMES };
  private readonly lastPlayed = new Map<SoundCue, number>();
  private unlocked = false;

  /**
   * BGM 再生を要求されたかどうか。
   * ゲーム開始が unlock() の完了より先に来ることがあるため、
   * 要求を覚えておいて解放後に自動で鳴らし始める。
   */
  private musicRequested = false;
  private feverRequested = false;

  isUnlocked(): boolean {
    return this.unlocked;
  }

  /**
   * ユーザー操作から呼ぶ。ブラウザの自動再生制限を解除する。
   *
   * 操作の種類によっては resume() が拒否されるため、
   * 失敗したら後片付けして false を返す。呼び出し側は次の操作で再試行してよい。
   */
  async unlock(): Promise<boolean> {
    if (this.unlocked) return true;

    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
    } catch {
      return false;
    }

    const master = ctx.createGain();
    const sfx = ctx.createGain();
    const music = ctx.createGain();

    // 音圧を稼ぎつつ歪ませないための軽いリミッタ
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.12;

    sfx.connect(master);
    music.connect(master);
    master.connect(limiter);
    limiter.connect(ctx.destination);

    this.ctx = ctx;
    this.masterGain = master;
    this.sfxGain = sfx;
    this.musicGain = music;
    this.sequencer = new MusicSequencer(ctx, music);

    this.applyVolumes();

    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        // ユーザー操作として認められなかった。片付けて次の操作を待つ
        void ctx.close();
        this.ctx = null;
        this.masterGain = null;
        this.sfxGain = null;
        this.musicGain = null;
        this.sequencer = null;
        return false;
      }
    }

    this.unlocked = true;

    // 解放前に出ていた要求をここで反映する
    this.sequencer.setFever(this.feverRequested);
    if (this.musicRequested) this.sequencer.start();

    return true;
  }

  setVolumes(volumes: Partial<AudioVolumes>): void {
    this.volumes = { ...this.volumes, ...volumes };
    this.applyVolumes();
  }

  getVolumes(): AudioVolumes {
    return this.volumes;
  }

  private applyVolumes(): void {
    const scale = this.volumes.muted ? 0 : 1;
    if (this.masterGain !== null) this.masterGain.gain.value = this.volumes.master * scale;
    if (this.sfxGain !== null) this.sfxGain.gain.value = this.volumes.sfx;
    if (this.musicGain !== null) this.musicGain.gain.value = this.volumes.music;
  }

  /**
   * 効果音を鳴らす。未解放なら何もしない。
   * delayMs を渡すと AudioContext の時計で先の時刻に予約するため、
   * ライン消去の「左→右で音程上昇」のような連続発音がサンプル精度で揃う。
   */
  play(
    cue: SoundCue,
    options: { velocity?: number; semitones?: number; delayMs?: number } = {},
  ): void {
    const ctx = this.ctx;
    const bus = this.sfxGain;
    if (ctx === null || bus === null || !this.unlocked) return;

    const delayMs = options.delayMs ?? 0;

    // 予約発音は意図した連打なので、間引きの対象外にする
    if (delayMs === 0) {
      const minInterval = MIN_INTERVAL_MS[cue];
      if (minInterval !== undefined) {
        const now = performance.now();
        const last = this.lastPlayed.get(cue) ?? -Infinity;
        if (now - last < minInterval) return;
        this.lastPlayed.set(cue, now);
      }
    }

    const source = SOUND_MANIFEST[cue];
    source.play(ctx, bus, {
      ...DEFAULT_PLAY_OPTIONS,
      velocity: options.velocity ?? DEFAULT_PLAY_OPTIONS.velocity,
      semitones: options.semitones ?? DEFAULT_PLAY_OPTIONS.semitones,
      time: ctx.currentTime + delayMs / 1000,
    });
  }

  startMusic(): void {
    this.musicRequested = true;
    this.sequencer?.start();
  }

  stopMusic(): void {
    this.musicRequested = false;
    this.sequencer?.stop();
  }

  setFever(fever: boolean): void {
    this.feverRequested = fever;
    this.sequencer?.setFever(fever);
  }

  /** 拍内位相 0-1。演出の拍同期に使う */
  getBeatPhase(): number {
    return this.sequencer?.getBeatPhase() ?? 0;
  }

  dispose(): void {
    this.stopMusic();
    void this.ctx?.close();
    this.ctx = null;
    this.unlocked = false;
  }
}

/** アプリ全体で1つだけ持つ */
export const audioEngine = new AudioEngine();
