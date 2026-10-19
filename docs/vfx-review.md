# Candy feedback VFX review

Base commit: `8cf5cc57a4bfbcff09ac9ff23d1945500d853b05`. Review date: 2026-10-19 (JST).

## Changes

- Landing: 420 ms damped squash/stretch, anchored to the contact surface. A fast compression leads into two progressively smaller rebounds. Soft locks use a lighter response.
- Contact debris: glossy round candy droplets mixed with sharp four-point sparkles.
- T-Spin: font-independent white stars and expanding rings at the locked piece. Existing T-Spin detection and scoring are retained.
- Line clears and bombs: layered colored candy bursts and white accents. Clear-combo intensity grows within a bounded range.
- Fever: opening star burst, recurring edge sparkles and subdued beat-driven fan lights behind the blocks.
- All new effects use the existing fixed particle pool and quality tiers. LOW disables them; particle settings and reduced-motion scale them. Apply the pool limit before handling the first event, avoiding an initial over-budget burst.
- No external runtime dependencies or image assets added. Core rules, score balance, input, audio and networking are unchanged.

## References

- [Takayu Motion Reference](https://motion-reference.takayustudio.jp/): visually inspected bounce/recoil examples, rubber-band deformation, overshoot and impact squash. Adapted the motion principles to immediate game feedback rather than copying the longer demo durations.
- [EventideGamesStudio: Making my puzzle game feel juicy](https://www.reddit.com/r/indiegames/comments/u503em/making_my_puzzle_game_feel_juicy/): creator account of decaying piece wobble and star explosions informed the layered reward approach.
- [canvas-confetti documentation](https://github.com/catdad/canvas-confetti/blob/master/README.md): reviewed stars, particle budgets and reduced-motion support. Reused the existing renderer instead of adding another canvas/library.
- X and community searches were performed; no unverified X code or third-party prompt instructions were executed. All new drawing and deformation code was authored locally.

## Validation

- `npm run build`: passed (TypeScript and Vite production build).
- `npm test`: 189 tests across 12 files passed, including 6 new renderer/deformation cases.
- `git diff --check`: passed.
- Browser: production build, 1440×900 and 1280×800 PC viewports. Actual solo play hard-drop score and board changes observed; pause and resume checked. No console errors or warnings captured.
- Separate local renderer fixture exercised lock, T-Spin, Tetris, bomb and fever. Comparisons froze at 180 ms; synthetic fixture states are for VFX inspection, not a full reducer-driven gameplay sequence.
- LOW and reduced-motion paths checked with renderer tests and browser controls. Device/OS reduced-motion emulation was not available through the browser surface; the same QualityManager API used by the existing OS listener was exercised.
- Mobile/tablet interaction excluded by the repository PC-only requirement. No new touch/mobile behavior.

## Performance — limitation remains

Production renderer fixture, 300 measured requestAnimationFrame intervals per tier and version after 21 warm-up frames. Repeated fever + T-Spin double (combo 12) + four-row bomb every 70 frames. Same fixture dimensions and seed; visual particle directions remain random. One local-browser run, not an isolated hardware benchmark.

| Version | Tier | Frame mean | Frame p95 | Frame max | >16.67 ms | Draw mean | Draw p95 | Draw max | Peak particles |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| before | ULTRA | 33.38 | 33.5 | 49.8 | 100% | 1.77 | 4.2 | 8.4 | 285 |
| after | ULTRA | 34.38 | 49.9 | 66.8 | 100% | 3.12 | 6.3 | 11.1 | 210 |
| before | HIGH | 33.38 | 33.5 | 50.4 | 100% | 1.76 | 3.5 | 5.6 | 205 |
| after | HIGH | 33.94 | 34.8 | 51.6 | 100% | 3.15 | 5.8 | 7.6 | 130 |
| before | MID | 33.33 | 33.5 | 34.8 | 100% | 1.31 | 2.4 | 2.9 | 127 |
| after | MID | 33.55 | 33.5 | 50.1 | 100% | 1.97 | 4.2 | 6 | 60 |
| before | LOW | 33.33 | 33.5 | 33.6 | 100% | 0.88 | 1.7 | 2.2 | 0 |
| after | LOW | 33.33 | 33.5 | 33.6 | 100% | 0.97 | 2 | 3.2 | 0 |

Times are milliseconds. Draw measures synchronous update + event handling + Canvas drawing calls; it excludes deferred raster/compositor work. The browser ran near 30 Hz even for the original LOW renderer. The new ULTRA scene also has a worse frame p95 (49.9 vs 33.5 ms), so this is **not a 60 fps pass**. The likely incremental cost is Canvas paths/compositing for glossy circles, stars and fan lights; no timing improvement is claimed. Actual full-game HUD also reported roughly 14–17 fps in this browser session. Verify a foreground hardware-accelerated desktop browser before release; the existing automatic quality reduction remains enabled.

## Evidence and reproduction

Local outputs: `spin-comparison.jpg`, `tetris-comparison.jpg`, `fever-comparison.jpg`, `game-desktop.jpg`, `game-laptop.jpg`, `vfx-performance.json`.
The local comparison harness is included with the deliverable source snapshot. Restore the base commit under `baseline.local/`, use the existing Node 24/npm environment, build with `npm exec vite -- build --config vite.review.local.ts --outDir dist-review.local`, and serve with `npm exec vite -- preview --outDir dist-review.local --host 127.0.0.1 --port 4173`. Open `/review.local.html`; MEASURE ALL TIERS runs the comparison. Harness files are not shipped in the normal application build.
