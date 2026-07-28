/**
 * 画面揺れ。個別に ctx.translate せず、必ずここに集約する。
 * 強さは QualityProfile.shakeScale で段階的に弱められる。
 */

export class ScreenShake {
  private amplitude = 0;
  private decay = 0.004;
  private time = 0;

  offsetX = 0;
  offsetY = 0;

  /** 衝撃を加える。amount はピクセル単位のおおよその振れ幅 */
  punch(amount: number, scale = 1): void {
    const applied = amount * scale;
    if (applied > this.amplitude) this.amplitude = applied;
  }

  update(deltaMs: number): void {
    if (this.amplitude <= 0.01) {
      this.amplitude = 0;
      this.offsetX = 0;
      this.offsetY = 0;
      return;
    }

    this.time += deltaMs;
    // 高周波の減衰振動。方向をずらして単調にならないようにする
    this.offsetX = Math.sin(this.time * 0.09) * this.amplitude;
    this.offsetY = Math.cos(this.time * 0.13) * this.amplitude * 0.7;
    this.amplitude *= Math.pow(1 - this.decay, deltaMs);
  }

  reset(): void {
    this.amplitude = 0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.time = 0;
  }
}
