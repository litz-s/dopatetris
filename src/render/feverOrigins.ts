/** Visit all 12 interior zones before repeating; jitter never puts an origin on an edge. */
export function feverOrigin(
  index: number,
  jitterX: number,
  jitterY: number,
): { x: number; y: number } {
  const zone = (index * 5) % 12;
  return {
    x: ((zone % 3) + 0.2 + 0.6 * jitterX) / 3,
    y: (Math.floor(zone / 3) + 0.2 + 0.6 * jitterY) / 4,
  };
}
