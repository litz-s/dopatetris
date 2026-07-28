/**
 * 音源の抽象レイヤ。
 *
 * ゲームロジックは「どのキュー（SoundCue）を鳴らすか」だけを知り、
 * それが合成音なのか音源ファイルなのかは一切気にしない。
 * 後から別の場所で作った音源へ差し替えるときは soundManifest.ts の実装を
 * SynthSource から SampleSource に置き換えるだけで済む。
 */

/** 再生時のパラメータ */
export type PlayOptions = {
  /** AudioContext.currentTime 基準の再生開始時刻 */
  time: number;
  /** 音量倍率 0-1 */
  velocity: number;
  /**
   * 半音単位のピッチ変更。
   * ライン消去の「左→右で音程上昇」やコンボ段階のピッチ上げに使う。
   */
  semitones: number;
};

export const DEFAULT_PLAY_OPTIONS: Omit<PlayOptions, 'time'> = {
  velocity: 1,
  semitones: 0,
};

export interface AudioSource {
  /** 'synth' = コード生成 / 'sample' = 音源ファイル */
  readonly kind: 'synth' | 'sample';
  /** 事前読み込み。合成音では何もしない */
  prepare(ctx: AudioContext): Promise<void>;
  /** 発音する。destination はマスターバスなどの出力先 */
  play(ctx: AudioContext, destination: AudioNode, options: PlayOptions): void;
}

/** 半音差を周波数比に変換する */
export function semitoneRatio(semitones: number): number {
  return Math.pow(2, semitones / 12);
}
