/**
 * 公開運用のための制限。
 *
 * 通信そのものは扱わず、判定ロジックだけを持つ。
 * ここを純粋に保つことで、実際に接続を張らずにテストできる。
 */

/** 同時に存在できる部屋の上限 */
export const MAX_ROOMS = 200;

/** 同一IPからの同時接続数の上限 */
export const MAX_CONNECTIONS_PER_IP = 6;

/** 1接続あたりのメッセージ流量（1秒あたり） */
export const MESSAGE_RATE_PER_SEC = 40;

/** 瞬間的な連打を許容する幅 */
export const MESSAGE_BURST = 80;

/** 部屋作成の流量（1接続あたり1分あたり） */
export const ROOM_CREATE_PER_MINUTE = 10;

/**
 * トークンバケット方式の流量制限。
 *
 * 一定速度でトークンが補充され、メッセージ1件につき1つ消費する。
 * 空になったら拒否する。連打は burst のぶんまで吸収できる。
 */
export class TokenBucket {
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private tokens: number;
  private lastRefill: number;

  constructor(
    capacity: number,
    /** 1ミリ秒あたりの補充量 */
    refillPerMs: number,
    now = 0,
  ) {
    this.capacity = capacity;
    this.refillPerMs = refillPerMs;
    this.tokens = capacity;
    this.lastRefill = now;
  }

  /** 1件消費できるなら true。できなければ false（拒否） */
  tryConsume(now: number, amount = 1): boolean {
    this.refill(now);
    if (this.tokens < amount) return false;
    this.tokens -= amount;
    return true;
  }

  /** 残りトークン。デバッグと表示用 */
  getTokens(now: number): number {
    this.refill(now);
    return this.tokens;
  }

  private refill(now: number): void {
    const elapsed = Math.max(0, now - this.lastRefill);
    if (elapsed === 0) return;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerMs);
    this.lastRefill = now;
  }
}

/** メッセージ用のバケットを作る */
export function createMessageBucket(now: number): TokenBucket {
  return new TokenBucket(MESSAGE_BURST, MESSAGE_RATE_PER_SEC / 1000, now);
}

/** 部屋作成用のバケットを作る */
export function createRoomBucket(now: number): TokenBucket {
  return new TokenBucket(ROOM_CREATE_PER_MINUTE, ROOM_CREATE_PER_MINUTE / 60_000, now);
}

/**
 * IPごとの同時接続数を数える。
 * プロキシ経由でも実IPが取れるよう、呼び出し側で正規化してから渡す。
 */
export class ConnectionCounter {
  private readonly counts = new Map<string, number>();

  /** 受け入れられるなら true を返して加算する */
  tryAdd(ip: string): boolean {
    const current = this.counts.get(ip) ?? 0;
    if (current >= MAX_CONNECTIONS_PER_IP) return false;
    this.counts.set(ip, current + 1);
    return true;
  }

  remove(ip: string): void {
    const current = this.counts.get(ip);
    if (current === undefined) return;
    if (current <= 1) this.counts.delete(ip);
    else this.counts.set(ip, current - 1);
  }

  get(ip: string): number {
    return this.counts.get(ip) ?? 0;
  }

  get size(): number {
    return this.counts.size;
  }
}

/**
 * リバースプロキシ越しでも実際の接続元を取り出す。
 * Fly.io などは `fly-client-ip`、一般的な構成では `x-forwarded-for` に入る。
 */
export function resolveClientIp(
  headers: Record<string, string | string[] | undefined>,
  fallback: string | undefined,
): string {
  const flyIp = headers['fly-client-ip'];
  if (typeof flyIp === 'string' && flyIp.length > 0) return flyIp;

  const forwarded = headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (typeof raw === 'string' && raw.length > 0) {
    // 一番左が本来の接続元
    const first = raw.split(',')[0]?.trim();
    if (first !== undefined && first.length > 0) return first;
  }

  return fallback ?? 'unknown';
}
