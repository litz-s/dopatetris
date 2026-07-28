import { describe, expect, it } from 'vitest';
import { parseClientMessage } from './messages.ts';

const validSnapshot = {
  cells: '.'.repeat(200),
  score: 100,
  lines: 2,
  level: 1,
  combo: -1,
  maxCombo: 0,
  pending: 0,
  fever: false,
};

describe('公開メッセージの検証', () => {
  it('正しい部屋作成を受け入れる', () => {
    expect(parseClientMessage(JSON.stringify({ kind: 'createRoom', name: 'SUZU' }))).toEqual({
      kind: 'createRoom',
      name: 'SUZU',
    });
  });

  it('壊れたJSONと未知の種類を拒否する', () => {
    expect(parseClientMessage('{')).toBeNull();
    expect(parseClientMessage(JSON.stringify({ kind: 'unknown' }))).toBeNull();
  });

  it('盤面の長さと文字を検証する', () => {
    expect(
      parseClientMessage(JSON.stringify({ kind: 'board', snapshot: validSnapshot })),
    ).not.toBeNull();
    expect(
      parseClientMessage(
        JSON.stringify({ kind: 'board', snapshot: { ...validSnapshot, cells: '.'.repeat(199) } }),
      ),
    ).toBeNull();
    expect(
      parseClientMessage(
        JSON.stringify({
          kind: 'board',
          snapshot: { ...validSnapshot, cells: `${'.'.repeat(199)}X` },
        }),
      ),
    ).toBeNull();
  });

  it('攻撃値をゲーム上限に丸めず拒否する', () => {
    expect(
      parseClientMessage(JSON.stringify({ kind: 'attack', lines: 12, holeColumn: 9 })),
    ).toEqual({ kind: 'attack', lines: 12, holeColumn: 9 });
    expect(
      parseClientMessage(JSON.stringify({ kind: 'attack', lines: 999, holeColumn: 0 })),
    ).toBeNull();
  });

  it('ルールは全項目が真偽値の場合だけ受け入れる', () => {
    expect(
      parseClientMessage(
        JSON.stringify({
          kind: 'setRules',
          rules: { eventStack: true, clover: true, garbage: false, timePressure: true },
        }),
      ),
    ).not.toBeNull();
    expect(
      parseClientMessage(
        JSON.stringify({
          kind: 'setRules',
          rules: { eventStack: true, clover: true, garbage: 'yes', timePressure: true },
        }),
      ),
    ).toBeNull();
  });
});
