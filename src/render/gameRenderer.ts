/**
 * ブラウン管の中身だけを描く。クリーム樹脂の筐体は DOM/CSS 側の担当。
 * 出典は docs/design/design-spec.html。
 *
 * 描画順（走査線をミノの下に敷くため、この順序は変えない）:
 *   盤面下地 → グリッド → 走査線 → ソフトスキャン光 → 積みブロック → ゴースト → 落下ミノ → パーティクル → フラッシュ
 *
 * 画面揺れは盤面ラッパー（DOM）にのみ適用し、筐体と HUD は固定する（酔い対策）。
 */
import { getShape } from '@core/pieces';
import { getGhostY } from '@core/game';
import {
  BOARD_BUFFER_HEIGHT,
  BOARD_HEIGHT,
  BOARD_VISIBLE_HEIGHT,
  BOARD_WIDTH,
  LINE_CLEAR_CELL_MS,
  LINE_CLEAR_COLUMN_DELAY_MS,
  getClearPopMs,
  LINE_CLEAR_DROP_MS,
  GRAVITY_BLOCK_MS,
  GRAVITY_COLUMN_DELAY_MS,
} from '@core/config/balance';
import type { GameEvent } from '@core/events';
import type { Cell, EventKind, GameState, MinoType, Rotation } from '@core/types';
import { easeOutBack, clamp01 } from './anim/spring';
import { drawBlock, drawClearingBlock, drawEventTile, drawGhostBlock } from './blocks';
import { ParticlePool } from './particles/pool';
import { QualityManager, getEffectScale } from './quality/qualityProfiles';
import {
  BEAT_MS,
  BOMB,
  COMBO,
  EASING,
  GRAVITY,
  HARD_DROP,
  TETRIS_FX,
  TETRIS_PILLAR_COLOR,
  TETRIS_RING_COLOR,
  TSPIN,
  TSPIN_FLASH_COLOR,
  TSPIN_TIER_COLORS,
  EVENT_VFX,
  EVENT_VFX_THIN_FROM,
  EVENT_VFX_THIN_RATIO,
  cubicBezierInverse,
  SHAKE,
  SHAKE_DECAY,
  cubicBezier,
  getClearShake,
} from './motion';
import {
  EVENT_COLORS,
  GARBAGE_COLOR,
  GRID,
  MINO_COLORS,
  NEON,
  SCANLINE,
  SCREEN,
  withAlpha,
} from './theme';
import type { GlowLevel } from './theme';

/** 集中線の表示時間。デザイン仕様の「1フレーム」に相当する短さ */
const SPEED_LINES_MS = 40;

/** おじゃま着弾の突き上げ演出の長さ */
const GARBAGE_IMPACT_MS = 260;

/**
 * 白い横スイープが各列を通過する時刻（チャージ完了からの経過ミリ秒）。
 * 圧縮の開始を「スイープ通過後」に正確に揃えるため、
 * イージングを逆算して一度だけ表にしておく。
 */
const TETRIS_WIPE_PASS_MS: readonly number[] = Array.from({ length: BOARD_WIDTH }, (_, x) => {
  // front はセル中心を基準に -0.5 から W+0.5 まで動く
  const target = (x + 1) / (BOARD_WIDTH + 1);
  return cubicBezierInverse(EASING.tetWipe, target) * TETRIS_FX.wipeMs;
});

/**
 * フィーバー中に巡回させる色。1/2拍ごとに切り替えてディスコの照明を作る。
 * 「光るのはブラウン管の中だけ」の原則は維持し、盤面の内側にのみ適用する。
 */
const DISCO_COLORS: readonly string[] = [
  NEON.magenta,
  NEON.cyan,
  NEON.yellow,
  NEON.green,
  '#a855ff',
  '#ff5a2f',
];

/** 盤面の論理サイズ（CSS px）。レスポンシブは CSS の scale で行う */
export const BOARD_PX_WIDTH = GRID.cellPitch * BOARD_WIDTH;
export const BOARD_PX_HEIGHT = GRID.cellPitch * BOARD_VISIBLE_HEIGHT;

/** 横一直線に拡散する衝撃波 */
type Shockwave = { y: number; life: number; maxLife: number; color: string };
/** 盤面全体のフラッシュ */
type Flash = { life: number; maxLife: number; peak: number; originX: number; color: string };

/** 着地スカッシュ。対象セルは通常描画から除外し、このパスでまとめて描く */
type Squash = {
  /** 盤面座標のセル一覧 */
  cells: readonly (readonly [number, number])[];
  life: number;
  maxLife: number;
  /** ハードドロップなら強く潰す */
  strong: boolean;
  /**
   * 潰しの深さ。指定すると単純な scale へ切り替わる。
   * T-Spin の「一瞬 .90 に潰れる」用。
   */
  depth?: number;
};

/**
 * T-Spin の演出。はまった穴の形に沿って白枠を収縮させる。
 * 対象セルは固定されたミノそのものなので、pieceLocked から受け取る。
 */
type TSpinFx = {
  cells: readonly (readonly [number, number])[];
  elapsedMs: number;
  /** 0=SINGLE(シアン) 1=DOUBLE(マゼンタ) 2=TRIPLE(ゴールド) */
  tier: number;
};

/**
 * イベントタイルVFXの予約。
 * ポップ消去がそのセルに到達したフレームで発火させるため、
 * 消去が始まった時点で「いつ・どこで・何を」出すかを積んでおく。
 */
type ScheduledEventVfx = {
  at: number;
  kind: EventKind;
  cellX: number;
  cellY: number;
  /** 同一消去内での通し番号。3個目以降はVFXを間引く */
  index: number;
};

/** リング・オーラ・光柱・水平線など、粒子ではない重ね描き */
type Overlay = {
  shape: 'ring' | 'beam' | 'hline';
  x: number;
  y: number;
  life: number;
  maxLife: number;
  color: string;
  /** ring の最終倍率、beam/hline の長さ */
  scale: number;
};

/** ハードドロップの残像 */
type Trail = {
  type: MinoType;
  rot: Rotation;
  x: number;
  fromY: number;
  toY: number;
  life: number;
  maxLife: number;
};

export class GameRenderer {
  readonly quality = new QualityManager();
  private readonly pool = new ParticlePool(600);

  private ctx: CanvasRenderingContext2D | null = null;
  /** 画面揺れを適用する DOM 要素（盤面ラッパー） */
  private shakeTarget: HTMLElement | null = null;
  private dpr = 1;

  private elapsedMs = 0;

  /** 画面揺れ */
  private shakeAmplitude = 0;
  private shakeRotation = 0;
  private shakeDurationMs = 0;
  private shakeRemainMs = 0;

  private readonly shockwaves: Shockwave[] = [];
  private readonly flashes: Flash[] = [];
  /** 着地スカッシュ。固定された直後のセルを潰して弾ませる */
  private squash: Squash | null = null;
  /** 高コンボ時の集中線。1フレームだけ出す */
  private speedLinesMs = 0;
  /** 直近にミノを置いた位置。演出の発生位置が特定できないときの拠り所 */
  private lastLockRow = BOARD_HEIGHT - 1;
  private lastLockColumn = BOARD_WIDTH / 2;

  /** T-Spin が決まった瞬間の演出 */
  private tspin: TSpinFx | null = null;
  /** イベントタイルVFXの発火予約 */
  private readonly eventVfxQueue: ScheduledEventVfx[] = [];
  /** リングや光柱などの重ね描き */
  private readonly overlays: Overlay[] = [];

  /** 着弾を待っているおじゃまの行数 */
  private pendingGarbage = 0;
  /** 着弾までの切迫度 0-1。1 で今まさに落ちてくる */
  private pendingUrgency = 0;
  /** おじゃま着弾直後の押し上げ演出の残り時間 */
  private garbageImpactMs = 0;
  /** ハードドロップの落下軌跡の残像 */
  private readonly trails: Trail[] = [];

  /** フィーバー中か（背景の脈動に使う） */
  private feverActive = false;
  /**
   * BGM の拍内位相 0-1。audio 層から毎フレーム渡される。
   * これを使うことで背景の脈動が曲のビートと完全に一致する。
   */
  private beatPhase = 0;
  /** 爆発中フラグ。フィーバーと重なったらパーティクルを間引く */
  private explodingUntilMs = 0;

  attach(canvas: HTMLCanvasElement, shakeTarget: HTMLElement | null): void {
    const context = canvas.getContext('2d', { alpha: false });
    if (context === null) return;
    this.ctx = context;
    this.shakeTarget = shakeTarget;
    this.resize(canvas);
  }

  detach(): void {
    this.ctx = null;
    if (this.shakeTarget !== null) this.shakeTarget.style.transform = '';
    this.shakeTarget = null;
    this.pool.clear();
    this.shockwaves.length = 0;
    this.flashes.length = 0;
    this.shakeAmplitude = 0;
  }

  /**
   * キャンバスの実解像度を更新する。論理サイズは常に 280×560。
   *
   * 筐体は CSS transform で拡縮されるため、その倍率もバッキングストアに掛けないと
   * 拡大時にドットがぼやける。ベベルの 1px が命なので、ここは必ず実寸に合わせる。
   */
  resize(canvas: HTMLCanvasElement, cabinetScale = 1): void {
    const deviceRatio = Math.min(2, window.devicePixelRatio || 1);
    // 上限を設けて、極端な拡大でバッファが肥大化するのを防ぐ
    this.dpr = Math.min(3, deviceRatio * Math.max(1, cabinetScale));

    canvas.width = Math.round(BOARD_PX_WIDTH * this.dpr);
    canvas.height = Math.round(BOARD_PX_HEIGHT * this.dpr);
    canvas.style.width = `${BOARD_PX_WIDTH}px`;
    canvas.style.height = `${BOARD_PX_HEIGHT}px`;
  }

  getParticleCount(): number {
    return this.pool.getAliveCount();
  }

  /**
   * BGM の拍内位相を受け取る。
   * 0 が渡され続ける（BGM停止中）場合は、内部時計から拍を作って脈動を止めない。
   */
  setBeatPhase(phase: number): void {
    this.beatPhase = phase > 0 ? phase : (this.elapsedMs % BEAT_MS) / BEAT_MS;
  }

  /**
   * 着弾待ちのおじゃま量を伝える。
   * 盤面の右端に警告ゲージを出し、切迫度が上がるほど激しく明滅させる。
   */
  setPendingGarbage(lines: number, urgency: number): void {
    this.pendingGarbage = lines;
    this.pendingUrgency = clamp01(urgency);
  }

  // ------------------------------------------------------------ イベント反応

  handleEvents(events: readonly GameEvent[], state: GameState): void {
    const tier = this.quality.getTier();
    const profile = this.quality.getProfile();

    // スタック取得の演出位置を決めるため、このバッチで消えた行を先に拾っておく。
    // stackGained は linesCleared より先に飛んでくるので、後追いでは間に合わない。
    let clearedRows: readonly number[] | null = null;
    let lockedCells: readonly (readonly [number, number])[] | null = null;

    for (const event of events) {
      if (event.kind === 'pieceLocked') {
        this.lastLockRow = event.y + 1;
        this.lastLockColumn = event.x + 1.5;
        lockedCells = getShape(event.type, event.rot).map(
          ([dx, dy]) => [event.x + dx, event.y + dy] as const,
        );
      }
      if (event.kind === 'linesCleared') {
        clearedRows = event.rows;
        // T-Spin は「はまった穴の形」に沿って枠を出すため、
        // 直前に固定されたミノのセルをそのまま使う
        if (event.clearType.startsWith('tspin') && lockedCells !== null) {
          this.tspin = {
            cells: lockedCells,
            elapsedMs: 0,
            tier: tspinTier(event.clearType),
          };
          this.punch(10, 160, 0, profile.shakeScale);
          this.emitTSpinShards(lockedCells, tier);

          // T-Spin の着地は「一瞬 scale .90 に潰れる」だけ。
          // ハードドロップ用の長いスカッシュに上書きされないよう差し替える。
          this.squash = {
            cells: lockedCells,
            life: TSPIN.squashMs,
            maxLife: TSPIN.squashMs,
            strong: false,
            depth: TSPIN.squashScale,
          };
        }
        this.scheduleEventVfx(event.rows, state);
      }
    }

    for (const event of events) {
      switch (event.kind) {
        case 'hardDropped': {
          this.punch(SHAKE.hardDrop.amplitude, SHAKE.hardDrop.durationMs, 0, profile.shakeScale);
          this.emitHardDropDebris(event.type, event.rot, event.x, event.toY, tier);

          // 衝撃波は実際に接地した最下段の行から横一直線に広がる
          const bottoms = this.getBottomCells(event.type, event.rot, event.x, event.toY);
          let deepest = event.toY;
          for (const { cy } of bottoms) deepest = Math.max(deepest, cy);

          this.shockwaves.push({
            y: deepest,
            life: HARD_DROP.shockwaveMs,
            maxLife: HARD_DROP.shockwaveMs,
            color: this.feverActive ? this.getDiscoColor(0) : NEON.cyan,
          });

          // 落下距離があるときだけ残像を残す
          if (event.distance > 1 && profile.particleLimit > 0) {
            this.trails.push({
              type: event.type,
              rot: event.rot,
              x: event.x,
              fromY: event.fromY,
              toY: event.toY,
              life: HARD_DROP.trailMs,
              maxLife: HARD_DROP.trailMs,
            });
          }
          break;
        }

        case 'pieceLocked': {
          const cells = getShape(event.type, event.rot).map(
            ([dx, dy]) => [event.x + dx, event.y + dy] as const,
          );
          this.squash = {
            cells,
            life: HARD_DROP.squashMs,
            maxLife: HARD_DROP.squashMs,
            strong: event.hard,
          };
          this.emitLockSplash(event.type, event.rot, event.x, event.y, event.hard, tier);
          break;
        }
        case 'linesCleared': {
          const shake = getClearShake(event.rows.length);
          this.punch(shake.amplitude, shake.durationMs, shake.rotationDeg, profile.shakeScale);
          this.emitLineClearDebris(event.rows, tier);

          // 20コンボ以降は背景に集中線を1フレーム差し込む
          if (event.combo >= COMBO.blinkFrom && profile.flashScale > 0) {
            this.speedLinesMs = SPEED_LINES_MS;
          }
          break;
        }
        case 'bombCleared': {
          this.punch(
            SHAKE.bombBig.amplitude,
            SHAKE.bombBig.durationMs,
            SHAKE.bombBig.rotationDeg,
            profile.shakeScale,
          );
          this.explodingUntilMs = this.elapsedMs + BOMB.scatterMs;
          this.flashes.push({
            life: BOMB.screenFlashMs,
            maxLife: BOMB.screenFlashMs,
            peak: BOMB.screenFlashMax * profile.flashScale,
            originX: BOMB.screenFlashOriginX,
            color: '#ffffff',
          });
          this.emitBombScatter(event.rows, tier);
          break;
        }
        case 'stackGained': {
          const scale = getEffectScale('stackGain', tier);
          if (scale.count > 0) {
            // 取得したイベントタイルは消えた行の上にあったので、そこから弾けさせる。
            // 行が特定できないときだけ、最後にミノを置いた位置を使う。
            const row = clearedRows?.[0] ?? this.lastLockRow;
            const column = clearedRows !== null ? Math.random() * BOARD_WIDTH : this.lastLockColumn;
            this.emitBurst(column, row, scale.count, EVENT_COLORS[event.event], 0.28);
          }
          break;
        }
        case 'gravityApplied': {
          this.punch(SHAKE.clear2.amplitude, GRAVITY.blockMs, 0, profile.shakeScale);
          break;
        }

        case 'garbageQueued': {
          // 届いた瞬間に一度だけ赤く警告する
          this.flashes.push({
            life: 140,
            maxLife: 140,
            peak: 0.4 * profile.flashScale,
            originX: 0.5,
            color: NEON.magenta,
          });
          break;
        }

        case 'garbageApplied': {
          // 下から突き上げられる感触を出す
          const shake = getClearShake(Math.min(4, event.lines));
          this.punch(shake.amplitude * 1.2, shake.durationMs, 0, profile.shakeScale);
          this.garbageImpactMs = GARBAGE_IMPACT_MS;
          this.emitGarbageImpact(event.lines, event.holeColumn, tier);
          break;
        }
        case 'feverStarted': {
          this.punch(
            SHAKE.feverEnter.amplitude,
            SHAKE.feverEnter.durationMs,
            0,
            profile.shakeScale,
          );
          this.flashes.push({
            life: 80,
            maxLife: 80,
            peak: 0.6 * profile.flashScale,
            originX: 0.5,
            color: NEON.magenta,
          });
          break;
        }
        default:
          break;
      }
    }

    this.feverActive = state.fever.until > state.elapsedMs;
    this.quality.setCongested(this.feverActive && this.explodingUntilMs > this.elapsedMs);
  }

  // ------------------------------------------------------------ 更新

  update(deltaMs: number): void {
    this.elapsedMs += deltaMs;
    this.pool.setLimit(this.quality.getProfile().particleLimit);
    this.pool.update(deltaMs);

    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const wave = this.shockwaves[i];
      if (wave === undefined) continue;
      wave.life -= deltaMs;
      if (wave.life <= 0) this.shockwaves.splice(i, 1);
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const flash = this.flashes[i];
      if (flash === undefined) continue;
      flash.life -= deltaMs;
      if (flash.life <= 0) this.flashes.splice(i, 1);
    }

    for (let i = this.trails.length - 1; i >= 0; i--) {
      const trail = this.trails[i];
      if (trail === undefined) continue;
      trail.life -= deltaMs;
      if (trail.life <= 0) this.trails.splice(i, 1);
    }

    if (this.squash !== null) {
      this.squash.life -= deltaMs;
      if (this.squash.life <= 0) this.squash = null;
    }

    if (this.speedLinesMs > 0) this.speedLinesMs -= deltaMs;
    if (this.garbageImpactMs > 0) this.garbageImpactMs -= deltaMs;

    if (this.tspin !== null) {
      this.tspin.elapsedMs += deltaMs;
      if (this.tspin.elapsedMs > TSPIN.outlineMs + TSPIN.outlineFadeMs) this.tspin = null;
    }

    // 発火時刻を過ぎたイベントVFXを出す
    while (this.eventVfxQueue.length > 0) {
      const head = this.eventVfxQueue[0];
      if (head === undefined || head.at > this.elapsedMs) break;
      this.eventVfxQueue.shift();
      this.fireEventVfx(head);
    }

    for (let i = this.overlays.length - 1; i >= 0; i--) {
      const overlay = this.overlays[i];
      if (overlay === undefined) continue;
      overlay.life -= deltaMs;
      if (overlay.life <= 0) this.overlays.splice(i, 1);
    }

    this.updateShake(deltaMs);
  }

  /** 画面揺れを DOM の transform に反映する。React の再描画は挟まない */
  private updateShake(deltaMs: number): void {
    const target = this.shakeTarget;
    if (target === null) return;

    if (this.shakeRemainMs <= 0) {
      if (this.shakeAmplitude !== 0) {
        this.shakeAmplitude = 0;
        target.style.transform = '';
      }
      return;
    }

    this.shakeRemainMs -= deltaMs;
    const t = clamp01(this.shakeRemainMs / this.shakeDurationMs);
    // 減衰は振幅を毎回 ×0.62
    const decay = Math.pow(SHAKE_DECAY, (1 - t) * 4);
    const amplitude = this.shakeAmplitude * decay;

    const x = Math.sin(this.elapsedMs * 0.085) * amplitude;
    const y = Math.cos(this.elapsedMs * 0.117) * amplitude * 0.7;
    const rotation = Math.sin(this.elapsedMs * 0.073) * this.shakeRotation * decay;

    target.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${rotation.toFixed(3)}deg)`;
  }

  private punch(amplitude: number, durationMs: number, rotationDeg: number, scale: number): void {
    const applied = amplitude * scale;
    if (applied <= 0) return;
    if (applied < this.shakeAmplitude && this.shakeRemainMs > 0) return;
    this.shakeAmplitude = applied;
    this.shakeRotation = rotationDeg * scale;
    this.shakeDurationMs = durationMs;
    this.shakeRemainMs = durationMs;
  }

  // ------------------------------------------------------------ 描画

  render(state: GameState): void {
    const ctx = this.ctx;
    if (ctx === null) return;

    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    this.drawBoardBackground(ctx);
    this.drawGrid(ctx);
    this.drawSpeedLines(ctx);
    this.drawScanlines(ctx);
    this.drawScanSweep(ctx);
    this.drawStack(ctx, state);
    this.drawTetrisOverlay(ctx, state);
    this.drawTSpin(ctx);
    this.drawFeverGlow(ctx, state);
    this.drawGravity(ctx, state);
    this.drawSquash(ctx, state);
    this.drawTrails(ctx);
    this.drawGhost(ctx, state);
    this.drawActive(ctx, state);
    this.drawOverlays(ctx);
    this.pool.draw(ctx);
    this.drawShockwaves(ctx);
    this.drawGarbageWarning(ctx);
    this.drawFlashes(ctx);

    ctx.restore();
  }

  private drawBoardBackground(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = SCREEN.board;
    ctx.fillRect(0, 0, BOARD_PX_WIDTH, BOARD_PX_HEIGHT);

    // フィーバー中はディスコの照明。拍ごとに色が変わり、明るさも拍で脈動する
    if (this.feverActive) {
      const flash = this.quality.getProfile().flashScale;
      const pulse = 0.5 - 0.5 * Math.cos(this.beatPhase * Math.PI * 2);

      // 主照明
      ctx.fillStyle = withAlpha(this.getDiscoColor(0), (0.1 + pulse * 0.22) * flash);
      ctx.fillRect(0, 0, BOARD_PX_WIDTH, BOARD_PX_HEIGHT);

      // 対向色のスポットを斜めに走らせ、単色べた塗りに見えないようにする
      const sweep = (this.elapsedMs % (BEAT_MS * 2)) / (BEAT_MS * 2);
      const beamX = -BOARD_PX_WIDTH + sweep * BOARD_PX_WIDTH * 3;
      const gradient = ctx.createLinearGradient(beamX, 0, beamX + BOARD_PX_WIDTH * 0.9, BOARD_PX_HEIGHT);
      gradient.addColorStop(0, withAlpha(this.getDiscoColor(3), 0));
      gradient.addColorStop(0.5, withAlpha(this.getDiscoColor(3), 0.28 * flash));
      gradient.addColorStop(1, withAlpha(this.getDiscoColor(3), 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, BOARD_PX_WIDTH, BOARD_PX_HEIGHT);
    }
  }

  private drawGrid(ctx: CanvasRenderingContext2D): void {
    // グリッドの明るさも拍で軽く明滅させ、盤面全体をテンポに乗せる
    const beat = 0.5 - 0.5 * Math.cos(this.beatPhase * Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${(0.035 + beat * 0.022).toFixed(4)})`;
    for (let x = 0; x <= BOARD_WIDTH; x++) {
      ctx.fillRect(x * GRID.cellPitch, 0, 1, BOARD_PX_HEIGHT);
    }
    for (let y = 0; y <= BOARD_VISIBLE_HEIGHT; y++) {
      ctx.fillRect(0, y * GRID.cellPitch, BOARD_PX_WIDTH, 1);
    }
  }

  /**
   * 集中線。20コンボ以降のライン消去で1フレームだけ差し込む。
   * 角度は固定にして、毎フレーム描いてもちらつかないようにする。
   */
  private drawSpeedLines(ctx: CanvasRenderingContext2D): void {
    if (this.speedLinesMs <= 0) return;

    const alpha = clamp01(this.speedLinesMs / SPEED_LINES_MS) * this.quality.getProfile().flashScale;
    const cx = BOARD_PX_WIDTH / 2;
    const cy = BOARD_PX_HEIGHT / 2;
    const radius = Math.hypot(cx, cy);
    const count = 28;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = withAlpha(NEON.yellow, alpha * 0.5);

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      // 中心付近は空けて、外側だけに線を引く
      const inner = radius * 0.38;
      ctx.lineWidth = i % 2 === 0 ? 3 : 1.5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
      ctx.stroke();
    }

    ctx.restore();
  }

  /** 走査線。盤面背景のみに敷き、ミノの下に置く */
  private drawScanlines(ctx: CanvasRenderingContext2D): void {
    const alpha = this.quality.getScanlineAlpha(SCANLINE.lineAlpha);
    if (alpha <= 0) return;
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    for (let y = 0; y < BOARD_PX_HEIGHT; y += SCANLINE.linePeriod) {
      ctx.fillRect(0, y, BOARD_PX_WIDTH, 1);
    }
  }

  /** 6.5秒周期で上から下へ流れるソフトな光 */
  private drawScanSweep(ctx: CanvasRenderingContext2D): void {
    if (!this.quality.getProfile().scanSweep) return;

    const height = BOARD_PX_HEIGHT * SCANLINE.sweepHeightRatio;
    const phase = (this.elapsedMs % SCANLINE.sweepMs) / SCANLINE.sweepMs;
    const y = -height + phase * (BOARD_PX_HEIGHT + height * 2);

    const gradient = ctx.createLinearGradient(0, y, 0, y + height);
    gradient.addColorStop(0, `rgba(255, 255, 255, ${SCANLINE.sweepAlpha})`);
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, y, BOARD_PX_WIDTH, height);
  }

  /**
   * 積みブロック。ライン消去演出中は
   * 「消える行 = 左→右にポップ」「残る行 = 段落下」を同時に処理する。
   */
  private drawStack(ctx: CanvasRenderingContext2D, state: GameState): void {
    const clearing = state.clearing;
    const clearingRows = clearing !== null ? new Set(clearing.rows) : null;

    // スカッシュ中のセルはここでは描かず、専用パスで潰した状態を描く。
    // 消去演出中は演出が競合するのでスカッシュを行わない。
    const squashKeys = this.getSquashKeys(state);

    // 重力で落下中のセルも通常描画から外し、補間位置に描く
    const fallingKeys = this.getFallingKeys(state);

    // 4列消しは左からのポップではなく専用演出になる（デザイン仕様 05-I）
    const isTetris = clearing !== null && clearing.rows.length >= 4;
    const popMs = clearing !== null ? getClearPopMs(clearing.rows.length) : 0;

    // 段落下のオフセット
    let dropEase = 0;
    if (clearing !== null && clearing.elapsedMs > popMs) {
      const t = clamp01((clearing.elapsedMs - popMs) / LINE_CLEAR_DROP_MS);
      dropEase = easeOutBack(t);
    }

    for (let y = BOARD_BUFFER_HEIGHT; y < BOARD_HEIGHT; y++) {
      const row = state.board[y];
      if (row === undefined) continue;

      const isClearing = clearingRows?.has(y) === true;
      // この行より下にある消去行の数だけ、演出後に下へずれる
      let shift = 0;
      if (clearing !== null && !isClearing) {
        for (const r of clearing.rows) if (r > y) shift += 1;
      }
      const drawRow = y + shift * dropEase;
      const py = (drawRow - BOARD_BUFFER_HEIGHT) * GRID.cellPitch;

      for (let x = 0; x < BOARD_WIDTH; x++) {
        const cell = row[x];
        if (cell == null) continue;
        const key = y * BOARD_WIDTH + x;
        if (squashKeys !== null && squashKeys.has(key)) continue;
        if (fallingKeys !== null && fallingKeys.has(key)) continue;
        const px = x * GRID.cellPitch;
        const color = cell.event !== null ? EVENT_COLORS[cell.event] : MINO_COLORS[cell.color];

        if (isClearing && clearing !== null) {
          if (isTetris) {
            // 4列消し: チャージ→白飛び→圧縮。行の並び順（下から）で遅延をずらす
            const rowIndex = clearing.rows.indexOf(y);
            const fromBottom = clearing.rows.length - 1 - rowIndex;
            this.drawTetrisCell(ctx, px, py, cell, clearing.elapsedMs, fromBottom, x);
            continue;
          }

          // 通常消去: 列ごとにずらして 210ms でポップさせる
          const start = x * LINE_CLEAR_COLUMN_DELAY_MS;
          const progress = (clearing.elapsedMs - start) / LINE_CLEAR_CELL_MS;
          if (progress < 0) {
            // まだ順番が来ていないセルは L3 に上げて「消される直前」を示す
            this.drawCell(ctx, px, py, cell, 'L3');
          } else if (progress < 1) {
            drawClearingBlock(ctx, px, py, GRID.cellBody, color, progress);
          }
          continue;
        }

        this.drawCell(ctx, px, py, cell, 'L1');
      }
    }
  }

  /**
   * 4列消しの1セル。デザイン仕様 05-I の3段階を再現する。
   *   ①チャージ: 下の行から 55ms 差で白飛びしながら縦に膨らむ
   *   ②スイープ: 白い横線が通過する
   *   ③圧縮: 通過した列から scaleY 0.24 → 0 へ潰れて消える
   */
  private drawTetrisCell(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    cell: NonNullable<Cell>,
    elapsedMs: number,
    fromBottom: number,
    column: number,
  ): void {
    const chargeStart = fromBottom * TETRIS_FX.rowStaggerMs;
    const chargeT = clamp01((elapsedMs - chargeStart) / TETRIS_FX.chargeMs);

    // 圧縮はスイープがこの列を通過してから始まる
    const compressStart = TETRIS_FX.chargeMs + (TETRIS_WIPE_PASS_MS[column] ?? 0);
    const compressT = clamp01((elapsedMs - compressStart) / TETRIS_FX.compressMs);
    if (compressT >= 1) return;

    // 彩度を落としながら白飛びさせる
    const brightness = 1 + (TETRIS_FX.chargeBrightness - 1) * chargeT;
    const saturate = 1 - chargeT;

    // 膨らみ → 圧縮
    const scaleY =
      compressT > 0
        ? TETRIS_FX.compressFromScaleY * (1 - compressT)
        : 1 + (TETRIS_FX.chargeScaleY - 1) * chargeT;

    const color = cell.event !== null ? EVENT_COLORS[cell.event] : MINO_COLORS[cell.color];
    const centerY = py + GRID.cellBody / 2;

    ctx.save();
    ctx.translate(px, centerY);
    ctx.scale(1, scaleY);
    ctx.translate(-px, -centerY);
    ctx.filter = `brightness(${brightness.toFixed(2)}) saturate(${saturate.toFixed(2)})`;
    drawBlock(ctx, px, py, GRID.cellBody, color);
    ctx.filter = 'none';
    ctx.restore();
  }

  /**
   * T-Spin。はまった穴の形に沿った白枠が scale 1.75 → 1.00 でカチッと収縮し、
   * 線幅を 6 → 2px へ絞ってからフェードする。同フレームで紫のフラッシュを重ねる。
   */
  private drawTSpin(ctx: CanvasRenderingContext2D): void {
    const fx = this.tspin;
    if (fx === null) return;

    const flash = this.quality.getProfile().flashScale;
    const elapsed = fx.elapsedMs;

    // 紫フラッシュ
    if (elapsed < TSPIN.flashMs) {
      const t = 1 - elapsed / TSPIN.flashMs;
      ctx.fillStyle = withAlpha(TSPIN_FLASH_COLOR, 0.5 * t * flash);
      ctx.fillRect(0, 0, BOARD_PX_WIDTH, BOARD_PX_HEIGHT);
    }

    // 収縮 → フェード
    const shrinkT = clamp01(elapsed / TSPIN.outlineMs);
    const scale =
      TSPIN.outlineFromScale +
      (TSPIN.outlineToScale - TSPIN.outlineFromScale) * cubicBezier(EASING.slam, shrinkT);
    const width =
      TSPIN.outlineFromWidth + (TSPIN.outlineToWidth - TSPIN.outlineFromWidth) * shrinkT;

    const fadeT = clamp01((elapsed - TSPIN.outlineMs) / TSPIN.outlineFadeMs);
    const alpha = (1 - fadeT) * flash;
    if (alpha <= 0) return;

    // セル群の中心を原点にして拡大縮小する
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [x, y] of fx.cells) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const centerX = ((minX + maxX + 1) / 2) * GRID.cellPitch;
    const centerY = ((minY + maxY + 1) / 2 - BOARD_BUFFER_HEIGHT) * GRID.cellPitch;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.scale(scale, scale);
    ctx.translate(-centerX, -centerY);

    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1, width);
    ctx.shadowColor = TSPIN_TIER_COLORS[fx.tier] ?? TSPIN_TIER_COLORS[0];
    ctx.shadowBlur = 18;

    for (const [x, y] of fx.cells) {
      if (y < BOARD_BUFFER_HEIGHT) continue;
      ctx.strokeRect(
        x * GRID.cellPitch,
        (y - BOARD_BUFFER_HEIGHT) * GRID.cellPitch,
        GRID.cellBody,
        GRID.cellBody,
      );
    }

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /**
   * 消える行に含まれるイベントタイルを拾い、
   * ポップ（4列消しならスイープ）がそのセルに到達する時刻で予約する。
   */
  private scheduleEventVfx(rows: readonly number[], state: GameState): void {
    const isTetris = rows.length >= 4;
    const found: { column: number; at: number; kind: EventKind; row: number }[] = [];

    // 左から右の順に拾う。同一ラインの連発順を仕様どおりにするため
    for (let x = 0; x < BOARD_WIDTH; x++) {
      for (const y of [...rows].sort((a, b) => a - b)) {
        const cell = state.board[y]?.[x];
        if (cell == null || cell.event === null) continue;
        const offset = isTetris
          ? TETRIS_FX.chargeMs + (TETRIS_WIPE_PASS_MS[x] ?? 0)
          : x * LINE_CLEAR_COLUMN_DELAY_MS;
        found.push({ column: x, at: this.elapsedMs + offset, kind: cell.event, row: y });
      }
    }

    found.forEach((entry, index) => {
      this.eventVfxQueue.push({
        at: entry.at,
        kind: entry.kind,
        cellX: entry.column,
        cellY: entry.row,
        index,
      });
    });
    this.eventVfxQueue.sort((a, b) => a.at - b.at);
  }

  /** 予約されたイベントVFXを実際に出す */
  private fireEventVfx(entry: ScheduledEventVfx): void {
    const profile = this.quality.getProfile();
    if (profile.particleLimit === 0) return;

    // 3個目以降は数を半分に間引く（音程だけ上げる方針）
    const thin = entry.index >= EVENT_VFX_THIN_FROM ? EVENT_VFX_THIN_RATIO : 1;

    const x = entry.cellX * GRID.cellPitch + GRID.cellBody / 2;
    const y = (entry.cellY - BOARD_BUFFER_HEIGHT) * GRID.cellPitch + GRID.cellBody / 2;

    switch (entry.kind) {
      case 'bomb':
        this.emitBombVfx(x, y, thin, profile.shakeScale, profile.flashScale);
        break;
      case 'heart':
        this.emitHeartVfx(x, y, thin);
        break;
      case 'coin':
        this.emitCoinVfx(x, y, thin);
        break;
      case 'clover':
        this.emitCloverVfx(x, y, thin);
        break;
    }
  }

  /** 爆弾: 二重の衝撃リング＋放物線の破片＋短い赤フラッシュ */
  private emitBombVfx(
    x: number,
    y: number,
    thin: number,
    shakeScale: number,
    flashScale: number,
  ): void {
    const spec = EVENT_VFX.bomb;

    this.overlays.push({
      shape: 'ring',
      x,
      y,
      life: spec.waveMs,
      maxLife: spec.waveMs,
      color: NEON.magenta,
      scale: spec.waveToScale,
    });
    // 2本目は 80ms 遅らせてイエローで重ねる
    this.overlays.push({
      shape: 'ring',
      x,
      y,
      life: spec.waveMs + spec.waveDelayMs,
      maxLife: spec.waveMs,
      color: NEON.yellow,
      scale: spec.waveToScale,
    });

    this.flashes.push({
      life: spec.flashMs,
      maxLife: spec.flashMs,
      peak: 0.4 * flashScale,
      originX: x / BOARD_PX_WIDTH,
      color: '#ff2f2f',
    });
    this.punch(spec.shakePx, 180, 0, shakeScale);

    const count = Math.max(2, Math.round(spec.debris * thin));
    for (let i = 0; i < count; i++) {
      const p = this.pool.acquire();
      if (p === null) return;
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const velocity = 0.16 + Math.random() * 0.3;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * velocity;
      p.vy = Math.sin(angle) * velocity - 0.12;
      p.maxLife = spec.debrisMs;
      p.life = p.maxLife;
      p.size = GRID.cellBody * 0.16;
      p.color = i % 2 === 0 ? NEON.yellow : NEON.magenta;
      p.gravity = 0.0016;
      p.drag = 0.998;
      p.spin = 0.011;
      p.shape = 'square';
    }
  }

  /** ハート: 柔らかいオーラとふわりと昇るハート。爆発感を出さない */
  private emitHeartVfx(x: number, y: number, thin: number): void {
    const spec = EVENT_VFX.heart;

    this.overlays.push({
      shape: 'ring',
      x,
      y,
      life: spec.auraMs,
      maxLife: spec.auraMs,
      color: EVENT_COLORS.heart,
      scale: spec.auraToScale,
    });

    const base = spec.countMin + Math.floor(Math.random() * (spec.countMax - spec.countMin + 1));
    const count = Math.max(2, Math.round(base * thin));

    for (let i = 0; i < count; i++) {
      const p = this.pool.acquire();
      if (p === null) return;
      p.x = x + (Math.random() - 0.5) * GRID.cellBody;
      p.y = y;
      p.vx = 0;
      p.vy = -0.13;
      // 90ms 差で順に立ち上がるよう、寿命に下駄を履かせる
      p.maxLife = spec.floatMs;
      p.life = p.maxLife + i * spec.staggerMs;
      p.size = GRID.cellBody * 0.55;
      p.color = EVENT_COLORS.heart;
      p.gravity = -0.00002;
      p.drag = 1;
      p.shape = 'glyph';
      p.glyph = '♥';
      p.waver = spec.waverPx;
      p.waverPhase = Math.random() * Math.PI * 2;
    }
  }

  /** コイン: rotateY する金貨が左右に散り、金の水平ラインが残る */
  private emitCoinVfx(x: number, y: number, thin: number): void {
    const spec = EVENT_VFX.coin;

    this.overlays.push({
      shape: 'hline',
      x,
      y,
      life: spec.lineMs,
      maxLife: spec.lineMs,
      color: NEON.yellow,
      scale: BOARD_PX_WIDTH,
    });

    const base = spec.countMin + Math.floor(Math.random() * (spec.countMax - spec.countMin + 1));
    const count = Math.max(2, Math.round(base * thin));

    for (let i = 0; i < count; i++) {
      const p = this.pool.acquire();
      if (p === null) return;
      // 左右に散らす
      const dir = i % 2 === 0 ? -1 : 1;
      p.x = x;
      p.y = y;
      p.vx = dir * (0.06 + Math.random() * 0.12);
      p.vy = -(0.12 + Math.random() * 0.1);
      p.maxLife = spec.spinMs;
      p.life = p.maxLife;
      p.size = GRID.cellBody * 0.5;
      p.color = i % 3 === 0 ? '#ffd400' : NEON.yellow;
      p.gravity = 0.0012;
      p.drag = 0.999;
      // rotateY 1080° 相当を寿命いっぱいで回しきる
      p.spin = (Math.PI * 2 * spec.spinTurns) / spec.spinMs;
      p.shape = 'coin';
    }
  }

  /** クローバー: 緑の光柱と、螺旋を描いて外へ飛ぶ星 */
  private emitCloverVfx(x: number, y: number, thin: number): void {
    const spec = EVENT_VFX.clover;

    this.overlays.push({
      shape: 'beam',
      x,
      y,
      life: spec.beamMs,
      maxLife: spec.beamMs,
      color: EVENT_COLORS.clover,
      scale: y,
    });

    const count = Math.max(2, Math.round(spec.count * thin));
    for (let i = 0; i < count; i++) {
      const p = this.pool.acquire();
      if (p === null) return;
      const angle = (Math.PI * 2 * i) / count;
      // 螺旋に見えるよう、接線方向の速度を与えて回転もかける
      const velocity = 0.1 + Math.random() * 0.06;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * velocity;
      p.vy = Math.sin(angle) * velocity - 0.04;
      p.maxLife = spec.swirlMs;
      p.life = p.maxLife + i * spec.staggerMs;
      p.size = GRID.cellBody * 0.5;
      p.color = EVENT_COLORS.clover;
      p.gravity = 0.0002;
      p.drag = 0.9992;
      p.spin = (Math.PI * 2 * spec.swirlTurns) / spec.swirlMs;
      p.shape = 'glyph';
      p.glyph = '✦';
    }
  }

  /** リング・光柱・水平線をまとめて描く */
  private drawOverlays(ctx: CanvasRenderingContext2D): void {
    if (this.overlays.length === 0) return;
    const flash = this.quality.getProfile().flashScale;

    ctx.save();
    for (const overlay of this.overlays) {
      // maxLife を超える life は「発火待ち」なので、まだ描かない
      if (overlay.life > overlay.maxLife) continue;
      const t = 1 - overlay.life / overlay.maxLife;
      const alpha = (1 - t) * flash;
      if (alpha <= 0) continue;

      if (overlay.shape === 'ring') {
        const radius = GRID.cellBody * 0.5 * (0.1 + overlay.scale * t);
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = overlay.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(overlay.x, overlay.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      } else if (overlay.shape === 'beam') {
        // 真上に立ち上がる光の柱
        const height = overlay.scale * Math.min(1, t * 2);
        const gradient = ctx.createLinearGradient(overlay.x, overlay.y, overlay.x, overlay.y - height);
        gradient.addColorStop(0, withAlpha(overlay.color, alpha * 0.9));
        gradient.addColorStop(1, withAlpha(overlay.color, 0));
        ctx.fillStyle = gradient;
        ctx.fillRect(overlay.x - GRID.cellBody * 0.4, overlay.y - height, GRID.cellBody * 0.8, height);
      } else {
        // 落下が緩む合図の水平線
        const width = overlay.scale * Math.min(1, t * 3);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = overlay.color;
        ctx.fillRect(overlay.x - width / 2, overlay.y - 1, width, 2);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /** T-Spin の破片。6〜10片を全方位へ飛ばす */
  private emitTSpinShards(
    cells: readonly (readonly [number, number])[],
    tier: ReturnType<QualityManager['getTier']>,
  ): void {
    if (this.quality.getProfile().particleLimit === 0) return;

    const scale = getEffectScale('lockSplash', tier);
    if (scale.count === 0) return;

    let sumX = 0;
    let sumY = 0;
    for (const [x, y] of cells) {
      sumX += x;
      sumY += y;
    }
    const cx = (sumX / cells.length + 0.5) * GRID.cellPitch;
    const cy = (sumY / cells.length + 0.5 - BOARD_BUFFER_HEIGHT) * GRID.cellPitch;

    const count =
      TSPIN.shardMin + Math.floor(Math.random() * (TSPIN.shardMax - TSPIN.shardMin + 1));

    for (let i = 0; i < count; i++) {
      const p = this.pool.acquire();
      if (p === null) return;
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
      const velocity = 0.2 + Math.random() * 0.3;
      p.x = cx;
      p.y = cy;
      p.vx = Math.cos(angle) * velocity;
      p.vy = Math.sin(angle) * velocity;
      p.maxLife = TSPIN.shardMs * scale.life;
      p.life = p.maxLife;
      p.size = GRID.cellBody * (0.12 + Math.random() * 0.12);
      p.color = i % 2 === 0 ? '#ffffff' : TSPIN_FLASH_COLOR;
      p.gravity = 0.0006;
      p.drag = 0.997;
      p.rotation = Math.random() * Math.PI;
      p.spin = (Math.random() - 0.5) * 0.03;
      p.shape = 'square';
    }
  }

  /**
   * 4列消しの盤面全体エフェクト。
   * 白い横スイープ・金色リング・盤面下からの光の柱。
   */
  private drawTetrisOverlay(ctx: CanvasRenderingContext2D, state: GameState): void {
    const clearing = state.clearing;
    if (clearing === null || clearing.rows.length < 4) return;

    const flash = this.quality.getProfile().flashScale;
    const elapsed = clearing.elapsedMs;

    // 消える4行の範囲
    let top = Infinity;
    let bottom = -Infinity;
    for (const row of clearing.rows) {
      top = Math.min(top, row);
      bottom = Math.max(bottom, row);
    }
    const bandTop = (top - BOARD_BUFFER_HEIGHT) * GRID.cellPitch;
    const bandHeight = (bottom - top + 1) * GRID.cellPitch;

    // ② 白い横スイープ
    const wipeT = (elapsed - TETRIS_FX.chargeMs) / TETRIS_FX.wipeMs;
    if (wipeT > 0 && wipeT < 1) {
      const front = cubicBezier(EASING.tetWipe, wipeT) * (BOARD_PX_WIDTH + 80) - 40;
      const gradient = ctx.createLinearGradient(front - 40, 0, front + 40, 0);
      gradient.addColorStop(0, 'rgba(255,255,255,0)');
      gradient.addColorStop(0.5, `rgba(255,255,255,${0.95 * flash})`);
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(front - 40, bandTop, 80, bandHeight);
    }

    const burstStart = TETRIS_FX.chargeMs + TETRIS_FX.wipeMs;

    // 盤面下から立ち上がる光の柱
    const pillarT = clamp01((elapsed - burstStart) / TETRIS_FX.pillarMs);
    if (pillarT > 0 && pillarT < 1) {
      const height = BOARD_PX_HEIGHT * Math.min(1, pillarT * 2.2);
      const alpha = (1 - pillarT) * 0.55 * flash;
      const gradient = ctx.createLinearGradient(0, BOARD_PX_HEIGHT, 0, BOARD_PX_HEIGHT - height);
      gradient.addColorStop(0, withAlpha(TETRIS_PILLAR_COLOR, alpha));
      gradient.addColorStop(1, withAlpha(TETRIS_PILLAR_COLOR, 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, BOARD_PX_HEIGHT - height, BOARD_PX_WIDTH, height);
    }

    // 金色リングが横楕円で拡散する
    const ringT = clamp01((elapsed - burstStart) / TETRIS_FX.ringMs);
    if (ringT > 0 && ringT < 1) {
      const centerY = bandTop + bandHeight / 2;
      const scale = 0.2 + (TETRIS_FX.ringToScale - 0.2) * ringT;
      ctx.save();
      ctx.globalAlpha = (1 - ringT) * 0.9 * flash;
      ctx.strokeStyle = TETRIS_RING_COLOR;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(
        BOARD_PX_WIDTH / 2,
        centerY,
        (BOARD_PX_WIDTH / 2) * scale,
        (bandHeight / 2) * scale,
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawCell(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    cell: NonNullable<Cell>,
    glow: GlowLevel,
  ): void {
    if (cell.event !== null) {
      // フィーバー中はイベントタイルの glow を L3 まで上げる
      const level: GlowLevel = this.feverActive ? 'L3' : glow;
      if (this.quality.getProfile().eventGlow) {
        drawEventTile(ctx, px, py, GRID.cellBody, cell.event, level, this.elapsedMs);
      } else {
        drawBlock(ctx, px, py, GRID.cellBody, EVENT_COLORS[cell.event]);
      }
      return;
    }
    // 相手から送られたおじゃまは無彩色にして、自分の積みと区別できるようにする
    const color = cell.garbage === true ? GARBAGE_COLOR : MINO_COLORS[cell.color];
    drawBlock(ctx, px, py, GRID.cellBody, color);
  }

  /**
   * フィーバー中の巡回色。offset をずらすと同じ瞬間でも別の色が返るので、
   * パーティクル1粒ずつを違う色にして虹色に散らせる。
   */
  private getDiscoColor(offset = 0): string {
    const step = Math.floor(this.elapsedMs / (BEAT_MS / 2)) + Math.round(offset);
    const index = ((step % DISCO_COLORS.length) + DISCO_COLORS.length) % DISCO_COLORS.length;
    return DISCO_COLORS[index] ?? NEON.magenta;
  }

  /**
   * フィーバー中、積んであるミノ全体を虹色に明滅させる。
   * セルごとに合成モードを切り替えると重いので、まとめて1パスで処理する。
   * 波は左上から右下へ流れ、盤面全体がうねって見えるようにしてある。
   */
  private drawFeverGlow(ctx: CanvasRenderingContext2D, state: GameState): void {
    if (!this.feverActive) return;

    const flash = this.quality.getProfile().flashScale;
    if (flash <= 0) return;

    const beat = 0.5 - 0.5 * Math.cos(this.beatPhase * Math.PI * 2);

    /*
     * 色はフレームごとに2色だけ決め、セル単位では globalAlpha（数値）しか動かさない。
     * セルごとに rgba 文字列を組み立てると毎フレーム200個の文字列ゴミが出て、
     * GC で 60fps を割る。ここはホットパスなので文字列を作らないこと。
     */
    const colorA = this.getDiscoColor(0);
    const colorB = this.getDiscoColor(3);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (let pass = 0; pass < 2; pass++) {
      ctx.fillStyle = pass === 0 ? colorA : colorB;

      for (let y = BOARD_BUFFER_HEIGHT; y < BOARD_HEIGHT; y++) {
        const row = state.board[y];
        if (row === undefined) continue;

        for (let x = 0; x < BOARD_WIDTH; x++) {
          if (row[x] == null) continue;
          // 市松状に2色を振り分け、単色べた塗りに見えないようにする
          if (((x + y) & 1) !== pass) continue;

          // 位置に応じて波の位相をずらす
          const wave = 0.5 - 0.5 * Math.cos((x + y) * 0.55 - this.beatPhase * Math.PI * 2);
          ctx.globalAlpha = (0.12 + wave * 0.4 + beat * 0.2) * flash;
          ctx.fillRect(
            x * GRID.cellPitch,
            (y - BOARD_BUFFER_HEIGHT) * GRID.cellPitch,
            GRID.cellBody,
            GRID.cellBody,
          );
        }
      }
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /** 重力で落下中のセル（移動元）の索引。落下中でなければ null */
  private getFallingKeys(state: GameState): Set<number> | null {
    const gravity = state.gravity;
    if (gravity === null) return null;

    const keys = new Set<number>();
    for (const move of gravity.moves) {
      keys.add(move.fromY * BOARD_WIDTH + move.x);
    }
    return keys.size > 0 ? keys : null;
  }

  /**
   * 重力の落下アニメーション。デザイン仕様 04-D:
   *   列ごとに左→右へ32msずらし、1ブロック270ms `cubic-bezier(.34,1.3,.5,1)`。
   * このイージングは終端で行き過ぎるため、着地時の小バウンドが自然に出る。
   * 落下距離が長いブロックほど残像を濃く残す。
   */
  private drawGravity(ctx: CanvasRenderingContext2D, state: GameState): void {
    const gravity = state.gravity;
    if (gravity === null) return;

    const trails = this.quality.getProfile().particleLimit > 0;

    for (const move of gravity.moves) {
      const delay = move.x * GRAVITY_COLUMN_DELAY_MS;
      const t = clamp01((gravity.elapsedMs - delay) / GRAVITY_BLOCK_MS);
      const eased = t <= 0 ? 0 : cubicBezier(EASING.gravity, t);

      const distance = move.toY - move.fromY;
      const y = move.fromY + distance * eased;
      const px = move.x * GRID.cellPitch;

      const cell = state.board[move.fromY]?.[move.x];
      if (cell == null) continue;

      // 残像。落下距離が長いほど濃く、進むほど薄れる
      if (trails && t > 0 && t < 1) {
        const strength = Math.min(1, distance / 6) * (1 - t) * GRAVITY.trailAlpha;
        for (let i = 1; i <= 2; i++) {
          const back = y - i * 0.5;
          if (back < BOARD_BUFFER_HEIGHT) continue;
          drawBlock(
            ctx,
            px,
            (back - BOARD_BUFFER_HEIGHT) * GRID.cellPitch,
            GRID.cellBody,
            MINO_COLORS[cell.color],
            { alpha: strength / i },
          );
        }
      }

      if (y < BOARD_BUFFER_HEIGHT) continue;
      this.drawCell(ctx, px, (y - BOARD_BUFFER_HEIGHT) * GRID.cellPitch, cell, 'L1');
    }
  }

  /** スカッシュ対象セルの索引。対象がなければ null */
  private getSquashKeys(state: GameState): Set<number> | null {
    const squash = this.squash;
    if (squash === null || state.clearing !== null) return null;

    const keys = new Set<number>();
    for (const [x, y] of squash.cells) {
      if (y < BOARD_BUFFER_HEIGHT) continue;
      keys.add(y * BOARD_WIDTH + x);
    }
    return keys.size > 0 ? keys : null;
  }

  /**
   * 着地スカッシュ。デザイン仕様 04-B:
   *   scaleY .70 / scaleX 1.20 → 1.10 → 1.00、計260ms。
   * ミノ全体の底面中央を原点にして潰すことで、床に叩きつけた感じを出す。
   */
  private drawSquash(ctx: CanvasRenderingContext2D, state: GameState): void {
    const squash = this.squash;
    if (squash === null || state.clearing !== null) return;

    const t = clamp01(1 - squash.life / squash.maxLife);

    // T-Spin は「一瞬だけ縮む」ので、伸び返しのない単純な山にする
    if (squash.depth !== undefined) {
      const dip = Math.sin(t * Math.PI);
      const s = 1 - (1 - squash.depth) * dip;
      this.drawSquashCells(ctx, state, squash, s, s);
      return;
    }

    const power = squash.strong ? 1 : 0.45;

    // 3段階の折れ線で「潰れ → 伸び → 戻り」を作る
    let scaleY: number;
    let scaleX: number;
    if (t < 0.32) {
      const k = t / 0.32;
      scaleY = 1 - (1 - HARD_DROP.squashY) * k * power;
      scaleX = 1 + (HARD_DROP.squashX - 1) * k * power;
    } else if (t < 0.68) {
      const k = (t - 0.32) / 0.36;
      scaleY = HARD_DROP.squashY + (1.1 - HARD_DROP.squashY) * k;
      scaleY = 1 - (1 - scaleY) * power;
      scaleX = HARD_DROP.squashX + (0.94 - HARD_DROP.squashX) * k;
      scaleX = 1 + (scaleX - 1) * power;
    } else {
      const k = (t - 0.68) / 0.32;
      scaleY = 1 + (1.1 - 1) * (1 - k) * power;
      scaleX = 1 + (0.94 - 1) * (1 - k) * power;
    }

    this.drawSquashCells(ctx, state, squash, scaleX, scaleY);
  }

  /** 潰したセル群を、底面中央を原点にして描く */
  private drawSquashCells(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    squash: Squash,
    scaleX: number,
    scaleY: number,
  ): void {
    let minX = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of squash.cells) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    const originX = ((minX + maxX + 1) / 2) * GRID.cellPitch;
    const originY = (maxY + 1 - BOARD_BUFFER_HEIGHT) * GRID.cellPitch;

    ctx.save();
    ctx.translate(originX, originY);
    ctx.scale(scaleX, scaleY);
    ctx.translate(-originX, -originY);

    for (const [x, y] of squash.cells) {
      if (y < BOARD_BUFFER_HEIGHT) continue;
      const cell = state.board[y]?.[x];
      if (cell == null) continue;
      this.drawCell(
        ctx,
        x * GRID.cellPitch,
        (y - BOARD_BUFFER_HEIGHT) * GRID.cellPitch,
        cell,
        'L1',
      );
    }

    ctx.restore();
  }

  /** ハードドロップの落下軌跡。薄い残像を等間隔に置く */
  private drawTrails(ctx: CanvasRenderingContext2D): void {
    if (this.trails.length === 0) return;

    const STEPS = 4;
    for (const trail of this.trails) {
      const fade = clamp01(trail.life / trail.maxLife);
      const shape = getShape(trail.type, trail.rot);
      const color = MINO_COLORS[trail.type];

      for (let i = 1; i <= STEPS; i++) {
        const k = i / (STEPS + 1);
        const y = trail.fromY + (trail.toY - trail.fromY) * k;
        // 手前（着地側）ほど濃く残す
        const alpha = fade * 0.32 * k;

        for (const [dx, dy] of shape) {
          const cy = y + dy;
          if (cy < BOARD_BUFFER_HEIGHT) continue;
          drawBlock(
            ctx,
            (trail.x + dx) * GRID.cellPitch,
            (cy - BOARD_BUFFER_HEIGHT) * GRID.cellPitch,
            GRID.cellBody,
            color,
            { alpha },
          );
        }
      }
    }
  }

  private drawGhost(ctx: CanvasRenderingContext2D, state: GameState): void {
    const piece = state.active;
    if (piece === null || state.clearing !== null) return;

    const ghostY = getGhostY(state);
    if (ghostY === null || ghostY === piece.y) return;

    for (const [dx, dy] of getShape(piece.type, piece.rot)) {
      const gy = ghostY + dy;
      if (gy < BOARD_BUFFER_HEIGHT) continue;
      drawGhostBlock(
        ctx,
        (piece.x + dx) * GRID.cellPitch,
        (gy - BOARD_BUFFER_HEIGHT) * GRID.cellPitch,
        GRID.cellBody,
      );
    }
  }

  private drawActive(ctx: CanvasRenderingContext2D, state: GameState): void {
    const piece = state.active;
    if (piece === null) return;

    getShape(piece.type, piece.rot).forEach(([dx, dy], index) => {
      const by = piece.y + dy;
      if (by < BOARD_BUFFER_HEIGHT) return;
      const px = (piece.x + dx) * GRID.cellPitch;
      const py = (by - BOARD_BUFFER_HEIGHT) * GRID.cellPitch;

      const isEvent = index === piece.eventCellIndex && piece.eventKind !== null;
      if (isEvent && piece.eventKind !== null && this.quality.getProfile().eventGlow) {
        drawEventTile(ctx, px, py, GRID.cellBody, piece.eventKind, 'L2', this.elapsedMs);
      } else {
        drawBlock(ctx, px, py, GRID.cellBody, MINO_COLORS[piece.type]);
      }
    });
  }

  private drawShockwaves(ctx: CanvasRenderingContext2D): void {
    for (const wave of this.shockwaves) {
      const t = 1 - wave.life / wave.maxLife;
      const py = (wave.y - BOARD_BUFFER_HEIGHT) * GRID.cellPitch + GRID.cellBody / 2;
      const width = BOARD_PX_WIDTH * t;
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.fillStyle = wave.color;
      ctx.fillRect((BOARD_PX_WIDTH - width) / 2, py - 1, width, 3);
      ctx.globalAlpha = 1;
    }
  }

  /**
   * 着弾待ちのおじゃま警告。盤面の右端に縦ゲージを出す。
   * 行数ぶんの目盛りを積み、着弾が近づくほど速く明滅させる。
   */
  private drawGarbageWarning(ctx: CanvasRenderingContext2D): void {
    // 着弾直後は床から突き上げる赤い光を出す
    if (this.garbageImpactMs > 0) {
      const t = clamp01(this.garbageImpactMs / GARBAGE_IMPACT_MS);
      const gradient = ctx.createLinearGradient(0, BOARD_PX_HEIGHT, 0, BOARD_PX_HEIGHT * 0.4);
      gradient.addColorStop(0, withAlpha('#ff2f2f', 0.6 * t * this.quality.getProfile().flashScale));
      gradient.addColorStop(1, withAlpha('#ff2f2f', 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, BOARD_PX_WIDTH, BOARD_PX_HEIGHT);
    }

    if (this.pendingGarbage <= 0) return;

    const width = 6;
    const x = BOARD_PX_WIDTH - width;
    const flash = this.quality.getProfile().flashScale;

    // 切迫度が上がるほど点滅が速くなる
    const blinkMs = 420 - this.pendingUrgency * 300;
    const blink = Math.sin((this.elapsedMs / blinkMs) * Math.PI * 2) * 0.5 + 0.5;
    const alpha = (0.45 + blink * 0.55) * Math.max(0.35, flash);

    ctx.save();
    for (let i = 0; i < this.pendingGarbage; i++) {
      const y = BOARD_PX_HEIGHT - (i + 1) * GRID.cellPitch + 2;
      if (y < 0) break;
      ctx.globalAlpha = alpha;
      // 上に積まれた分ほど危険色へ寄せる
      ctx.fillStyle = i >= 6 ? '#ff2f2f' : i >= 3 ? NEON.magenta : NEON.yellow;
      ctx.fillRect(x, y, width, GRID.cellBody - 2);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // 着弾直前は盤面の下側全体を赤く染める
    if (this.pendingUrgency > 0.6) {
      const heat = (this.pendingUrgency - 0.6) / 0.4;
      const gradient = ctx.createLinearGradient(0, BOARD_PX_HEIGHT, 0, BOARD_PX_HEIGHT * 0.55);
      gradient.addColorStop(0, withAlpha('#ff2f2f', 0.35 * heat * blink * flash));
      gradient.addColorStop(1, withAlpha('#ff2f2f', 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, BOARD_PX_WIDTH, BOARD_PX_HEIGHT);
    }
  }

  private drawFlashes(ctx: CanvasRenderingContext2D): void {
    for (const flash of this.flashes) {
      const t = flash.life / flash.maxLife;
      const gradient = ctx.createRadialGradient(
        BOARD_PX_WIDTH * flash.originX,
        BOARD_PX_HEIGHT * 0.7,
        0,
        BOARD_PX_WIDTH * flash.originX,
        BOARD_PX_HEIGHT * 0.7,
        BOARD_PX_HEIGHT,
      );
      gradient.addColorStop(0, withAlpha(flash.color, flash.peak * t));
      gradient.addColorStop(1, withAlpha(flash.color, 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, BOARD_PX_WIDTH, BOARD_PX_HEIGHT);
    }
  }

  // ------------------------------------------------------------ パーティクル

  private emitBurst(
    cellX: number,
    cellY: number,
    count: number,
    color: string,
    speed: number,
  ): void {
    const x = cellX * GRID.cellPitch;
    const y = (cellY - BOARD_BUFFER_HEIGHT) * GRID.cellPitch;

    for (let i = 0; i < count; i++) {
      const p = this.pool.acquire();
      if (p === null) return;
      const angle = (Math.PI * 2 * i) / count;
      const velocity = speed * (0.5 + Math.random());
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * velocity;
      p.vy = Math.sin(angle) * velocity;
      p.maxLife = 420;
      p.life = p.maxLife;
      p.size = GRID.cellBody * 0.16;
      p.color = color;
      p.gravity = 0.0008;
      p.drag = 0.999;
      p.rotation = 0;
      p.spin = 0.008;
      p.shape = 'square';
    }
  }

  /** B: ハードドロップ着地の破片 5〜9個。420ms ease-out で放射し重力で落ちる */
  /**
   * ミノが占める各列について、いちばん下のセルの盤面座標を返す。
   * 着地エフェクトを「実際に接地した面」から出すために使う。
   */
  private getBottomCells(
    type: MinoType,
    rot: Rotation,
    x: number,
    y: number,
  ): { cx: number; cy: number }[] {
    const lowest = new Map<number, number>();
    for (const [dx, dy] of getShape(type, rot)) {
      const cx = x + dx;
      const cy = y + dy;
      const current = lowest.get(cx);
      if (current === undefined || cy > current) lowest.set(cx, cy);
    }
    return [...lowest.entries()].map(([cx, cy]) => ({ cx, cy }));
  }

  /**
   * ハードドロップ着地の破片。
   * 盤面の最下段ではなく、実際にミノが接地した各列の底面から飛ばす。
   */
  private emitHardDropDebris(
    type: MinoType,
    rot: Rotation,
    x: number,
    landedY: number,
    tier: ReturnType<QualityManager['getTier']>,
  ): void {
    const scale = getEffectScale('hardDropDebris', tier);
    if (scale.count === 0) return;

    const bottoms = this.getBottomCells(type, rot, x, landedY);
    const perColumn = Math.max(1, Math.round(scale.count / bottoms.length));

    for (const { cx, cy } of bottoms) {
      this.emitImpactAt(cx, cy, perColumn, scale.life);
    }
  }

  /** 指定セルの底面から上方向へ火花を飛ばす */
  private emitImpactAt(cellX: number, cellY: number, count: number, life: number): void {
    const x = cellX * GRID.cellPitch + GRID.cellBody / 2;
    const y = (cellY + 1 - BOARD_BUFFER_HEIGHT) * GRID.cellPitch;

    for (let i = 0; i < count; i++) {
      const p = this.pool.acquire();
      if (p === null) return;
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const velocity = 0.2 + Math.random() * 0.35;
      p.x = x + (Math.random() - 0.5) * GRID.cellPitch;
      p.y = y;
      p.vx = Math.cos(angle) * velocity;
      p.vy = Math.sin(angle) * velocity;
      p.maxLife = HARD_DROP.debrisMs * life;
      p.life = p.maxLife;
      p.size = GRID.cellBody * 0.14;
      p.color = this.feverActive && i % 2 === 0 ? this.getDiscoColor(i) : NEON.cyan;
      p.gravity = 0.0018;
      p.drag = 0.998;
      p.rotation = 0;
      p.spin = 0.006;
      p.shape = 'spark';
    }
  }

  /**
   * 設置時のスプラッシュ。ミノの底面から横に大きく弾けさせる。
   * フィーバー中は数を増やし、虹色で散らす。
   */
  private emitLockSplash(
    type: MinoType,
    rot: Rotation,
    x: number,
    y: number,
    hard: boolean,
    tier: ReturnType<QualityManager['getTier']>,
  ): void {
    const scale = getEffectScale('lockSplash', tier);
    if (scale.count === 0) return;

    const bottoms = this.getBottomCells(type, rot, x, y);
    const boost = (hard ? 1.6 : 1) * (this.feverActive ? 1.8 : 1);
    const perColumn = Math.max(2, Math.round((scale.count / bottoms.length) * boost));
    const baseColor = MINO_COLORS[type];

    for (const { cx, cy } of bottoms) {
      const px = cx * GRID.cellPitch + GRID.cellBody / 2;
      const py = (cy + 1 - BOARD_BUFFER_HEIGHT) * GRID.cellPitch;

      for (let i = 0; i < perColumn; i++) {
        const p = this.pool.acquire();
        if (p === null) return;

        // 横方向に強く、上へ軽く。水しぶきのような広がりにする
        const spread = (i / perColumn) * 2 - 1;
        const velocity = (0.18 + Math.random() * 0.4) * boost;
        p.x = px;
        p.y = py;
        p.vx = spread * velocity;
        p.vy = -Math.abs(velocity) * (0.35 + Math.random() * 0.5);
        p.maxLife = (300 + Math.random() * 320) * scale.life;
        p.life = p.maxLife;
        p.size = GRID.cellBody * (0.1 + Math.random() * 0.18);
        p.color = this.feverActive ? this.getDiscoColor(i + cx) : baseColor;
        p.gravity = 0.0017;
        p.drag = 0.9975;
        p.rotation = Math.random() * Math.PI;
        p.spin = (Math.random() - 0.5) * 0.03;
        p.shape = 'square';
      }
    }
  }

  /**
   * おじゃま着弾。下から突き上げられたように、床沿いから上向きに火花を散らす。
   * 穴の位置だけは色を変えて、どこが空いているか一目で分かるようにする。
   */
  private emitGarbageImpact(
    lines: number,
    holeColumn: number,
    tier: ReturnType<QualityManager['getTier']>,
  ): void {
    const scale = getEffectScale('lockSplash', tier);
    if (scale.count === 0) return;

    const perColumn = Math.max(2, Math.round(scale.count * 0.4));
    const y = BOARD_PX_HEIGHT - lines * GRID.cellPitch;

    for (let x = 0; x < BOARD_WIDTH; x++) {
      const isHole = x === holeColumn;
      const px = x * GRID.cellPitch + GRID.cellBody / 2;

      for (let i = 0; i < (isHole ? perColumn : Math.ceil(perColumn / 2)); i++) {
        const p = this.pool.acquire();
        if (p === null) return;
        p.x = px + (Math.random() - 0.5) * GRID.cellBody;
        p.y = y + Math.random() * GRID.cellPitch;
        p.vx = (Math.random() - 0.5) * 0.16;
        p.vy = -(0.18 + Math.random() * 0.3);
        p.maxLife = 380 * scale.life;
        p.life = p.maxLife;
        p.size = GRID.cellBody * (0.1 + Math.random() * 0.14);
        // 穴だけシアンにして退路を示す
        p.color = isHole ? NEON.cyan : '#ff2f2f';
        p.gravity = 0.0014;
        p.drag = 0.998;
        p.rotation = 0;
        p.spin = 0.01;
        p.shape = 'square';
      }
    }
  }

  /** A: ライン消去。ポップに合わせて左→右へ順に破片が出る */
  private emitLineClearDebris(
    rows: readonly number[],
    tier: ReturnType<QualityManager['getTier']>,
  ): void {
    const scale = getEffectScale('lineClear', tier);
    if (scale.count === 0) return;

    for (const row of rows) {
      for (let x = 0; x < BOARD_WIDTH; x++) {
        for (let i = 0; i < scale.count; i++) {
          const p = this.pool.acquire();
          if (p === null) return;
          p.x = x * GRID.cellPitch + GRID.cellBody / 2;
          p.y = (row - BOARD_BUFFER_HEIGHT) * GRID.cellPitch + GRID.cellBody / 2;
          const angle = Math.random() * Math.PI * 2;
          const velocity = 0.08 + Math.random() * 0.22;
          p.vx = Math.cos(angle) * velocity;
          p.vy = Math.sin(angle) * velocity;
          // 列ごとの遅延を寿命の差で表現する
          p.maxLife = 380 * scale.life;
          p.life = p.maxLife + x * LINE_CLEAR_COLUMN_DELAY_MS;
          p.size = GRID.cellBody * 0.16;
          p.color = i % 2 === 0 ? '#ffffff' : NEON.cyan;
          p.gravity = 0.001;
          p.drag = 0.998;
          p.rotation = 0;
          p.spin = 0.01;
          p.shape = 'square';
        }
      }
    }
  }

  /** C: 爆弾。左下端から列26ms・行14msで右上へ波及し、回転しながら飛散する */
  private emitBombScatter(
    rows: readonly number[],
    tier: ReturnType<QualityManager['getTier']>,
  ): void {
    const scale = getEffectScale('bomb', tier);
    if (scale.count === 0) return;

    const spin = (BOMB.scatterSpinDeg * Math.PI) / 180 / BOMB.scatterMs;

    rows.forEach((row, rowIndex) => {
      for (let x = 0; x < BOARD_WIDTH; x++) {
        const delay = x * BOMB.columnDelayMs + rowIndex * BOMB.rowDelayMs;
        for (let i = 0; i < scale.count; i++) {
          const p = this.pool.acquire();
          if (p === null) return;
          p.x = x * GRID.cellPitch + GRID.cellBody / 2;
          p.y = (row - BOARD_BUFFER_HEIGHT) * GRID.cellPitch + GRID.cellBody / 2;
          const angle = Math.random() * Math.PI * 2;
          const velocity = 0.12 + Math.random() * 0.5;
          p.vx = Math.cos(angle) * velocity;
          p.vy = Math.sin(angle) * velocity - 0.15;
          p.maxLife = BOMB.scatterMs * scale.life;
          p.life = p.maxLife + delay;
          p.size = GRID.cellBody * (0.12 + Math.random() * 0.2);
          p.color = i % 2 === 0 ? NEON.yellow : NEON.magenta;
          p.gravity = 0.0016;
          p.drag = 0.9985;
          p.rotation = 0;
          p.spin = spin;
          p.shape = 'square';
        }
      }
    });
  }
}

/** T-Spin の段階。SINGLE→DOUBLE→TRIPLE で枠色を昇格させる */
function tspinTier(clearType: string): number {
  if (clearType === 'tspin-triple') return 2;
  if (clearType === 'tspin-double') return 1;
  return 0;
}

/** 重力落下のイージングを外部から使うためのヘルパー */
export function gravityEase(t: number): number {
  return cubicBezier(EASING.gravity, t);
}
