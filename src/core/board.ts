/**
 * 盤面操作。すべて純関数で、入力の盤面を破壊しない。
 */
import { BOARD_HEIGHT, BOARD_WIDTH } from './config/balance';
import { getShape } from './pieces';
import type {
  ActivePiece,
  Board,
  Cell,
  EventKind,
  GravityMove,
  MinoType,
  Rotation,
} from './types';

export function createEmptyBoard(): Board {
  return Array.from({ length: BOARD_HEIGHT }, () => Array<Cell>(BOARD_WIDTH).fill(null));
}

/** 範囲外なら undefined を返す安全なアクセサ */
export function cellAt(board: Board, x: number, y: number): Cell | undefined {
  const row = board[y];
  if (row === undefined) return undefined;
  return row[x];
}

/** 盤面内かつ空きマスなら true */
export function isFree(board: Board, x: number, y: number): boolean {
  if (x < 0 || x >= BOARD_WIDTH || y < 0 || y >= BOARD_HEIGHT) return false;
  return cellAt(board, x, y) === null;
}

/** ミノが指定位置・回転で配置可能か */
export function canPlace(board: Board, type: MinoType, rot: Rotation, x: number, y: number): boolean {
  for (const [dx, dy] of getShape(type, rot)) {
    if (!isFree(board, x + dx, y + dy)) return false;
  }
  return true;
}

/** 落下中のミノを盤面へ固定した新しい盤面を返す */
export function lockPiece(board: Board, piece: ActivePiece): Board {
  const next = board.map((row) => row.slice());
  const shape = getShape(piece.type, piece.rot);

  shape.forEach(([dx, dy], index) => {
    const x = piece.x + dx;
    const y = piece.y + dy;
    const row = next[y];
    if (row === undefined || x < 0 || x >= BOARD_WIDTH) return;
    row[x] = {
      color: piece.type,
      event: index === piece.eventCellIndex ? piece.eventKind : null,
    };
  });

  return next;
}

/** ハードドロップ先の y 座標を求める */
export function getDropY(board: Board, piece: ActivePiece): number {
  let y = piece.y;
  while (canPlace(board, piece.type, piece.rot, piece.x, y + 1)) {
    y += 1;
  }
  return y;
}

/** 揃っている行の添字を上から順に返す */
export function findFullRows(board: Board): number[] {
  const rows: number[] = [];
  for (let y = 0; y < BOARD_HEIGHT; y++) {
    const row = board[y];
    if (row === undefined) continue;
    if (row.every((cell) => cell !== null)) rows.push(y);
  }
  return rows;
}

/**
 * 消去対象の行に含まれるイベントタイルを、左→右・上→下の順に列挙する。
 * 「最初に消されたイベントスタック」の判定に使う。仕様上、消去は常に左から右へ進行する。
 */
export function collectEventsInRows(board: Board, rows: readonly number[]): EventKind[] {
  const found: EventKind[] = [];
  const sorted = [...rows].sort((a, b) => a - b);
  for (let x = 0; x < BOARD_WIDTH; x++) {
    for (const y of sorted) {
      const cell = cellAt(board, x, y);
      if (cell != null && cell.event != null) found.push(cell.event);
    }
  }
  return found;
}

/** 指定行を削除し、上の行を落とした新しい盤面を返す */
export function removeRows(board: Board, rows: readonly number[]): Board {
  const removal = new Set(rows);
  const kept = board.filter((_, y) => !removal.has(y));
  const added = Array.from({ length: board.length - kept.length }, () =>
    Array<Cell>(BOARD_WIDTH).fill(null),
  );
  return [...added, ...kept];
}

/** 最下段から count 行を削除する（爆弾効果）。実際に削除した行の添字を返す */
export function removeBottomRows(board: Board, count: number): { board: Board; rows: number[] } {
  const rows: number[] = [];
  for (let i = 0; i < count; i++) {
    const y = BOARD_HEIGHT - 1 - i;
    if (y >= 0) rows.push(y);
  }
  return { board: removeRows(board, rows), rows };
}

/**
 * 重力を適用する（ハート3・4の効果）。
 * 列ごとに浮いているブロックを下詰めする（naive gravity）。
 * 何も動かなかった場合は元の盤面をそのまま返す。
 */
export function applyGravity(board: Board): { board: Board; moved: boolean } {
  const next = createEmptyBoard();
  let moved = false;

  for (let x = 0; x < BOARD_WIDTH; x++) {
    let writeY = BOARD_HEIGHT - 1;
    for (let y = BOARD_HEIGHT - 1; y >= 0; y--) {
      const cell = cellAt(board, x, y);
      if (cell == null) continue;
      const targetRow = next[writeY];
      if (targetRow !== undefined) targetRow[x] = cell;
      if (writeY !== y) moved = true;
      writeY -= 1;
    }
  }

  return moved ? { board: next, moved } : { board, moved: false };
}

/**
 * おじゃま行を盤面の下から挿入する。
 * 挿入したぶん上の行は押し出され、盤外へ出たものは消える。
 * holeColumn は決定論的に決めた穴の位置で、対戦相手と必ず一致させる必要がある。
 */
export function insertGarbage(board: Board, lines: number, holeColumn: number): Board {
  if (lines <= 0) return board;

  const hole = Math.max(0, Math.min(BOARD_WIDTH - 1, holeColumn));
  const kept = board.slice(lines);

  const garbageRows: Board = Array.from({ length: Math.min(lines, BOARD_HEIGHT) }, () =>
    Array.from({ length: BOARD_WIDTH }, (_, x): Cell =>
      x === hole ? null : { color: 'I', event: null, garbage: true },
    ),
  );

  return [...kept, ...garbageRows].slice(-BOARD_HEIGHT);
}

/**
 * おじゃま行を挿入しても落下中のミノが盤面からはみ出さないか。
 * はみ出す場合は押し上げが必要になる。
 */
export function countGarbageOverflow(board: Board, lines: number): number {
  let occupiedTop = BOARD_HEIGHT;
  for (let y = 0; y < BOARD_HEIGHT; y++) {
    const row = board[y];
    if (row === undefined) continue;
    if (row.some((cell) => cell !== null)) {
      occupiedTop = y;
      break;
    }
  }
  return Math.max(0, lines - occupiedTop);
}

/**
 * 重力を適用したときに動くブロックの一覧を求める。
 * 実際には盤面を変えず、描画側が落下アニメーションを組み立てるために使う。
 */
export function computeGravityMoves(board: Board): GravityMove[] {
  const moves: GravityMove[] = [];

  for (let x = 0; x < BOARD_WIDTH; x++) {
    let writeY = BOARD_HEIGHT - 1;
    for (let y = BOARD_HEIGHT - 1; y >= 0; y--) {
      if (cellAt(board, x, y) == null) continue;
      if (writeY !== y) moves.push({ x, fromY: y, toY: writeY });
      writeY -= 1;
    }
  }

  return moves;
}

/** 盤面が空かどうか（パーフェクトクリア判定用） */
export function isBoardEmpty(board: Board): boolean {
  return board.every((row) => row.every((cell) => cell === null));
}
