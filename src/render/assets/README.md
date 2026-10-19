# Retro Pop VFX atlas

Original image-generated art for dopatetris, created on 2026-10-19 using the existing game screenshot as style context. User selected the retro-pop direction (thick outlines, pixel stars, comic explosion) and explicitly approved the interactive asset/motion prototype before integration.

- File: `retroPop.png`, 1254 × 1254 RGBA, 1,079,081 bytes.
- Layout: four columns × four rows. Preserve transparency; do not introduce a painted backdrop.
- Palette: existing mino/neon colors, white highlights and dark plum outline. Cabinet surfaces do not glow.
- Row 0: four white stepped sparkles (indices 0–3).
- Row 1: impact, full burst, hollow burst, fragments (indices 4–7).
- Row 2: magenta, cyan, yellow and green contact splashes (indices 8–11).
- Row 3: medal, clover, heart and fever rosette (indices 12–15).

`RetroPopAtlas` reads alpha bounds once after loading and caches 16 normalized 128 × 128 canvases (about 1 MiB of pixel storage). Runtime particles draw these cached tiles. It performs no per-frame image decoding or pixel reads. The geometric fallback keeps feedback visible if the atlas cannot load. Game logic does not wait for the image.

The explosion row contains authored graphic keyframes, not guaranteed motion-continuous simulation frames. Runtime timing is deliberately short: impact → burst → hollow silhouette → fragments. The image source is kept unmodified for future art edits.

Generation brief: original retro Japanese arcade pop; dark stepped outlines; clipped pixel corners; white/cyan/magenta stars; yellow-magenta comic bursts; squared gummy splashes; reward motifs; no lettering, logos, photoreal smoke or full-screen background.
