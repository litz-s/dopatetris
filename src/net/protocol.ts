/**
 * 対戦の通信プロトコル。クライアントとサーバーの両方から読む唯一の定義。
 *
 * サーバーは Node の TypeScript 型剥がしで直接実行するため、
 * このファイルでは enum や namespace など変換が必要な構文を使わない。
 */

export const PROTOCOL_VERSION = 1;

/** 1部屋の最大人数 */
export const MAX_PLAYERS = 4;

/** 部屋コードの長さ */
export const ROOM_CODE_LENGTH = 4;

/** 開始前のカウントダウン秒数 */
export const COUNTDOWN_SECONDS = 3;

/** 盤面スナップショットの送信間隔（ミリ秒） */
export const BOARD_SYNC_INTERVAL_MS = 200;

/** 接続が切れたとみなすまでの無応答時間 */
export const HEARTBEAT_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------- 共通の型

export type PlayerId = string;

export type PlayerInfo = {
  id: PlayerId;
  name: string;
  ready: boolean;
  /** 部屋の主。ルール変更と開始の権限を持つ */
  host: boolean;
  /** 対戦中に力尽きたか */
  out: boolean;
  /** 脱落順から決まる順位。まだ決まっていなければ null */
  place: number | null;
};

/** 部屋のルール。ホストだけが変更できる */
export type RoomRules = {
  /** イベントスタックを有効にするか */
  eventStack: boolean;
  /** クローバーを出すか */
  clover: boolean;
  /** おじゃま送信を有効にするか */
  garbage: boolean;
  /** 時間経過で落下が速くなるか（サバイバル） */
  timePressure: boolean;
};

export const DEFAULT_ROOM_RULES: RoomRules = {
  eventStack: true,
  clover: true,
  garbage: true,
  timePressure: true,
};

/** 相手の盤面を縮小表示するためのスナップショット */
export type BoardSnapshot = {
  /**
   * 盤面を1文字1セルで表した文字列。
   * '.' が空、'I'〜'Z' がミノ、'G' がおじゃま。
   * 可視領域のみを左上から行優先で並べる。
   */
  cells: string;
  score: number;
  lines: number;
  level: number;
  combo: number;
  /** 到達した最大コンボ。リザルトの集計に使う */
  maxCombo: number;
  /** 受信待ちのおじゃま行数。相手のピンチ具合が分かる */
  pending: number;
  fever: boolean;
};

// ---------------------------------------------------------------- クライアント → サーバー

export type ClientMessage =
  | { kind: 'createRoom'; name: string }
  | { kind: 'joinRoom'; code: string; name: string }
  | { kind: 'leaveRoom' }
  /** 対戦終了後、同じ顔ぶれでロビーへ戻る */
  | { kind: 'returnToLobby' }
  | { kind: 'setReady'; ready: boolean }
  | { kind: 'setRules'; rules: RoomRules }
  | { kind: 'startGame' }
  | { kind: 'chat'; text: string }
  /** 自分の盤面を定期的に送る */
  | { kind: 'board'; snapshot: BoardSnapshot }
  /** 相手へおじゃまを送る */
  | { kind: 'attack'; lines: number; holeColumn: number }
  /** 力尽きた */
  | { kind: 'topOut' }
  | { kind: 'pong' };

// ---------------------------------------------------------------- サーバー → クライアント

export type ServerMessage =
  | { kind: 'error'; message: string }
  | {
      kind: 'joined';
      you: PlayerId;
      code: string;
      players: PlayerInfo[];
      rules: RoomRules;
    }
  | { kind: 'roomUpdate'; players: PlayerInfo[]; rules: RoomRules }
  | { kind: 'chat'; from: PlayerId; name: string; text: string }
  | { kind: 'countdown'; seconds: number }
  /** 全員が同じシードで開始する。乱数列を揃えるため必須 */
  | { kind: 'start'; seed: number; rules: RoomRules }
  | { kind: 'rivalBoard'; from: PlayerId; snapshot: BoardSnapshot }
  | { kind: 'garbage'; from: PlayerId; lines: number; holeColumn: number }
  | { kind: 'playerOut'; player: PlayerId; place: number }
  | { kind: 'gameEnd'; standings: PlayerInfo[] }
  | { kind: 'ping' };

// ---------------------------------------------------------------- 盤面の符号化

/** 空セルを表す文字 */
export const EMPTY_CELL = '.';
/** おじゃまブロックを表す文字 */
export const GARBAGE_CELL = 'G';

/**
 * 盤面スナップショットを復号し、行ごとの文字配列にする。
 * 受け取った側が縮小盤を描くために使う。
 */
export function decodeCells(cells: string, width: number): string[][] {
  const rows: string[][] = [];
  for (let i = 0; i < cells.length; i += width) {
    rows.push(cells.slice(i, i + width).split(''));
  }
  return rows;
}

/** メッセージを安全に解析する。壊れていれば null */
export function parseMessage<T>(raw: string): T | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    if (!('kind' in value)) return null;
    return value as T;
  } catch {
    return null;
  }
}
