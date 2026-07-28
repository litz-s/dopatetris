/**
 * 相手の縮小盤。受け取ったスナップショット文字列をそのまま描く。
 * 1セル1文字なので復号は不要で、色引きだけで済む。
 */
import { useEffect, useRef } from 'react';
import { BOARD_VISIBLE_HEIGHT, BOARD_WIDTH } from '@core/config/balance';
import { EMPTY_CELL, GARBAGE_CELL } from '@net/protocol';
import type { BoardSnapshot, PlayerInfo } from '@net/protocol';
import { GARBAGE_COLOR, MINO_COLORS, NEON, SCREEN, withAlpha } from '@render/theme';
import type { MinoType } from '@core/types';

type Props = {
  player: PlayerInfo;
  snapshot: BoardSnapshot | undefined;
  /** 縮小盤1セルの大きさ */
  cell?: number;
};

export function RivalBoard({ player, snapshot, cell = 7 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const width = BOARD_WIDTH * cell;
  const height = BOARD_VISIBLE_HEIGHT * cell;

  useEffect(() => {
    const canvas = ref.current;
    if (canvas === null) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    const ctx = canvas.getContext('2d');
    if (ctx === null) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = SCREEN.board;
    ctx.fillRect(0, 0, width, height);

    const cells = snapshot?.cells ?? '';
    for (let i = 0; i < cells.length; i++) {
      const char = cells[i];
      if (char === undefined || char === EMPTY_CELL) continue;

      const x = (i % BOARD_WIDTH) * cell;
      const y = Math.floor(i / BOARD_WIDTH) * cell;

      ctx.fillStyle =
        char === GARBAGE_CELL ? GARBAGE_COLOR : (MINO_COLORS[char as MinoType] ?? GARBAGE_COLOR);
      ctx.fillRect(x, y, cell - 1, cell - 1);
    }

    // 力尽きた相手は暗く落とす
    if (player.out) {
      ctx.fillStyle = 'rgba(8, 4, 15, 0.72)';
      ctx.fillRect(0, 0, width, height);
    }

    // フィーバー中は縁が光る
    if (snapshot?.fever === true && !player.out) {
      ctx.strokeStyle = withAlpha(NEON.magenta, 0.9);
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, width - 2, height - 2);
    }
  }, [snapshot, player.out, cell, width, height]);

  const pending = snapshot?.pending ?? 0;

  return (
    <div className={`rival ${player.out ? 'is-out' : ''}`}>
      <div className="rival-head">
        <span className="mono-8 rival-name">{player.name}</span>
        {player.out ? (
          <span className="rival-ko">K.O.</span>
        ) : (
          <span className="mono-8 rival-score">
            {(snapshot?.score ?? 0).toLocaleString('en-US')}
          </span>
        )}
      </div>

      <div className="rival-board">
        <canvas ref={ref} style={{ width, height }} />
        {/* 受信待ちのおじゃまを右端のゲージで見せる */}
        {pending > 0 && (
          <div className="rival-pending" style={{ height: `${Math.min(100, pending * 8)}%` }} />
        )}
      </div>

      <div className="rival-foot">
        {(snapshot?.combo ?? 0) > 0 && (
          <span className="mono-8 rival-combo">{snapshot?.combo} COMBO</span>
        )}
      </div>
    </div>
  );
}
