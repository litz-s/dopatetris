/**
 * 盤面スナップショットの符号化。
 * 相手に縮小盤を見せるためだけの表現なので、軽さを優先して1セル1文字にする。
 *
 * core には手を入れず、ここで読み取るだけにとどめる。
 */
import { BOARD_BUFFER_HEIGHT, BOARD_HEIGHT, BOARD_WIDTH } from '@core/config/balance';
import { getPendingGarbage, isFever } from '@core/game';
import type { GameState } from '@core/types';
import { EMPTY_CELL, GARBAGE_CELL } from './protocol';
import type { BoardSnapshot } from './protocol';

/**
 * 可視領域を左上から行優先で文字列にする。
 * 10×20 なので200文字。200msごとに送っても負荷は無視できる。
 */
export function encodeBoard(state: GameState): BoardSnapshot {
  let cells = '';

  for (let y = BOARD_BUFFER_HEIGHT; y < BOARD_HEIGHT; y++) {
    const row = state.board[y];
    for (let x = 0; x < BOARD_WIDTH; x++) {
      const cell = row?.[x];
      if (cell == null) {
        cells += EMPTY_CELL;
      } else if (cell.garbage === true) {
        cells += GARBAGE_CELL;
      } else {
        cells += cell.color;
      }
    }
  }

  return {
    cells,
    score: state.score,
    lines: state.lines,
    level: state.level,
    combo: state.combo,
    maxCombo: state.stats.maxCombo,
    pending: getPendingGarbage(state),
    fever: isFever(state),
  };
}

/** 相手の積み上がり具合（0-1）。ピンチ度の表示に使う */
export function getStackHeightRatio(cells: string): number {
  const total = cells.length;
  for (let i = 0; i < total; i++) {
    if (cells[i] !== EMPTY_CELL) {
      const row = Math.floor(i / BOARD_WIDTH);
      const visibleRows = total / BOARD_WIDTH;
      return 1 - row / visibleRows;
    }
  }
  return 0;
}
