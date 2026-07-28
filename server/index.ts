/**
 * 対戦サーバー。WebSocket で部屋と中継だけを担当する。
 *
 * サーバーはゲームロジックを持たない（権威型ではない）。
 * 各クライアントが決定論的なコアを同じシードで回し、
 * サーバーは「誰が誰へ何行送ったか」と「盤面スナップショット」を配るだけ。
 * ローカル対戦を成立させるにはこれで十分で、
 * 不正対策が必要になった段階でサーバー権威型へ寄せられるよう core は純粋なまま保ってある。
 *
 * 起動: npm run server
 */
import { createServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import { COUNTDOWN_SECONDS, HEARTBEAT_TIMEOUT_MS } from '../src/net/protocol.ts';
import type { ClientMessage, PlayerId, ServerMessage } from '../src/net/protocol.ts';
import {
  ConnectionCounter,
  MAX_ROOMS,
  createMessageBucket,
  createRoomBucket,
  resolveClientIp,
} from './limits.ts';
import type { TokenBucket } from './limits.ts';
import { parseClientMessage } from './messages.ts';
import {
  addPlayer,
  canStart,
  createRoom,
  findPlayer,
  generateRoomCode,
  getStandings,
  markOut,
  removePlayer,
  resetToLobby,
  startGame,
  toInfo,
} from './rooms.ts';
import type { Room } from './rooms.ts';
import { serveApp } from './static.ts';

const PORT = Number(process.env.PORT ?? 8787);
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';

const rooms = new Map<string, Room>();
/** 接続 → 所属情報 */
type Session = {
  id: PlayerId;
  code: string | null;
  ip: string;
  messages: TokenBucket;
  roomCreates: TokenBucket;
};
const sessions = new Map<WebSocket, Session>();
const connectionCounter = new ConnectionCounter();
const acceptedIps = new WeakMap<IncomingMessage, string>();

let nextPlayerId = 1;

// ---------------------------------------------------------------- 送信

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState !== socket.OPEN) return;
  socket.send(JSON.stringify(message));
}

function socketsInRoom(code: string): { socket: WebSocket; id: PlayerId }[] {
  const result: { socket: WebSocket; id: PlayerId }[] = [];
  for (const [socket, session] of sessions) {
    if (session.code === code) result.push({ socket, id: session.id });
  }
  return result;
}

function broadcast(code: string, message: ServerMessage, exceptId?: PlayerId): void {
  for (const { socket, id } of socketsInRoom(code)) {
    if (exceptId !== undefined && id === exceptId) continue;
    send(socket, message);
  }
}

function broadcastRoom(room: Room): void {
  broadcast(room.code, {
    kind: 'roomUpdate',
    players: room.players.map(toInfo),
    rules: room.rules,
  });
}

// ---------------------------------------------------------------- 部屋の操作

function leaveCurrentRoom(socket: WebSocket): void {
  const session = sessions.get(socket);
  if (session === undefined || session.code === null) return;

  const room = rooms.get(session.code);
  session.code = null;
  if (room === undefined) return;

  removePlayer(room, session.id);

  if (room.players.length === 0) {
    rooms.delete(room.code);
    return;
  }

  // 対戦中に抜けたら脱落扱いにして、決着判定まで進める
  if (room.phase === 'playing') {
    const alive = room.players.filter((p) => !p.out);
    if (alive.length <= 1) {
      room.phase = 'finished';
      broadcast(room.code, { kind: 'gameEnd', standings: getStandings(room) });
    }
  }

  broadcastRoom(room);
}

function beginCountdown(room: Room): void {
  room.phase = 'countdown';
  broadcastRoom(room);

  let remaining = COUNTDOWN_SECONDS;
  broadcast(room.code, { kind: 'countdown', seconds: remaining });

  const timer = setInterval(() => {
    remaining -= 1;

    // 途中で人が減ったら中止してロビーへ戻す
    if (!rooms.has(room.code) || room.players.length < 2) {
      clearInterval(timer);
      if (rooms.has(room.code)) {
        resetToLobby(room);
        broadcastRoom(room);
      }
      return;
    }

    if (remaining > 0) {
      broadcast(room.code, { kind: 'countdown', seconds: remaining });
      return;
    }

    clearInterval(timer);
    // 全員が同じ乱数列を再現できるよう、シードはサーバーが決める
    const seed = Math.floor(Math.random() * 0x7fffffff);
    startGame(room, seed);
    broadcast(room.code, { kind: 'start', seed, rules: room.rules });
    broadcastRoom(room);
  }, 1000);
}

// ---------------------------------------------------------------- 受信

function handleMessage(socket: WebSocket, message: ClientMessage): void {
  const session = sessions.get(socket);
  if (session === undefined) return;

  const room = session.code !== null ? rooms.get(session.code) : undefined;
  const me = room !== undefined ? findPlayer(room, session.id) : undefined;
  if (me !== undefined) me.lastSeen = Date.now();

  switch (message.kind) {
    case 'createRoom': {
      if (!session.roomCreates.tryConsume(Date.now())) {
        send(socket, { kind: 'error', message: '部屋作成が多すぎます。少し待ってください' });
        return;
      }
      if (rooms.size >= MAX_ROOMS) {
        send(socket, { kind: 'error', message: 'ただいま満室です。少し待ってください' });
        return;
      }
      leaveCurrentRoom(socket);
      const code = generateRoomCode((c) => rooms.has(c));
      const created = createRoom(code);
      rooms.set(code, created);

      const player = addPlayer(created, session.id, message.name, Date.now());
      if (player === null) {
        send(socket, { kind: 'error', message: '部屋を作成できませんでした' });
        return;
      }
      session.code = code;
      send(socket, {
        kind: 'joined',
        you: session.id,
        code,
        players: created.players.map(toInfo),
        rules: created.rules,
      });
      broadcastRoom(created);
      return;
    }

    case 'joinRoom': {
      const code = message.code.trim().toUpperCase();
      const target = rooms.get(code);
      if (target === undefined) {
        send(socket, { kind: 'error', message: 'その部屋は見つかりません' });
        return;
      }
      if (target.phase !== 'lobby') {
        send(socket, { kind: 'error', message: 'その部屋はすでに対戦中です' });
        return;
      }

      leaveCurrentRoom(socket);
      const player = addPlayer(target, session.id, message.name, Date.now());
      if (player === null) {
        send(socket, { kind: 'error', message: '満員です' });
        return;
      }

      session.code = code;
      send(socket, {
        kind: 'joined',
        you: session.id,
        code,
        players: target.players.map(toInfo),
        rules: target.rules,
      });
      broadcastRoom(target);
      return;
    }

    case 'leaveRoom':
      leaveCurrentRoom(socket);
      return;

    case 'returnToLobby': {
      if (room === undefined || me === undefined) return;
      // 決着済みのときだけ受け付ける。対戦中の巻き戻しは許さない
      if (room.phase !== 'finished') return;
      resetToLobby(room);
      broadcastRoom(room);
      return;
    }

    case 'setReady': {
      if (room === undefined || me === undefined) return;
      me.ready = message.ready;
      broadcastRoom(room);
      if (canStart(room)) beginCountdown(room);
      return;
    }

    case 'setRules': {
      if (room === undefined || me === undefined || !me.host) return;
      if (room.phase !== 'lobby') return;
      room.rules = message.rules;
      broadcastRoom(room);
      return;
    }

    case 'startGame': {
      if (room === undefined || me === undefined || !me.host) return;
      if (!canStart(room)) {
        send(socket, { kind: 'error', message: '全員の準備が必要です' });
        return;
      }
      beginCountdown(room);
      return;
    }

    case 'chat': {
      if (room === undefined || me === undefined) return;
      const text = message.text.trim().slice(0, 120);
      if (text.length === 0) return;
      broadcast(room.code, { kind: 'chat', from: me.id, name: me.name, text });
      return;
    }

    case 'board': {
      if (room === undefined || me === undefined) return;
      // 自分以外へ中継する
      broadcast(room.code, { kind: 'rivalBoard', from: me.id, snapshot: message.snapshot }, me.id);
      return;
    }

    case 'attack': {
      if (room === undefined || me === undefined) return;
      if (room.phase !== 'playing' || !room.rules.garbage) return;
      if (message.lines <= 0) return;

      // 生き残っている相手のうち1人へ送る。人数が多いときは順番に散らす
      const targets = room.players.filter((p) => !p.out && p.id !== me.id);
      if (targets.length === 0) return;
      const target = targets[Math.floor(Math.random() * targets.length)];
      if (target === undefined) return;

      for (const { socket: s, id } of socketsInRoom(room.code)) {
        if (id !== target.id) continue;
        send(s, {
          kind: 'garbage',
          from: me.id,
          lines: message.lines,
          holeColumn: message.holeColumn,
        });
      }
      return;
    }

    case 'topOut': {
      if (room === undefined || me === undefined) return;
      if (room.phase !== 'playing') return;

      const result = markOut(room, me.id);
      if (result.place !== null) {
        broadcast(room.code, { kind: 'playerOut', player: me.id, place: result.place });
      }
      if (result.finished) {
        broadcast(room.code, { kind: 'gameEnd', standings: getStandings(room) });
      }
      return;
    }

    case 'pong':
      return;
  }
}

// ---------------------------------------------------------------- 起動

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow, noarchive',
    });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, connections: sessions.size }));
    return;
  }
  void serveApp(req, res)
    .then((handled) => {
      if (handled) return;
      res.writeHead(405, { allow: 'GET, HEAD' });
      res.end('Method Not Allowed');
    })
    .catch((error: unknown) => {
      console.error('[dopatetris] 静的ファイル配信でエラー:', error);
      if (!res.headersSent) res.writeHead(500);
      res.end('Internal Server Error');
    });
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 64_000 });

function rejectUpgrade(req: IncomingMessage, status: number, message: string): void {
  req.socket.write(
    `HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Type: text/plain\r\n\r\n${message}`,
  );
  req.socket.destroy();
}

function isAllowedOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (origin === undefined) return !IS_PRODUCTION;

  const configured = process.env.PUBLIC_ORIGIN ?? process.env.RENDER_EXTERNAL_URL;
  if (configured !== undefined && configured.length > 0) return origin === configured;

  if (!IS_PRODUCTION) {
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  }

  const forwardedHost = req.headers['x-forwarded-host'];
  const host =
    (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost) ?? req.headers.host;
  return host !== undefined && origin === `https://${host}`;
}

httpServer.on('upgrade', (req, socket, head) => {
  if (!isAllowedOrigin(req)) {
    rejectUpgrade(req, 403, 'Forbidden');
    return;
  }

  const ip = resolveClientIp(req.headers, req.socket.remoteAddress);
  if (!connectionCounter.tryAdd(ip)) {
    rejectUpgrade(req, 429, 'Too Many Requests');
    return;
  }

  acceptedIps.set(req, ip);
  try {
    wss.handleUpgrade(req, socket, head, (webSocket) => {
      wss.emit('connection', webSocket, req);
    });
  } catch (error) {
    connectionCounter.remove(ip);
    console.error('[dopatetris] WebSocket upgradeでエラー:', error);
    socket.destroy();
  }
});

wss.on('connection', (socket: WebSocket, req: IncomingMessage) => {
  const ip = acceptedIps.get(req) ?? resolveClientIp(req.headers, req.socket.remoteAddress);
  acceptedIps.delete(req);
  const id = `p${nextPlayerId++}`;
  sessions.set(socket, {
    id,
    code: null,
    ip,
    messages: createMessageBucket(Date.now()),
    roomCreates: createRoomBucket(Date.now()),
  });

  socket.on('message', (data: unknown) => {
    const session = sessions.get(socket);
    if (session === undefined) return;
    if (!session.messages.tryConsume(Date.now())) {
      socket.close(1008, 'Rate limit exceeded');
      return;
    }

    const raw = String(data);
    if (raw.length > 64_000) return;
    const message = parseClientMessage(raw);
    if (message === null) return;
    try {
      handleMessage(socket, message);
    } catch (error) {
      console.error('[dopatetris] メッセージ処理でエラー:', error);
    }
  });

  const cleanup = (): void => {
    const session = sessions.get(socket);
    if (session === undefined) return;
    leaveCurrentRoom(socket);
    sessions.delete(socket);
    connectionCounter.remove(session.ip);
  };

  socket.on('close', cleanup);
  socket.on('error', cleanup);
});

// 死んだ接続の掃除
const heartbeatTimer = setInterval(() => {
  const now = Date.now();
  for (const [socket, session] of sessions) {
    if (session.code === null) continue;
    const room = rooms.get(session.code);
    const player = room !== undefined ? findPlayer(room, session.id) : undefined;
    if (player !== undefined && now - player.lastSeen > HEARTBEAT_TIMEOUT_MS) {
      socket.terminate();
      continue;
    }
    send(socket, { kind: 'ping' });
  }
}, 5000);

function shutdown(): void {
  clearInterval(heartbeatTimer);
  for (const socket of sessions.keys()) socket.close(1012, 'Service restart');
  wss.close();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 10_000).unref();
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[dopatetris] サーバー起動: http://0.0.0.0:${PORT}`);
});
