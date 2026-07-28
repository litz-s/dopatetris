/**
 * core が返す副作用イベント。
 * core 自身は音を鳴らしたりパーティクルを出したりしない。render / audio 層がこれを購読する。
 */
import type { ClearType, EventKind, MinoType, Rotation } from './types';

export type GameEvent =
  | { readonly kind: 'pieceSpawned'; readonly type: MinoType; readonly hasEvent: boolean }
  | { readonly kind: 'pieceMoved' }
  | { readonly kind: 'pieceRotated'; readonly kicked: boolean }
  /** 固定された。着地スカッシュを描くため形状も渡す */
  | {
      readonly kind: 'pieceLocked';
      readonly x: number;
      readonly y: number;
      readonly type: MinoType;
      readonly rot: Rotation;
      /** ハードドロップによる着地か。スカッシュの強さを変える */
      readonly hard: boolean;
    }
  /** ハードドロップ。落下軌跡の残像を描くため始点と終点を渡す */
  | {
      readonly kind: 'hardDropped';
      readonly distance: number;
      readonly column: number;
      readonly type: MinoType;
      readonly rot: Rotation;
      readonly x: number;
      readonly fromY: number;
      readonly toY: number;
    }
  | { readonly kind: 'softDropped' }
  | { readonly kind: 'holdUsed'; readonly type: MinoType }
  | {
      readonly kind: 'linesCleared';
      readonly rows: readonly number[];
      readonly clearType: ClearType;
      readonly combo: number;
      readonly b2b: boolean;
      readonly score: number;
    }
  /** カレント種別がロックされた */
  | { readonly kind: 'stackLocked'; readonly event: EventKind }
  /** 同種のイベントタイルを消してスタックが増えた */
  | { readonly kind: 'stackGained'; readonly event: EventKind; readonly count: number }
  /** 異種のイベントタイルを消してボーナスに変換された */
  | { readonly kind: 'stackRejected'; readonly event: EventKind; readonly bonus: number }
  /** スタックを発動した */
  | { readonly kind: 'stackTriggered'; readonly event: EventKind; readonly count: number }
  /** 発動しようとしたが不発（クローバー1 / クールタイム中 / 空） */
  | { readonly kind: 'stackMisfire'; readonly reason: 'empty' | 'cooldown' | 'noEffect' }
  | { readonly kind: 'stackDiscarded'; readonly event: EventKind; readonly count: number }
  | { readonly kind: 'bombCleared'; readonly rows: readonly number[] }
  | { readonly kind: 'gravityApplied' }
  | { readonly kind: 'feverStarted'; readonly durationMs: number; readonly comboRate: number }
  | { readonly kind: 'feverEnded' }
  | { readonly kind: 'slowStarted'; readonly rate: number; readonly durationMs: number }
  | { readonly kind: 'slowEnded' }
  | { readonly kind: 'levelUp'; readonly level: number }
  | { readonly kind: 'comboBroken'; readonly finalCombo: number }
  | { readonly kind: 'perfectClear' }
  /** 相手へ送るおじゃまが確定した（相殺後の残り） */
  | { readonly kind: 'garbageSent'; readonly lines: number }
  /** 相手からおじゃまが届き、待機列に入った */
  | { readonly kind: 'garbageQueued'; readonly lines: number }
  /** 自分の攻撃で受信おじゃまを打ち消した */
  | { readonly kind: 'garbageOffset'; readonly lines: number }
  /** 待機していたおじゃまが盤面に挿入された */
  | {
      readonly kind: 'garbageApplied';
      readonly lines: number;
      readonly holeColumn: number;
    }
  | { readonly kind: 'gameOver'; readonly score: number };

/** イベント収集用のシンプルなシンク。reducer 内で使う */
export class EventSink {
  private readonly events: GameEvent[] = [];

  emit(event: GameEvent): void {
    this.events.push(event);
  }

  drain(): GameEvent[] {
    return this.events;
  }
}
