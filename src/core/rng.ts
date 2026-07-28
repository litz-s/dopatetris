/**
 * 決定論的な擬似乱数生成器（xoshiro128**）。
 * Math.random() は core 内で禁止。同じシード＋同じ入力なら必ず同じ結果になること。
 */
import type { RngState } from './types';

/** 32bit の splitmix でシードを展開し、初期状態を作る */
export function createRng(seed: number): RngState {
  let x = seed >>> 0;
  const next = (): number => {
    x = (x + 0x9e3779b9) >>> 0;
    let z = x;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
    return (z ^ (z >>> 15)) >>> 0;
  };
  // 全ビットが 0 になると縮退するため、最低1つは非ゼロを保証する
  const s0 = next() || 1;
  return { s0, s1: next(), s2: next(), s3: next() };
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/**
 * 次の乱数を返す。状態は破壊せず、新しい状態と値を返す。
 * 戻り値の value は [0, 1) の浮動小数。
 */
export function nextRandom(state: RngState): { state: RngState; value: number } {
  const result = (Math.imul(rotl(Math.imul(state.s1, 5) >>> 0, 7), 9) >>> 0) >>> 0;

  const t = (state.s1 << 9) >>> 0;
  let s2 = (state.s2 ^ state.s0) >>> 0;
  let s3 = (state.s3 ^ state.s1) >>> 0;
  const s1 = (state.s1 ^ s2) >>> 0;
  const s0 = (state.s0 ^ s3) >>> 0;
  s2 = (s2 ^ t) >>> 0;
  s3 = rotl(s3, 11);

  return { state: { s0, s1, s2, s3 }, value: result / 0x100000000 };
}

/** [0, max) の整数を返す */
export function nextInt(state: RngState, max: number): { state: RngState; value: number } {
  const r = nextRandom(state);
  return { state: r.state, value: Math.floor(r.value * max) };
}

/** 配列をシャッフルした新しい配列を返す（Fisher-Yates） */
export function shuffle<T>(state: RngState, items: readonly T[]): { state: RngState; value: T[] } {
  const result = items.slice();
  let s = state;
  for (let i = result.length - 1; i > 0; i--) {
    const r = nextInt(s, i + 1);
    s = r.state;
    const j = r.value;
    const a = result[i];
    const b = result[j];
    // noUncheckedIndexedAccess 対策。i, j は範囲内なので実際には undefined にならない。
    if (a !== undefined && b !== undefined) {
      result[i] = b;
      result[j] = a;
    }
  }
  return { state: s, value: result };
}
