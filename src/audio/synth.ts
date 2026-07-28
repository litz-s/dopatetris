/**
 * ファミコン風のプロシージャル音源。
 * 矩形波（デューティ比可変）・三角波・ノイズの3系統だけで全ての効果音を作る。
 * 音源ファイルを一切持たないため、ロード待ちもライセンス問題も発生しない。
 */
import { DEFAULT_PLAY_OPTIONS, semitoneRatio } from './audioSource';
import type { AudioSource, PlayOptions } from './audioSource';

export type Waveform = 'square' | 'square25' | 'square12' | 'triangle' | 'noise';

/** 1つの発音を定義する */
export type Voice = {
  wave: Waveform;
  /** 基準周波数（Hz）。noise では無視される */
  freq: number;
  /** 指定するとこの周波数へスイープする */
  freqEnd?: number;
  /** 発音の長さ（ミリ秒） */
  durationMs: number;
  /** 立ち上がり */
  attackMs?: number;
  /** 音量 0-1 */
  gain: number;
  /** 発音開始を遅らせる（ミリ秒）。アルペジオに使う */
  delayMs?: number;
  /** ノイズ用のローパス。ドラムの質感を作る */
  lowpassHz?: number;
  /** ピッチ変更の影響を受けない（ドラム等） */
  fixedPitch?: boolean;
};

/** デューティ比の違う矩形波を作るための周期波形。キャッシュして使い回す */
const waveCache = new WeakMap<AudioContext, Map<string, PeriodicWave>>();

function getPeriodicWave(ctx: AudioContext, duty: number): PeriodicWave {
  let cache = waveCache.get(ctx);
  if (cache === undefined) {
    cache = new Map();
    waveCache.set(ctx, cache);
  }

  const key = duty.toFixed(3);
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  // 矩形波のフーリエ係数。duty を変えると倍音構成が変わり、ファミコン特有の細い音になる
  const harmonics = 24;
  const real = new Float32Array(harmonics);
  const imag = new Float32Array(harmonics);
  for (let n = 1; n < harmonics; n++) {
    imag[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
  }

  const wave = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  cache.set(key, wave);
  return wave;
}

/** ノイズ用のバッファ。1秒ぶんを使い回す */
const noiseCache = new WeakMap<AudioContext, AudioBuffer>();

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const cached = noiseCache.get(ctx);
  if (cached !== undefined) return cached;

  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  noiseCache.set(ctx, buffer);
  return buffer;
}

/** 1ボイスを鳴らす */
export function playVoice(
  ctx: AudioContext,
  destination: AudioNode,
  voice: Voice,
  options: PlayOptions,
): void {
  const startAt = options.time + (voice.delayMs ?? 0) / 1000;
  const duration = voice.durationMs / 1000;
  const attack = Math.min((voice.attackMs ?? 2) / 1000, duration * 0.5);
  const ratio = voice.fixedPitch === true ? 1 : semitoneRatio(options.semitones);
  const peak = Math.max(0.0001, voice.gain * options.velocity);

  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0.0001, startAt);
  envelope.gain.linearRampToValueAtTime(peak, startAt + attack);
  // 指数減衰でファミコンらしい歯切れの良さを出す
  envelope.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  envelope.connect(destination);

  if (voice.wave === 'noise') {
    const source = ctx.createBufferSource();
    source.buffer = getNoiseBuffer(ctx);
    source.loop = true;

    if (voice.lowpassHz !== undefined) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(voice.lowpassHz, startAt);
      if (voice.freqEnd !== undefined) {
        filter.frequency.exponentialRampToValueAtTime(
          Math.max(40, voice.freqEnd),
          startAt + duration,
        );
      }
      source.connect(filter);
      filter.connect(envelope);
    } else {
      source.connect(envelope);
    }

    source.start(startAt);
    source.stop(startAt + duration);
    source.onended = () => envelope.disconnect();
    return;
  }

  const oscillator = ctx.createOscillator();
  if (voice.wave === 'triangle') {
    oscillator.type = 'triangle';
  } else {
    const duty = voice.wave === 'square25' ? 0.25 : voice.wave === 'square12' ? 0.125 : 0.5;
    oscillator.setPeriodicWave(getPeriodicWave(ctx, duty));
  }

  const from = Math.max(20, voice.freq * ratio);
  oscillator.frequency.setValueAtTime(from, startAt);
  if (voice.freqEnd !== undefined) {
    const to = Math.max(20, voice.freqEnd * ratio);
    oscillator.frequency.exponentialRampToValueAtTime(to, startAt + duration);
  }

  oscillator.connect(envelope);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration);
  oscillator.onended = () => envelope.disconnect();
}

/**
 * 複数ボイスを重ねた合成音源。
 * AudioSource を実装しているため、後から SampleSource へ差し替えられる。
 */
export class SynthSource implements AudioSource {
  readonly kind = 'synth';

  constructor(private readonly voices: readonly Voice[]) {}

  async prepare(): Promise<void> {
    // 合成音は事前読み込み不要
  }

  play(ctx: AudioContext, destination: AudioNode, options: PlayOptions): void {
    for (const voice of this.voices) {
      playVoice(ctx, destination, voice, { ...DEFAULT_PLAY_OPTIONS, ...options });
    }
  }
}
