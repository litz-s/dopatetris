/**
 * 公開WebSocketで受け取るメッセージの実行時検証。
 *
 * TypeScriptの型はネットワーク境界では消えるため、JSONをそのまま
 * ClientMessage とみなさず、種類ごとに値と上限を確認する。
 */
import type { BoardSnapshot, ClientMessage, RoomRules } from '../src/net/protocol.ts';

const BOARD_CELL_COUNT = 200;
const BOARD_CELLS = /^[.GIJLOSTZ]+$/;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isIntegerBetween(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && Number(value) >= min && Number(value) <= max;
}

function isRoomRules(value: unknown): value is RoomRules {
  if (!isRecord(value)) return false;
  return (
    isBoolean(value.eventStack) &&
    isBoolean(value.clover) &&
    isBoolean(value.garbage) &&
    isBoolean(value.timePressure)
  );
}

function isBoardSnapshot(value: unknown): value is BoardSnapshot {
  if (!isRecord(value)) return false;
  return (
    typeof value.cells === 'string' &&
    value.cells.length === BOARD_CELL_COUNT &&
    BOARD_CELLS.test(value.cells) &&
    isIntegerBetween(value.score, 0, Number.MAX_SAFE_INTEGER) &&
    isIntegerBetween(value.lines, 0, 1_000_000) &&
    isIntegerBetween(value.level, 0, 10_000) &&
    isIntegerBetween(value.combo, -1, 1_000_000) &&
    isIntegerBetween(value.maxCombo, 0, 1_000_000) &&
    isIntegerBetween(value.pending, 0, 1_000) &&
    isBoolean(value.fever)
  );
}

/** 壊れた値や上限外の値なら null を返す。 */
export function parseClientMessage(raw: string): ClientMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value) || typeof value.kind !== 'string') return null;

  switch (value.kind) {
    case 'createRoom':
      return typeof value.name === 'string' ? { kind: value.kind, name: value.name } : null;
    case 'joinRoom':
      return typeof value.code === 'string' && typeof value.name === 'string'
        ? { kind: value.kind, code: value.code, name: value.name }
        : null;
    case 'leaveRoom':
    case 'returnToLobby':
    case 'startGame':
    case 'topOut':
    case 'pong':
      return { kind: value.kind };
    case 'setReady':
      return isBoolean(value.ready) ? { kind: value.kind, ready: value.ready } : null;
    case 'setRules':
      return isRoomRules(value.rules) ? { kind: value.kind, rules: value.rules } : null;
    case 'chat':
      return typeof value.text === 'string' ? { kind: value.kind, text: value.text } : null;
    case 'board':
      return isBoardSnapshot(value.snapshot)
        ? { kind: value.kind, snapshot: value.snapshot }
        : null;
    case 'attack':
      return isIntegerBetween(value.lines, 1, 12) && isIntegerBetween(value.holeColumn, 0, 9)
        ? { kind: value.kind, lines: value.lines, holeColumn: value.holeColumn }
        : null;
    default:
      return null;
  }
}
