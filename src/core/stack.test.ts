import { describe, expect, it } from 'vitest';
import { accumulateEvents, createEmptyStack, resolveTrigger } from './stack';
import { OFF_KIND_BONUS, STACK_MAX } from './config/balance';
import type { EventStack } from './types';

const LEVEL = 1;

function stackOf(kind: EventStack['kind'], count: number): EventStack {
  return { kind, count, cooldownUntil: 0 };
}

describe('イベントスタックの蓄積（種類ロック方式）', () => {
  it('最初に消したイベントでカレント種別がロックされる', () => {
    const result = accumulateEvents(createEmptyStack(), ['heart'], LEVEL);
    expect(result.stack.kind).toBe('heart');
    expect(result.stack.count).toBe(1);
    expect(result.events.some((e) => e.kind === 'stackLocked')).toBe(true);
  });

  it('同種は加算される', () => {
    const result = accumulateEvents(stackOf('bomb', 1), ['bomb', 'bomb'], LEVEL);
    expect(result.stack.count).toBe(3);
  });

  it('異種は加算されず、ボーナススコアに変換される', () => {
    const result = accumulateEvents(stackOf('bomb', 1), ['heart'], LEVEL);
    expect(result.stack.kind).toBe('bomb');
    expect(result.stack.count).toBe(1);
    expect(result.bonus).toBe(OFF_KIND_BONUS * LEVEL);
    expect(result.events.some((e) => e.kind === 'stackRejected')).toBe(true);
  });

  it('上限4を超えない。超過分はボーナスになる', () => {
    const result = accumulateEvents(stackOf('coin', 4), ['coin'], LEVEL);
    expect(result.stack.count).toBe(STACK_MAX);
    expect(result.bonus).toBeGreaterThan(0);
  });

  it('左→右の順で処理されるため、先頭の種別がロックされる', () => {
    const result = accumulateEvents(createEmptyStack(), ['clover', 'bomb', 'clover'], LEVEL);
    expect(result.stack.kind).toBe('clover');
    expect(result.stack.count).toBe(2);
  });
});

describe('発動効果の解決', () => {
  it('爆弾は段階ごとに削除行数とフィーバー時間が増える', () => {
    expect(resolveTrigger('bomb', 1)).toMatchObject({ clearRows: 1, feverMs: 3000 });
    expect(resolveTrigger('bomb', 4)).toMatchObject({ clearRows: 4, feverMs: 9000 });
  });

  it('ハート2はハート1へフォールバックする（重力なし）', () => {
    expect(resolveTrigger('heart', 2)).toMatchObject({ holdCapacity: 2, gravity: false });
  });

  it('ハート3・4は重力が発生する', () => {
    expect(resolveTrigger('heart', 3)).toMatchObject({ gravity: true });
    expect(resolveTrigger('heart', 4)).toMatchObject({ gravity: true });
  });

  it('コイン4はコイン3へフォールバックする', () => {
    expect(resolveTrigger('coin', 4)).toMatchObject({ slow: { rate: 0.2, durationMs: 5000 } });
  });

  it('クローバー1は不発', () => {
    expect(resolveTrigger('clover', 1)).toBeNull();
  });

  it('クローバー3はクローバー2へフォールバックする', () => {
    expect(resolveTrigger('clover', 3)).toMatchObject({ feverMs: 10_000, comboRate: 0.2 });
  });

  it('クローバー4はコンボ係数が最大になる', () => {
    expect(resolveTrigger('clover', 4)).toMatchObject({ comboRate: 0.25 });
  });

  it('最高段階の効果だけが適用され、下位効果は累積しない', () => {
    // ハート3 は重力を持つが、これは仕様上「最高段階のみ」。
    // ホールド拡張はハート系共通の効果として保持される。
    const heart3 = resolveTrigger('heart', 3);
    expect(heart3?.clearRows).toBe(0);
    expect(heart3?.feverMs).toBe(0);
  });
});
