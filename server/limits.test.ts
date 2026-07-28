import { describe, expect, it } from 'vitest';
import {
  ConnectionCounter,
  MAX_CONNECTIONS_PER_IP,
  TokenBucket,
  createMessageBucket,
  resolveClientIp,
} from './limits.ts';

describe('トークンバケット', () => {
  it('容量を使い切ると拒否し、時間経過で補充する', () => {
    const bucket = new TokenBucket(2, 1 / 1000, 0);
    expect(bucket.tryConsume(0)).toBe(true);
    expect(bucket.tryConsume(0)).toBe(true);
    expect(bucket.tryConsume(0)).toBe(false);
    expect(bucket.tryConsume(1000)).toBe(true);
  });

  it('通常の盤面同期レートには十分な余裕がある', () => {
    const bucket = createMessageBucket(0);
    for (let i = 0; i < 20; i++) expect(bucket.tryConsume(i * 200)).toBe(true);
  });
});

describe('IPごとの接続数', () => {
  it('上限を超える接続を拒否し、切断後は再度受け入れる', () => {
    const counter = new ConnectionCounter();
    for (let i = 0; i < MAX_CONNECTIONS_PER_IP; i++) {
      expect(counter.tryAdd('203.0.113.1')).toBe(true);
    }
    expect(counter.tryAdd('203.0.113.1')).toBe(false);
    counter.remove('203.0.113.1');
    expect(counter.tryAdd('203.0.113.1')).toBe(true);
  });
});

describe('接続元IP', () => {
  it('Render等のforwardedヘッダーから左端を使う', () => {
    expect(resolveClientIp({ 'x-forwarded-for': '203.0.113.10, 10.0.0.1' }, '127.0.0.1')).toBe(
      '203.0.113.10',
    );
  });

  it('Flyの専用ヘッダーを優先する', () => {
    expect(
      resolveClientIp(
        { 'fly-client-ip': '198.51.100.2', 'x-forwarded-for': '203.0.113.10' },
        '127.0.0.1',
      ),
    ).toBe('198.51.100.2');
  });
});
