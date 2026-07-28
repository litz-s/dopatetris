import { describe, expect, it } from 'vitest';
import { accumulateEvents, createEmptyStack, resolveTrigger } from './stack';
import { OFF_KIND_BONUS, STACK_MAX, getStackMax } from './config/balance';
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

  it.each(['heart', 'coin'] as const)('%s は上限3を超えず、超過分はボーナスになる', (kind) => {
    const result = accumulateEvents(stackOf(kind, 3), [kind], LEVEL);
    expect(result.stack.count).toBe(3);
    expect(result.bonus).toBe(OFF_KIND_BONUS * LEVEL);
  });

  it.each(['bomb', 'clover'] as const)('%s は4個まで蓄積できる', (kind) => {
    const result = accumulateEvents(stackOf(kind, 3), [kind], LEVEL);
    expect(result.stack.count).toBe(STACK_MAX);
    expect(result.bonus).toBe(0);
  });

  it('未ロック時は4枠、ハートとコインのロック中だけ3枠になる', () => {
    expect(getStackMax(null)).toBe(4);
    expect(getStackMax('bomb')).toBe(4);
    expect(getStackMax('clover')).toBe(4);
    expect(getStackMax('heart')).toBe(3);
    expect(getStackMax('coin')).toBe(3);
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

  it('ハート1は待機中のおじゃまを1列減らす', () => {
    expect(resolveTrigger('heart', 1)).toMatchObject({
      garbageReduction: 1,
      gravity: false,
    });
  });

  it('ハート2はハート1へフォールバックして全消費する', () => {
    expect(resolveTrigger('heart', 2)).toMatchObject({
      garbageReduction: 1,
      gravity: false,
    });
  });

  it('ハート3はおじゃま1列除去と重力を両方発生させる', () => {
    expect(resolveTrigger('heart', 3)).toMatchObject({
      garbageReduction: 1,
      gravity: true,
    });
    expect(resolveTrigger('heart', 4)).toBeNull();
  });

  it.each([
    [1, 0.1],
    [2, 0.15],
    [3, 0.2],
  ] as const)('コイン%dは7秒間、落下速度を%f下げる', (count, rate) => {
    expect(resolveTrigger('coin', count)).toMatchObject({
      slow: { rate, durationMs: 7000 },
    });
  });

  it('コイン4は上限外で発動できない', () => {
    expect(resolveTrigger('coin', 4)).toBeNull();
  });

  it('クローバー1は不発', () => {
    expect(resolveTrigger('clover', 1)).toBeNull();
  });

  it('クローバー3はクローバー2へフォールバックする', () => {
    expect(resolveTrigger('clover', 3)).toMatchObject({
      feverMs: 10_000,
      comboRateStep: 0.05,
    });
  });

  it('クローバー2はコンボごとに係数+0.05、4は+0.15になる', () => {
    expect(resolveTrigger('clover', 2)).toMatchObject({ comboRateStep: 0.05 });
    expect(resolveTrigger('clover', 4)).toMatchObject({ comboRateStep: 0.15 });
  });
});
