/**
 * 音源ファイルによる実装。
 *
 * 現時点では未使用。別の場所で作った音源が用意できたら、
 * soundManifest.ts の該当キューを SynthSource から SampleSource に差し替えるだけでよい。
 * ゲームロジック側の変更は一切不要。
 */
import { semitoneRatio } from './audioSource';
import type { AudioSource, PlayOptions } from './audioSource';

export class SampleSource implements AudioSource {
  readonly kind = 'sample';

  private buffer: AudioBuffer | null = null;
  private loading: Promise<void> | null = null;

  constructor(
    /** public/ からの相対URL */
    private readonly url: string,
    /** 音源ごとの音量補正 */
    private readonly gain = 1,
  ) {}

  async prepare(ctx: AudioContext): Promise<void> {
    if (this.buffer !== null) return;
    if (this.loading !== null) return this.loading;

    this.loading = (async () => {
      try {
        const response = await fetch(this.url);
        const bytes = await response.arrayBuffer();
        this.buffer = await ctx.decodeAudioData(bytes);
      } catch {
        // 読み込みに失敗しても無音で続行する。ゲームは止めない
        this.buffer = null;
      }
    })();

    return this.loading;
  }

  play(ctx: AudioContext, destination: AudioNode, options: PlayOptions): void {
    if (this.buffer === null) return;

    const source = ctx.createBufferSource();
    source.buffer = this.buffer;
    source.playbackRate.value = semitoneRatio(options.semitones);

    const envelope = ctx.createGain();
    envelope.gain.value = this.gain * options.velocity;

    source.connect(envelope);
    envelope.connect(destination);
    source.start(options.time);
    source.onended = () => envelope.disconnect();
  }
}
