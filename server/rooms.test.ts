/**
 * 部屋の状態遷移の検証。通信を挟まないので、そのままユニットテストできる。
 */
import { describe, expect, it } from 'vitest';
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
  sanitizeName,
  startGame,
} from './rooms.ts';
import { MAX_PLAYERS, ROOM_CODE_LENGTH } from '../src/net/protocol.ts';
import type { Room } from './rooms.ts';

const NOW = 1_000;

/** 指定人数が入った部屋を作る */
function roomWith(count: number): Room {
  const room = createRoom('TEST');
  for (let i = 0; i < count; i++) {
    addPlayer(room, `p${i + 1}`, `PLAYER${i + 1}`, NOW);
  }
  return room;
}

function readyAll(room: Room): void {
  for (const player of room.players) player.ready = true;
}

describe('部屋コード', () => {
  it('規定の長さで生成される', () => {
    expect(generateRoomCode(() => false)).toHaveLength(ROOM_CODE_LENGTH);
  });

  it('紛らわしい文字を含まない', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateRoomCode(() => false)).not.toMatch(/[O0I1]/);
    }
  });

  it('既存コードとの衝突を避ける', () => {
    const used = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const code = generateRoomCode((c) => used.has(c));
      expect(used.has(code)).toBe(false);
      used.add(code);
    }
  });
});

describe('入室と退室', () => {
  it('最初に入った人がホストになる', () => {
    const room = roomWith(2);
    expect(room.players[0]?.host).toBe(true);
    expect(room.players[1]?.host).toBe(false);
  });

  it('定員を超えると入れない', () => {
    const room = roomWith(MAX_PLAYERS);
    expect(addPlayer(room, 'over', 'OVER', NOW)).toBeNull();
    expect(room.players).toHaveLength(MAX_PLAYERS);
  });

  it('対戦中の部屋には入れない', () => {
    const room = roomWith(2);
    startGame(room, 1);
    expect(addPlayer(room, 'late', 'LATE', NOW)).toBeNull();
  });

  it('ホストが抜けると次の人へ引き継がれる', () => {
    const room = roomWith(3);
    removePlayer(room, 'p1');

    expect(room.players).toHaveLength(2);
    expect(room.players[0]?.id).toBe('p2');
    expect(room.players[0]?.host).toBe(true);
  });

  it('ホスト以外が抜けてもホストは変わらない', () => {
    const room = roomWith(3);
    removePlayer(room, 'p2');
    expect(findPlayer(room, 'p1')?.host).toBe(true);
  });

  it('いない人を抜けさせても壊れない', () => {
    const room = roomWith(2);
    removePlayer(room, 'unknown');
    expect(room.players).toHaveLength(2);
  });

  it('表示名は空白と長さを丸める', () => {
    expect(sanitizeName('  ')).toBe('PLAYER');
    expect(sanitizeName('  スズ  ')).toBe('スズ');
    expect(sanitizeName('X'.repeat(30))).toHaveLength(12);
  });
});

describe('開始条件', () => {
  it('1人では始められない', () => {
    const room = roomWith(1);
    readyAll(room);
    expect(canStart(room)).toBe(false);
  });

  it('全員が準備完了なら始められる', () => {
    const room = roomWith(2);
    readyAll(room);
    expect(canStart(room)).toBe(true);
  });

  it('1人でも準備できていなければ始められない', () => {
    const room = roomWith(3);
    readyAll(room);
    const second = room.players[1];
    if (second !== undefined) second.ready = false;
    expect(canStart(room)).toBe(false);
  });

  it('開始すると全員のシードが共有される', () => {
    const room = roomWith(2);
    startGame(room, 12345);
    expect(room.seed).toBe(12345);
    expect(room.phase).toBe('playing');
  });
});

describe('脱落と順位', () => {
  it('先に落ちた人ほど下位になる', () => {
    const room = roomWith(4);
    startGame(room, 1);

    expect(markOut(room, 'p1').place).toBe(4);
    expect(markOut(room, 'p2').place).toBe(3);
  });

  it('残り1人になった時点で決着し、その人が1位', () => {
    const room = roomWith(3);
    startGame(room, 1);

    markOut(room, 'p1');
    const result = markOut(room, 'p2');

    expect(result.finished).toBe(true);
    expect(room.phase).toBe('finished');
    expect(findPlayer(room, 'p3')?.place).toBe(1);
  });

  it('同じ人を二重に脱落させても順位が狂わない', () => {
    const room = roomWith(3);
    startGame(room, 1);

    markOut(room, 'p1');
    const again = markOut(room, 'p1');

    expect(again.place).toBeNull();
    expect(findPlayer(room, 'p1')?.place).toBe(3);
  });

  it('順位順に並べ替えられる', () => {
    const room = roomWith(3);
    startGame(room, 1);
    markOut(room, 'p2');
    markOut(room, 'p1');

    const standings = getStandings(room);
    expect(standings[0]?.id).toBe('p3');
    expect(standings[2]?.id).toBe('p2');
  });
});

describe('ロビーへ戻す', () => {
  it('準備状態と順位が初期化される', () => {
    const room = roomWith(2);
    readyAll(room);
    startGame(room, 1);
    markOut(room, 'p1');

    resetToLobby(room);

    expect(room.phase).toBe('lobby');
    expect(room.seed).toBe(0);
    for (const player of room.players) {
      expect(player.ready).toBe(false);
      expect(player.out).toBe(false);
      expect(player.place).toBeNull();
    }
  });
});
