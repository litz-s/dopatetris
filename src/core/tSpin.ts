import { isFree } from './board';
import type { ActivePiece, Board } from './types';

/** Modern SRS 3-corner rule. Kick index is zero-based; only test 5 upgrades a Mini. */
export function classifyTSpin(
  board: Board,
  piece: ActivePiece,
  lastMoveWasRotation: boolean,
  lastRotationKickIndex: number | null,
): 'none' | 'mini' | 'full' {
  if (piece.type !== 'T' || !lastMoveWasRotation) return 'none';
  const x = piece.x;
  const y = piece.y;
  // Clockwise from top left. Each orientation faces the next pair of corners.
  const corners = [
    !isFree(board, x, y),
    !isFree(board, x + 2, y),
    !isFree(board, x + 2, y + 2),
    !isFree(board, x, y + 2),
  ];
  if (corners.filter(Boolean).length < 3) return 'none';
  const frontFilled = corners[piece.rot] && corners[(piece.rot + 1) % 4];
  return frontFilled || lastRotationKickIndex === 4 ? 'full' : 'mini';
}
