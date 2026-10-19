# Retro Pop VFX — final review

User selected thick outlines, pixel stars and comic explosions, then explicitly approved the interactive image/motion prototype on 2026-10-19 before integration.

## Final behavior

- Existing cream cabinet, black CRT, seven mino colors and squared bevels remain the visual base. Light stays inside the screen.
- 16 original transparent image assets: four white pixel stars, four explosion stages, four contact splashes, medal/clover/heart/fever emblem.
- Landing keeps the 420 ms floor-anchored gummy deformation; contact imagery now uses squared pixel splashes and fragments rather than smooth bubbles.
- T-Spin uses stepped white stars with cyan/magenta offsets. Existing detection and score rules are retained.
- Clears and bombs get one comic hero burst per event, not a column of repeated round-particle clusters. Four short keyframes show impact → full burst → hollow burst → fragments.
- Fever opens with a large rainbow pixel emblem; white glints and small medals move near the edges. The smooth fan-light layer was removed.
- Heart, coin and clover VFX use the same atlas. Coins keep their flip animation. Staggered sprites now wait for their individual entrance time.
- New effects retain quality tiers, manual particle caps and reduced-motion scaling. LOW hides particles immediately. Missing image/decode uses a geometric fallback.
- The atlas decodes once and is normalized to sixteen cached 128×128 canvases. No per-frame decoding or pixel reads; the existing particle pool and Canvas renderer remain. No added runtime dependencies or changes to core/gameplay/audio/networking.

## Art source

`src/render/assets/retroPop.png`: 1254×1254 RGBA, 1,079,081 bytes; 61.3% completely transparent pixels. All 16 cells have nonempty artwork. Generated from the existing game screenshot as style context; no third-party game assets copied. See `src/render/assets/README.md` for atlas layout and provenance. The original image is preserved.

## Validation

- `npm run build`: passed, including TypeScript. Bundles one 1.08 MB PNG alongside the normal application.
- `npm test`: 192 tests across 13 files passed. Added coverage for missing-image fallback, delayed sprite entrances and pool reuse; renderer quality, state purity and repeated-burst budgets remain covered.
- `git diff --check`: passed.
- Real browser: image decode and all prototype scenes inspected; integrated production-renderer Spin, Tetris, explosion, landing and fever fixture exercised. Atlas-based star/burst/fever images visibly present, rather than fallback crosses.
- Desktop/laptop viewport checks from the game and prototype. The game remains PC-only. A mobile viewport override did not apply reliably to the intended tab, so no mobile-layout pass is claimed.
- LOW/reduced-motion branches covered by tests and fixture controls. The browser surface does not expose OS preference emulation, so the QualityManager API called by the existing preference listener is used.
- Fresh final application: two hard drops changed score from 0 to 40 to 64; the HUD reported 58–60 fps during this short run, pause worked, and no console errors/warnings were captured. This is a short smoke test, not a long gameplay benchmark.
- The comparison tab retained negative-radius arc errors from the earlier geometric renderer during exploration. The revised pool skips not-yet-born staggered particles and no longer uses those arc primitives. Final production-app validation was performed in a fresh tab.
- Renderer fixture uses synthetic, fixed game states and real renderer events. This is not a complete multiplayer/end-to-end gameplay or input-latency benchmark.

## Performance

Production build, prior PR version `7fb51e3` versus the sprite version. Per tier/version: 21 warm-up frames, 300 measured rAF intervals, repeated fever + T-Spin double (combo 12) + four-row bomb every 70 frames. 1440×900 browser viewport; only the measured renderer updates. Particle directions remain random.

| Version | Tier | Frame mean ms | Frame p95 ms | Max ms | >16.67 ms | Draw mean ms | Draw p95 ms | Draw max ms | Peak particles |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| before | ULTRA | 17 | 16.9 | 50 | 57.7% | 2.79 | 6.6 | 9.5 | 210 |
| after | ULTRA | 17.16 | 16.9 | 33.5 | 58.3% | 2.96 | 5.7 | 9.3 | 210 |
| before | HIGH | 17.05 | 16.9 | 33.3 | 56% | 2.15 | 4.5 | 6.4 | 130 |
| after | HIGH | 16.94 | 16.9 | 33.5 | 51.3% | 2.37 | 4.2 | 5.3 | 130 |
| before | MID | 17.22 | 16.9 | 49.9 | 56.7% | 1.69 | 3.2 | 4.6 | 60 |
| after | MID | 16.83 | 16.9 | 33.5 | 57.3% | 1.26 | 2.6 | 3.2 | 60 |
| before | LOW | 16.78 | 16.8 | 33.2 | 57.3% | 1.15 | 2.1 | 2.6 | 0 |
| after | LOW | 16.83 | 16.9 | 33.3 | 56.7% | 1 | 2.1 | 2.8 | 0 |

The final sprite run averaged about 58–60 fps in this fixture. It is **not a strict 60 fps budget pass**: frame p95 is 16.8–16.9 ms (target ≤16.67 ms), and some frames reach 33.5 ms. The >16.67 ms column also counts normal 16.7–16.9 ms scheduling/timestamp jitter; it must not be interpreted as that percentage of visibly dropped frames.

Draw timing measures synchronous event/update/Canvas calls, excluding deferred raster/compositing and initial atlas download/decode. ULTRA draw p95 was 6.6 ms before and 5.7 ms after in this run; that alone does not prove a general speedup. The earlier exploration session ran near 30 Hz even for its original LOW renderer, while this session ran near 60 Hz. Cross-session absolute comparisons are not controlled. No hardware-wide fps guarantee or startup-load performance claim is made.

## References and interpretation

- [Existing design specification](design/design-spec.html): binding palette, cabinet and screen vocabulary.
- [Takayu Motion Reference](https://motion-reference.takayustudio.jp/): squash, overshoot, recoil and radial-burst rhythm.
- [Creator account: Making my puzzle game feel juicy](https://www.reddit.com/r/indiegames/comments/u503em/making_my_puzzle_game_feel_juicy/): decaying deformation and star-based reward choreography.
- [canvas-confetti](https://github.com/catdad/canvas-confetti/blob/master/README.md): reviewed quality/reduced-motion approach; not installed.
- [Anthropic: Introducing Claude Design](https://www.anthropic.com/news/claude-design-anthropic-labs): public description of applying existing design systems and iterating visually. This is background for the design process, not evidence about unpublished internal implementation.

## Deliverables

Local outputs include `retro-pop-atlas.png`, `Retro Pop VFX.html` (standalone interactive concept), integrated comparison screenshots, `retro-pop-performance.json`, and the updated source archive. The concept is explicitly labeled an independent motion study; production integration is in `src/render/`. No changes were merged or deployed.
