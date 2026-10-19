import { retroPopAtlas } from '../assets/retroPopAtlas';
/**
 * 固定長パーティクルプール。
 * ホットパスでオブジェクトを生成しないため、GC由来のフレーム落ちが起きない。
 * 上限を超える確保要求は無視される（最古のものを潰さず、演出を静かに間引く）。
 */

export type Particle = {
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 残り寿命（ミリ秒） */
  life: number;
  maxLife: number;
  size: number;
  color: string;
  /** 重力加速度（px/ms^2） */
  gravity: number;
  /** 空気抵抗。毎ミリ秒この係数を掛ける */
  drag: number;
  rotation: number;
  spin: number;
  /**
   * 'square' は四角、'spark' は伸びる線、
   * 'coin' は rotateY する円盤、'glyph' は記号（♥ / ✦ など）。
   */
  shape: 'square' | 'spark' | 'coin' | 'glyph' | 'star' | 'burst' | 'splash' | 'reward';
  /** shape が 'glyph' のときに描く文字 */
  glyph: string;
  /** Atlas variation; reset on reuse. */
  variant: number;
  /** 横方向の揺れ幅。ハートの蛇行に使う */
  waver: number;
  /** 揺れの位相 */
  waverPhase: number;
};

const MAX_CAPACITY = 3000;

export class ParticlePool {
  private readonly items: Particle[] = [];
  private aliveCount = 0;
  /** 現在の品質段階が許す同時数 */
  private limit = MAX_CAPACITY;

  constructor(capacity: number = MAX_CAPACITY) {
    for (let i = 0; i < capacity; i++) {
      this.items.push({
        alive: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        size: 1,
        color: '#ffffff',
        gravity: 0,
        drag: 1,
        rotation: 0,
        spin: 0,
        shape: 'square',
        glyph: '',
        variant: 0,
        waver: 0,
        waverPhase: 0,
      });
    }
  }

  setLimit(limit: number): void {
    this.limit = Math.max(0, Math.min(limit, this.items.length));
  }

  getAliveCount(): number {
    return this.aliveCount;
  }

  getCapacity(): number {
    return this.items.length;
  }

  /** 空きスロットを1つ確保する。上限に達していれば null */
  acquire(): Particle | null {
    if (this.aliveCount >= this.limit) return null;
    for (let i = 0; i < this.items.length; i++) {
      const particle = this.items[i];
      if (particle !== undefined && !particle.alive) {
        particle.alive = true;
        this.aliveCount += 1;
        // 前回の使い回しで残る値をここで戻しておく。
        // 呼び出し側が毎回すべて指定するとは限らないため。
        particle.shape = 'square';
        particle.glyph = '';
        particle.variant = 0;
        particle.waver = 0;
        particle.waverPhase = 0;
        particle.rotation = 0;
        particle.spin = 0;
        particle.gravity = 0;
        particle.drag = 1;
        return particle;
      }
    }
    return null;
  }

  /** 全パーティクルを進める */
  update(deltaMs: number): void {
    for (let i = 0; i < this.items.length; i++) {
      const p = this.items[i];
      if (p === undefined || !p.alive) continue;

      p.life -= deltaMs;
      if (p.life <= 0) {
        p.alive = false;
        this.aliveCount -= 1;
        continue;
      }

      p.vy += p.gravity * deltaMs;
      if (p.drag !== 1) {
        const damping = Math.pow(p.drag, deltaMs);
        p.vx *= damping;
        p.vy *= damping;
      }
      p.x += p.vx * deltaMs;
      p.y += p.vy * deltaMs;
      p.rotation += p.spin * deltaMs;

      // 横に軽く蛇行させる（ハートのふわり感）
      if (p.waver !== 0) {
        p.waverPhase += deltaMs * 0.006;
        p.x += Math.cos(p.waverPhase) * p.waver * deltaMs * 0.01;
      }
    }
  }

  /** 生存中のパーティクルを描画する */
  draw(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < this.items.length; i++) {
      const p = this.items[i];
      if (p === undefined || !p.alive) continue;

      const t = p.life / p.maxLife;
      if (t > 1) continue;
      ctx.globalAlpha = t < 0.3 ? t / 0.3 : 1;
      ctx.fillStyle = p.color;

      if (
        p.shape === 'star' ||
        p.shape === 'burst' ||
        p.shape === 'splash' ||
        p.shape === 'reward' ||
        p.shape === 'coin'
      ) {
        const age = 1 - t;
        const index =
          p.shape === 'star'
            ? p.variant % 4
            : p.shape === 'burst'
              ? 4 + Math.min(3, Math.floor(age * 4))
              : p.shape === 'splash'
                ? 8 + (p.variant % 4)
                : p.shape === 'coin'
                  ? 12
                  : p.variant;
        const envelope =
          p.shape === 'burst'
            ? 0.55 + (1 - Math.pow(1 - age, 3)) * 0.7
            : Math.min(1, age / 0.09) * Math.min(1, t / 0.35);
        const size = p.size * envelope;
        ctx.save();
        ctx.translate(p.x, p.y);
        if (p.shape === 'coin') ctx.scale(Math.max(0.1, Math.abs(Math.cos(p.rotation))), 1);
        else ctx.rotate(p.rotation);
        const drawn = retroPopAtlas.draw(ctx, index, size);
        if (!drawn) {
          // Deliberately simple pixel fallback while assets load or if loading fails.
          ctx.fillRect(-size * 0.12, -size / 2, size * 0.24, size);
          ctx.fillRect(-size / 2, -size * 0.12, size, size * 0.24);
        }
        ctx.restore();
      } else if (p.shape === 'glyph') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.font = `${Math.round(p.size)}px 'DotGothic16', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.glyph, 0, 0);
        ctx.restore();
      } else if (p.shape === 'spark') {
        const length = p.size * (1 + Math.min(4, Math.hypot(p.vx, p.vy) * 8));
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.atan2(p.vy, p.vx));
        ctx.fillRect(-length / 2, -p.size / 2, length, p.size);
        ctx.restore();
      } else if (p.rotation !== 0) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      } else {
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  clear(): void {
    for (const p of this.items) p.alive = false;
    this.aliveCount = 0;
  }
}
