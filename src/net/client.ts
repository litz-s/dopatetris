/**
 * 対戦サーバーとの接続。
 *
 * React から直接 WebSocket を触らず、この層が
 * 「接続状態」と「受信メッセージの購読」だけを提供する。
 * 再接続やメッセージの解析もここで吸収する。
 */
import { parseMessage } from './protocol';
import type { ClientMessage, ServerMessage } from './protocol';

export type ConnectionState = 'idle' | 'connecting' | 'waking' | 'open' | 'closed' | 'error';

type Listener = (message: ServerMessage) => void;
type StateListener = (state: ConnectionState) => void;

const RETRY_WINDOW_MS = 90_000;
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000] as const;

/** 本番は同一オリジン、Vite開発時だけ8787番へ繋ぐ。 */
function defaultUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  if (import.meta.env.DEV) {
    const port = import.meta.env.VITE_MULTIPLAYER_PORT ?? '8787';
    return `${protocol}://${window.location.hostname}:${port}`;
  }
  return `${protocol}://${window.location.host}`;
}

export class NetClient {
  private socket: WebSocket | null = null;
  private state: ConnectionState = 'idle';
  private readonly listeners = new Set<Listener>();
  private readonly stateListeners = new Set<StateListener>();
  /** 接続完了前に送ろうとしたメッセージ */
  private readonly outbox: ClientMessage[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private retryStartedAt: number | null = null;
  private retryAttempt = 0;
  private connectUrl = defaultUrl();
  private manuallyClosed = false;

  getState(): ConnectionState {
    return this.state;
  }

  onMessage(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onStateChange(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  connect(url: string = defaultUrl()): void {
    if (this.socket !== null || this.reconnectTimer !== null) return;
    this.connectUrl = url;
    this.manuallyClosed = false;
    this.retryStartedAt = Date.now();
    this.retryAttempt = 0;
    this.setState('connecting');
    this.openSocket();
  }

  private openSocket(): void {
    let socket: WebSocket;
    try {
      socket = new WebSocket(this.connectUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.socket = socket;

    socket.onopen = () => {
      if (this.socket !== socket) {
        socket.close();
        return;
      }
      this.retryStartedAt = null;
      this.retryAttempt = 0;
      this.setState('open');
      // 接続前に溜めた分をまとめて送る
      while (this.outbox.length > 0) {
        const queued = this.outbox.shift();
        if (queued !== undefined) this.send(queued);
      }
    };

    socket.onmessage = (event: MessageEvent) => {
      const message = parseMessage<ServerMessage>(String(event.data));
      if (message === null) return;

      // 生存確認には即座に返す
      if (message.kind === 'ping') {
        this.send({ kind: 'pong' });
        return;
      }

      for (const listener of this.listeners) listener(message);
    };

    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      if (this.manuallyClosed) {
        this.setState('closed');
        return;
      }
      this.scheduleReconnect();
    };

    socket.onerror = () => {
      if (this.manuallyClosed) return;
      this.setState('waking');
      // close通知へ集約し、再試行を二重に予約しない。
      socket.close();
    };
  }

  disconnect(): void {
    this.manuallyClosed = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.retryStartedAt = null;
    this.retryAttempt = 0;
    const socket = this.socket;
    this.socket = null;
    this.outbox.length = 0;
    if (socket !== null) {
      socket.onclose = null;
      socket.close();
    }
    this.setState('idle');
  }

  send(message: ClientMessage): void {
    const socket = this.socket;
    if (socket === null || socket.readyState !== WebSocket.OPEN) {
      // 接続待ちのあいだは溜めておく。溢れさせない
      if (this.outbox.length < 32) this.outbox.push(message);
      return;
    }
    socket.send(JSON.stringify(message));
  }

  private scheduleReconnect(): void {
    if (this.manuallyClosed || this.reconnectTimer !== null) return;

    const startedAt = this.retryStartedAt ?? Date.now();
    this.retryStartedAt = startedAt;
    if (Date.now() - startedAt >= RETRY_WINDOW_MS) {
      this.outbox.length = 0;
      this.setState('error');
      return;
    }

    const delayIndex = Math.min(this.retryAttempt, RETRY_DELAYS_MS.length - 1);
    const delay = RETRY_DELAYS_MS[delayIndex] ?? 8_000;
    this.retryAttempt += 1;
    this.setState('waking');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delay);
  }

  private setState(state: ConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    for (const listener of this.stateListeners) listener(state);
  }
}

/** アプリ全体で1つだけ持つ */
export const netClient = new NetClient();
