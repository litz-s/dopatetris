/**
 * L: フィーバー現金砲。
 * 出典は docs/design/design-spec.html 05-L。
 *
 * 盤面キャンバスとは別のレイヤーに描く。デザイン指定が
 * 「盤面の手前・HUDの奥」「着地は画面外下」で、盤面（280×560）に収まらないため。
 * ミノとゴーストの視認を妨げないよう、盤面に重なる区間だけ不透明度を落とす。
 */
import {
  CASH_CANNON,
  CASH_COLORS,
  CASH_KINDS,
  EASING,
  cubicBezier,
  getCashVolleyCount,
} from './motion';
import type { CashKind } from './motion';

type Bullet = {
  alive: boolean;
  kind: CashKind;
  /** 発射位置 */
  originX: number;
  originY: number;
  /** 水平の到達距離 */
  spanX: number;
  /** 頂点の高さ（負値で上方向） */
  peakY: number;
  elapsedMs: number;
  /** 発射までの待ち時間。斉射を120ms差にする */
  delayMs: number;
  size: number;
  spin: number;
  /** 札のひらひら用 */
  flutter: number;
};

type Muzzle = { x: number; y: number; life: number };

/** 盤面が画面内で占める矩形。ここに重なる弾は薄くする */
export type BoardRect = { x: number; y: number; width: number; height: number };

export class CashCannon {
  private readonly bullets: Bullet[] = [];
  private readonly muzzles: Muzzle[] = [];

  private width = 0;
  private height = 0;
  private dpr = 1;

  /** 直近の発射からの経過。4拍ごとに左右を切り替える */
  private sinceVolleyMs = CASH_CANNON.intervalMs;
  /** 次に撃つのはどちらか */
  private nextSide: 'left' | 'right' = 'left';
  private active = false;

  constructor(capacity = CASH_CANNON.maxAlive) {
    for (let i = 0; i < capacity; i++) {
      this.bullets.push({
        alive: false,
        kind: 'coinLarge',
        originX: 0,
        originY: 0,
        spanX: 0,
        peakY: 0,
        elapsedMs: 0,
        delayMs: 0,
        size: 14,
        spin: 0,
        flutter: 0,
      });
    }
  }

  resize(canvas: HTMLCanvasElement, cssWidth: number, cssHeight: number, scale: number): void {
    this.width = cssWidth;
    this.height = cssHeight;
    this.dpr = Math.min(3, (window.devicePixelRatio || 1) * Math.max(1, scale));
    canvas.width = Math.round(cssWidth * this.dpr);
    canvas.height = Math.round(cssHeight * this.dpr);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
  }

  /** フィーバーの開始・終了。終了しても飛んでいる弾は落ちきるまで残す */
  setActive(active: boolean): void {
    if (active && !this.active) {
      // 突入直後に1斉射目が来るようにする
      this.sinceVolleyMs = CASH_CANNON.intervalMs;
      this.nextSide = 'left';
    }
    this.active = active;
  }

  getAliveCount(): number {
    let count = 0;
    for (const bullet of this.bullets) if (bullet.alive) count += 1;
    return count;
  }

  update(deltaMs: number, combo: number, cloverFever: boolean, particleScale: number): void {
    // 設定でパーティクルを切っていれば完全に止める
    const enabled = particleScale > 0;

    if (this.active && enabled) {
      this.sinceVolleyMs += deltaMs;
      if (this.sinceVolleyMs >= CASH_CANNON.intervalMs) {
        this.sinceVolleyMs -= CASH_CANNON.intervalMs;
        this.fireVolley(this.nextSide, combo, cloverFever, particleScale);
        this.nextSide = this.nextSide === 'left' ? 'right' : 'left';
      }
    }

    for (const bullet of this.bullets) {
      if (!bullet.alive) continue;
      bullet.elapsedMs += deltaMs;
      if (bullet.elapsedMs - bullet.delayMs > CASH_CANNON.flightMs) bullet.alive = false;
    }

    for (let i = this.muzzles.length - 1; i >= 0; i--) {
      const muzzle = this.muzzles[i];
      if (muzzle === undefined) continue;
      muzzle.life -= deltaMs;
      if (muzzle.life <= 0) this.muzzles.splice(i, 1);
    }
  }

  /** 1斉射。6〜8個を120ms差で撃ち出す */
  private fireVolley(
    side: 'left' | 'right',
    combo: number,
    cloverFever: boolean,
    particleScale: number,
  ): void {
    const count = Math.max(1, Math.round(getCashVolleyCount(combo) * particleScale));

    // 砲口は画面の左右下端
    const originX = side === 'left' ? this.width * 0.06 : this.width * 0.94;
    const originY = this.height * 0.98;
    const direction = side === 'left' ? 1 : -1;

    this.muzzles.push({ x: originX, y: originY, life: CASH_CANNON.muzzleMs });

    for (let i = 0; i < count; i++) {
      const bullet = this.bullets.find((b) => !b.alive);
      // 上限に達したら生成しない（超過分は捨てる方針）
      if (bullet === undefined) return;

      bullet.alive = true;
      bullet.kind = pickKind(cloverFever);
      bullet.originX = originX;
      bullet.originY = originY;
      // 飛距離を個体ごとにばらす
      bullet.spanX = direction * this.width * (0.35 + Math.random() * 0.55);
      bullet.peakY =
        -this.height * (CASH_CANNON.peakMin + Math.random() * (CASH_CANNON.peakMax - CASH_CANNON.peakMin));
      bullet.elapsedMs = 0;
      bullet.delayMs = i * CASH_CANNON.shotStaggerMs;
      bullet.size = bullet.kind === 'coinLarge' ? 18 : bullet.kind === 'bundle' ? 22 : 14;
      bullet.spin = ((Math.random() < 0.5 ? -1 : 1) * CASH_CANNON.coinSpinDeg * Math.PI) / 180;
      bullet.flutter = Math.random() * Math.PI * 2;
    }
  }

  draw(ctx: CanvasRenderingContext2D, board: BoardRect | null): void {
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    for (const muzzle of this.muzzles) {
      const t = 1 - muzzle.life / CASH_CANNON.muzzleMs;
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.fillStyle = '#ffe600';
      ctx.beginPath();
      ctx.arc(muzzle.x, muzzle.y, 10 + t * 26, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const bullet of this.bullets) {
      if (!bullet.alive) continue;
      const local = bullet.elapsedMs - bullet.delayMs;
      if (local < 0) continue;

      const t = local / CASH_CANNON.flightMs;
      const eased = cubicBezier(EASING.cashFlight, Math.min(1, t));

      const x = bullet.originX + bullet.spanX * eased;
      const y = bullet.originY + parabola(eased, bullet.peakY);

      // 画面外へ出た弾はそこで終わり
      if (y > this.height + 80) continue;

      // 盤面に重なる区間だけ薄くして、ミノの視認を妨げない
      let alpha = t < 0.06 ? t / 0.06 : 1;
      if (board !== null && overlaps(x, y, bullet.size, board)) {
        alpha *= CASH_CANNON.overBoardAlpha;
      }

      ctx.globalAlpha = alpha;
      ctx.fillStyle = CASH_COLORS[bullet.kind];

      ctx.save();
      ctx.translate(x, y);

      if (bullet.kind === 'bundle' || bullet.kind === 'bill') {
        // 札はひらひらさせたいので横幅を揺らす
        const flutter = Math.abs(Math.cos(bullet.flutter + local * 0.008));
        ctx.scale(Math.max(0.15, flutter), 1);
        ctx.rotate(Math.sin(bullet.flutter + local * 0.004) * 0.5);
        ctx.fillRect(-bullet.size * 0.7, -bullet.size * 0.42, bullet.size * 1.4, bullet.size * 0.84);
        if (bullet.kind === 'bundle') {
          ctx.fillStyle = '#0f0a18';
          ctx.fillRect(-bullet.size * 0.7, -bullet.size * 0.12, bullet.size * 1.4, bullet.size * 0.24);
        }
      } else {
        // 硬貨は回転させる
        ctx.rotate(bullet.spin * eased);
        const flip = Math.abs(Math.cos(bullet.spin * eased * 2));
        ctx.beginPath();
        ctx.ellipse(0, 0, Math.max(1, (bullet.size / 2) * flip), bullet.size / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  clear(): void {
    for (const bullet of this.bullets) bullet.alive = false;
    this.muzzles.length = 0;
  }
}

/**
 * 放物線。頂点は飛翔の46%地点（デザインのキーフレームに合わせる）。
 * 終端は砲口より少し下（画面外へ抜ける）。
 */
function parabola(u: number, peak: number): number {
  const end = 60;
  const a = (end - peak / 0.46) / (1 - 1 / 0.46);
  const b = end - a;
  return a * u * u + b * u;
}

/** クローバーフィーバー中は札束の比率を上げる */
function pickKind(cloverFever: boolean): CashKind {
  if (cloverFever && Math.random() < 0.45) return 'bundle';
  const index = Math.floor(Math.random() * CASH_KINDS.length);
  return CASH_KINDS[index] ?? 'coinLarge';
}

function overlaps(x: number, y: number, size: number, board: BoardRect): boolean {
  return (
    x + size > board.x &&
    x - size < board.x + board.width &&
    y + size > board.y &&
    y - size < board.y + board.height
  );
}
