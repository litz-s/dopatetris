/** Original retro-pop VFX atlas. Decode once, cache normalized tiles, then only blit. */
const ATLAS_URL = new URL('./retroPop.png', import.meta.url).href;
const TILE_SIZE = 128;

export class RetroPopAtlas {
  private tiles: HTMLCanvasElement[] = [];
  private loading = false;

  load(): void {
    if (this.loading || typeof Image === 'undefined') return;
    this.loading = true;
    const image = new Image();
    image.onload = () => {
      try {
        const source = document.createElement('canvas');
        source.width = image.naturalWidth;
        source.height = image.naturalHeight;
        const ctx = source.getContext('2d', { willReadFrequently: true });
        if (ctx === null) return;
        ctx.drawImage(image, 0, 0);
        const pixels = ctx.getImageData(0, 0, source.width, source.height).data;
        const tiles: HTMLCanvasElement[] = [];
        for (let index = 0; index < 16; index++) {
          const left = Math.floor(((index % 4) * source.width) / 4);
          const right = Math.floor((((index % 4) + 1) * source.width) / 4);
          const top = Math.floor((Math.floor(index / 4) * source.height) / 4);
          const bottom = Math.floor(((Math.floor(index / 4) + 1) * source.height) / 4);
          let minX = right,
            minY = bottom,
            maxX = left,
            maxY = top;
          for (let y = top; y < bottom; y++) {
            for (let x = left; x < right; x++) {
              if ((pixels[(y * source.width + x) * 4 + 3] ?? 0) <= 48) continue;
              minX = Math.min(minX, x);
              maxX = Math.max(maxX, x);
              minY = Math.min(minY, y);
              maxY = Math.max(maxY, y);
            }
          }
          if (maxX < minX || maxY < minY) return;
          const tile = document.createElement('canvas');
          tile.width = tile.height = TILE_SIZE;
          const target = tile.getContext('2d');
          if (target === null) return;
          const width = maxX - minX + 1,
            height = maxY - minY + 1;
          const ratio = (TILE_SIZE - 8) / Math.max(width, height);
          target.imageSmoothingEnabled = false;
          target.drawImage(
            source,
            minX,
            minY,
            width,
            height,
            (TILE_SIZE - width * ratio) / 2,
            (TILE_SIZE - height * ratio) / 2,
            width * ratio,
            height * ratio,
          );
          tiles.push(tile);
        }
        this.tiles = tiles;
      } catch {
        // A failed image/decode must never prevent play; the pool draws geometric fallbacks.
      }
    };
    image.onerror = () => {
      this.loading = false;
    };
    image.src = ATLAS_URL;
  }

  draw(ctx: CanvasRenderingContext2D, index: number, size: number): boolean {
    const tile = this.tiles[index];
    if (tile === undefined) return false;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tile, -size / 2, -size / 2, size, size);
    return true;
  }
}

// Shared by solo/versus renderers; no DOM work until load() is called on attach.
export const retroPopAtlas = new RetroPopAtlas();
