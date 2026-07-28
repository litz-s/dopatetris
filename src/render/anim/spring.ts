/**
 * バネ物理によるアニメーション。線形補間では「弾ける」感じが出ないため、
 * UIの寄り引き・スコアの跳ね・盤面の揺れは全てここを通す。
 */

export type Spring = {
  value: number;
  velocity: number;
  target: number;
  /** 硬さ。大きいほど速く到達する */
  stiffness: number;
  /** 減衰。小さいほど長く揺れる */
  damping: number;
};

export function createSpring(value: number, stiffness = 0.02, damping = 0.16): Spring {
  return { value, velocity: 0, target: value, stiffness, damping };
}

/** バネを1ステップ進める。deltaMs は固定タイムステップ前提 */
export function stepSpring(spring: Spring, deltaMs: number): void {
  const steps = Math.max(1, Math.min(4, Math.round(deltaMs / 16.67)));
  for (let i = 0; i < steps; i++) {
    const force = (spring.target - spring.value) * spring.stiffness * 16.67;
    spring.velocity = (spring.velocity + force) * (1 - spring.damping);
    spring.value += spring.velocity;
  }
}

/** 即座に弾ませる（衝撃を与える） */
export function kick(spring: Spring, impulse: number): void {
  spring.velocity += impulse;
}

// ---------------------------------------------------------------- イージング

/** 行き過ぎて戻る。着地やポップアップに使う */
export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export function easeOutQuint(t: number): number {
  return 1 - Math.pow(1 - t, 5);
}

export function easeOutExpo(t: number): number {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
