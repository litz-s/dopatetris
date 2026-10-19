import { describe, expect, it, vi } from 'vitest';
import { ParticlePool } from './pool';

describe('sprite particles', () => {
  it('keeps visual feedback visible if the image has not loaded', () => {
    const pool = new ParticlePool(2);
    const p = pool.acquire()!;
    Object.assign(p, { shape: 'star', variant: 2, life: 70, maxLife: 100, size: 24, x: 10, y: 20 });
    const fillRect = vi.fn();
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      fillRect,
    };
    expect(() => pool.draw(context as unknown as CanvasRenderingContext2D)).not.toThrow();
    expect(fillRect).toHaveBeenCalled();
    pool.update(100);
    expect(pool.getAliveCount()).toBe(0);
  });
  it('holds staggered sprites until their own entrance time', () => {
    const pool = new ParticlePool(1);
    const p = pool.acquire()!;
    Object.assign(p, { shape: 'reward', variant: 14, life: 150, maxLife: 100, size: 20 });
    const fillRect = vi.fn();
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      fillRect,
    };
    pool.draw(context as unknown as CanvasRenderingContext2D);
    expect(fillRect).not.toHaveBeenCalled();
    pool.update(60);
    pool.draw(context as unknown as CanvasRenderingContext2D);
    expect(fillRect).toHaveBeenCalled();
  });
  it('does not leak an atlas index into an unrelated reused particle', () => {
    const pool = new ParticlePool(1);
    const first = pool.acquire()!;
    Object.assign(first, { shape: 'reward', variant: 15, life: 20, maxLife: 20 });
    pool.update(21);
    const second = pool.acquire()!;
    expect(second.shape).toBe('square');
    expect(second.variant).toBe(0);
  });
});
