/**
 * イベントスタックの蓄積と発動解決。仕様書 3-3 に対応する。
 *
 * 蓄積ルール（種類ロック方式）:
 *   1. スタックが空のときにイベントタイルを消すと、その種別がカレントとしてロックされる
 *   2. 以降は同種のみ加算される（爆弾・クローバー4、ハート・コイン3）
 *   3. 異種を消しても加算されず、ボーナススコアに変換される
 *   4. 発動または破棄でロックが解除される
 */
import {
  BOMB_EFFECTS,
  CLOVER_EFFECTS,
  COIN_EFFECTS,
  HEART_EFFECTS,
  OFF_KIND_BONUS,
  getStackMax,
  isTriggerable,
} from './config/balance';
import type { GameEvent } from './events';
import type { EventKind, EventStack } from './types';

export function createEmptyStack(): EventStack {
  return { kind: null, count: 0, cooldownUntil: 0 };
}

/**
 * 消去された順（左→右）に並んだイベントタイル列をスタックへ反映する。
 * 入力の stack は変更せず、新しい stack を返す。
 */
export function accumulateEvents(
  stack: EventStack,
  kinds: readonly EventKind[],
  level: number,
): { stack: EventStack; bonus: number; events: GameEvent[] } {
  let current: EventStack = { ...stack };
  let bonus = 0;
  const events: GameEvent[] = [];

  for (const kind of kinds) {
    if (current.kind === null) {
      // 未ロック: この種別でロックする
      current = { ...current, kind, count: 1 };
      events.push({ kind: 'stackLocked', event: kind });
      events.push({ kind: 'stackGained', event: kind, count: 1 });
      continue;
    }

    if (current.kind !== kind) {
      // 異種は加算されずボーナススコアへ
      const gained = OFF_KIND_BONUS * Math.max(1, level);
      bonus += gained;
      events.push({ kind: 'stackRejected', event: kind, bonus: gained });
      continue;
    }

    if (current.count >= getStackMax(current.kind)) {
      // 上限に達している。超過分はボーナスへ回す
      const gained = OFF_KIND_BONUS * Math.max(1, level);
      bonus += gained;
      events.push({ kind: 'stackRejected', event: kind, bonus: gained });
      continue;
    }

    const count = current.count + 1;
    current = { ...current, count };
    events.push({ kind: 'stackGained', event: kind, count });
  }

  return { stack: current, bonus, events };
}

/** 発動時に適用される効果をまとめた記述子 */
export type StackOutcome = {
  /** 最下層から削除する行数（爆弾） */
  clearRows: number;
  /** 付与するフィーバー時間（ミリ秒） */
  feverMs: number;
  /** クローバーフィーバー中、コンボ成立ごとに増える係数 */
  comboRateStep: number;
  /** 到着待ちのおじゃまから取り除く行数（ハート） */
  garbageReduction: number;
  /** 重力を1回発生させるか（ハート） */
  gravity: boolean;
  /** 落下速度低下（コイン） */
  slow: { rate: number; durationMs: number } | null;
};

const NO_OUTCOME: StackOutcome = {
  clearRows: 0,
  feverMs: 0,
  comboRateStep: 0,
  garbageReduction: 0,
  gravity: false,
  slow: null,
};

/**
 * スタックの種別と数から効果を解決する。
 * 発動不可（不発）の場合は null を返す。呼び出し側はスタックを消費してはならない。
 */
export function resolveTrigger(kind: EventKind, count: number): StackOutcome | null {
  if (!isTriggerable(kind, count)) return null;

  switch (kind) {
    case 'bomb': {
      const effect = BOMB_EFFECTS[count];
      if (effect == null) return null;
      return { ...NO_OUTCOME, clearRows: effect.clearRows, feverMs: effect.feverMs };
    }
    case 'heart': {
      const effect = HEART_EFFECTS[count];
      if (effect == null) return null;
      return {
        ...NO_OUTCOME,
        garbageReduction: effect.garbageReduction,
        gravity: effect.gravity,
      };
    }
    case 'coin': {
      const effect = COIN_EFFECTS[count];
      if (effect == null) return null;
      return { ...NO_OUTCOME, slow: { rate: effect.slowRate, durationMs: effect.durationMs } };
    }
    case 'clover': {
      const effect = CLOVER_EFFECTS[count];
      if (effect == null) return null;
      return {
        ...NO_OUTCOME,
        feverMs: effect.feverMs,
        comboRateStep: effect.comboRateStep,
      };
    }
  }
}
