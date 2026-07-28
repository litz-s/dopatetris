/**
 * 部屋の状態管理。通信そのものは扱わず、純粋な状態遷移だけを持つ。
 * こうしておくと接続なしでテストできる。
 */
import {
  DEFAULT_ROOM_RULES,
  MAX_PLAYERS,
  ROOM_CODE_LENGTH,
} from '../src/net/protocol.ts';
import type { PlayerId, PlayerInfo, RoomRules } from '../src/net/protocol.ts';

export type RoomPhase = 'lobby' | 'countdown' | 'playing' | 'finished';

export type Player = PlayerInfo & {
  /** 最後に応答があった時刻 */
  lastSeen: number;
};

export type Room = {
  code: string;
  players: Player[];
  rules: RoomRules;
  phase: RoomPhase;
  /** 対戦のシード。開始時に決めて全員へ配る */
  seed: number;
  /** 次に脱落した人へ与える順位 */
  nextPlace: number;
};

/** 紛らわしい文字（0/O、1/I）を除いた部屋コード用の文字集合 */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRoomCode(exists: (code: string) => boolean): string {
  for (let attempt = 0; attempt < 200; attempt++) {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    if (!exists(code)) return code;
  }
  // ほぼ起きないが、衝突し続けたら時刻を混ぜて必ず一意にする
  return `${Date.now().toString(36).toUpperCase().slice(-ROOM_CODE_LENGTH)}`;
}

export function createRoom(code: string): Room {
  return {
    code,
    players: [],
    rules: { ...DEFAULT_ROOM_RULES },
    phase: 'lobby',
    seed: 0,
    nextPlace: 0,
  };
}

export function addPlayer(room: Room, id: PlayerId, name: string, now: number): Player | null {
  if (room.players.length >= MAX_PLAYERS) return null;
  if (room.phase !== 'lobby') return null;

  const player: Player = {
    id,
    name: sanitizeName(name),
    ready: false,
    // 最初に入った人がホスト
    host: room.players.length === 0,
    out: false,
    place: null,
    lastSeen: now,
  };

  room.players.push(player);
  return player;
}

export function removePlayer(room: Room, id: PlayerId): void {
  const index = room.players.findIndex((p) => p.id === id);
  if (index < 0) return;

  const wasHost = room.players[index]?.host === true;
  room.players.splice(index, 1);

  // ホストが抜けたら次の人へ引き継ぐ
  const first = room.players[0];
  if (wasHost && first !== undefined) first.host = true;
}

export function findPlayer(room: Room, id: PlayerId): Player | undefined {
  return room.players.find((p) => p.id === id);
}

/** 全員が準備完了で、2人以上いるか */
export function canStart(room: Room): boolean {
  if (room.phase !== 'lobby') return false;
  if (room.players.length < 2) return false;
  return room.players.every((p) => p.ready);
}

/** 対戦を開始する。シードを決め、状態を初期化する */
export function startGame(room: Room, seed: number): void {
  room.phase = 'playing';
  room.seed = seed;
  room.nextPlace = room.players.length;
  for (const player of room.players) {
    player.out = false;
    player.place = null;
  }
}

/**
 * 脱落を記録する。
 * 後から落ちた人ほど上位になるよう、下の順位から埋めていく。
 * 最後の1人が残った時点で決着とみなす。
 */
export function markOut(room: Room, id: PlayerId): { finished: boolean; place: number | null } {
  const player = findPlayer(room, id);
  if (player === undefined || player.out) return { finished: false, place: null };

  player.out = true;
  player.place = room.nextPlace;
  room.nextPlace -= 1;

  const alive = room.players.filter((p) => !p.out);
  if (alive.length <= 1) {
    // 生き残りが優勝
    const winner = alive[0];
    if (winner !== undefined) winner.place = 1;
    room.phase = 'finished';
    return { finished: true, place: player.place };
  }

  return { finished: false, place: player.place };
}

/** ロビーへ戻す */
export function resetToLobby(room: Room): void {
  room.phase = 'lobby';
  room.seed = 0;
  room.nextPlace = 0;
  for (const player of room.players) {
    player.ready = false;
    player.out = false;
    player.place = null;
  }
}

/** 順位順に並べた一覧 */
export function getStandings(room: Room): PlayerInfo[] {
  return [...room.players].sort((a, b) => (a.place ?? 99) - (b.place ?? 99)).map(toInfo);
}

export function toInfo(player: Player): PlayerInfo {
  return {
    id: player.id,
    name: player.name,
    ready: player.ready,
    host: player.host,
    out: player.out,
    place: player.place,
  };
}

/** 表示名を安全な範囲に丸める */
export function sanitizeName(name: string): string {
  const trimmed = name.trim().slice(0, 12);
  return trimmed.length > 0 ? trimmed : 'PLAYER';
}
