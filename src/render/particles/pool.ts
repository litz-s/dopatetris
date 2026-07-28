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
  /** 'square' は四角、'spark' は伸びる線 */
  shape: 'square' | 'spark';
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
    }
  }

  /** 生存中のパーティクルを描画する */
  draw(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < this.items.length; i++) {
      const p = this.items[i];
      if (p === undefined || !p.alive) continue;

      const t = p.life / p.maxLife;
      ctx.globalAlpha = t < 0.3 ? t / 0.3 : 1;
      ctx.fillStyle = p.color;

      if (p.shape === 'spark') {
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
