/**
 * キーボード・マウス入力を Command 列へ正規化する。
 * core にはキーコードやピクセル座標を渡さない。
 *
 * デザイン案（3c / 3e）に合わせ、マウスにも操作を割り当てる:
 *   移動 = カーソルX追従 / 左クリック = ハードドロップ / ホイール = ホールド / 右クリック = スタック発動
 */
import { ARR_MS, BOARD_WIDTH, DAS_MS } from '@core/config/balance';
import type { Command } from '@core/commands';
import { buildLookup, loadKeybinds, loadMouseBinds } from './keybinds';
import type { GameAction, Keybinds, MouseAction, MouseBinds } from './keybinds';

export type InputOptions = {
  /** マウス追従で横位置を決めるか */
  mouseFollow: boolean;
  /** 追従の滑らかさ 0〜1。大きいほど機敏に追従する */
  smoothing: number;
};

/** KEY LOG 表示用。直近に押されたキーを保持する */
export type KeyLogEntry = { code: string; at: number };

export class InputManager {
  private lookup: Map<string, GameAction>;
  private mouseBinds: MouseBinds;
  private readonly held = new Set<GameAction>();
  private readonly pressedThisFrame: GameAction[] = [];

  private dasTimer = 0;
  private arrTimer = 0;
  private lastDirection: -1 | 1 | 0 = 0;

  /** マウスが指している列（生値） */
  private rawColumn: number | null = null;
  /** 補間後の列。滑らかさ設定で追従の鈍さを変える */
  private smoothColumn: number | null = null;

  private options: InputOptions = { mouseFollow: true, smoothing: 0.35 };
  private pauseRequested = false;
  private target: HTMLElement | null = null;

  private playfieldOriginX = 0;
  private playfieldCell = 28;

  /** 直近のキー入力ログ（KEY LOG 表示用） */
  private readonly keyLog: KeyLogEntry[] = [];

  constructor(binds: Keybinds = loadKeybinds(), mouse: MouseBinds = loadMouseBinds()) {
    this.lookup = buildLookup(binds);
    this.mouseBinds = mouse;
  }

  setKeybinds(binds: Keybinds): void {
    this.lookup = buildLookup(binds);
    this.held.clear();
  }

  setMouseBinds(binds: MouseBinds): void {
    this.mouseBinds = binds;
  }

  setOptions(options: Partial<InputOptions>): void {
    this.options = { ...this.options, ...options };
  }

  attach(target: HTMLElement): void {
    this.target = target;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    target.addEventListener('mousemove', this.onMouseMove);
    target.addEventListener('mousedown', this.onMouseDown);
    target.addEventListener('wheel', this.onWheel, { passive: false });
    target.addEventListener('contextmenu', this.onContextMenu);
  }

  detach(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    const target = this.target;
    if (target !== null) {
      target.removeEventListener('mousemove', this.onMouseMove);
      target.removeEventListener('mousedown', this.onMouseDown);
      target.removeEventListener('wheel', this.onWheel);
      target.removeEventListener('contextmenu', this.onContextMenu);
    }
    this.target = null;
    this.held.clear();
  }

  /** 盤面の画面上の位置を伝える。マウス列の算出に使う */
  setPlayfieldRect(originX: number, cellSize: number): void {
    this.playfieldOriginX = originX;
    this.playfieldCell = cellSize;
  }

  consumePauseRequest(): boolean {
    if (!this.pauseRequested) return false;
    this.pauseRequested = false;
    return true;
  }

  /** 直近 1.2 秒のキーログを返す */
  getKeyLog(now: number): KeyLogEntry[] {
    return this.keyLog.filter((entry) => now - entry.at < 1200);
  }

  /** このフレームぶんの Command 列を生成する */
  update(deltaMs: number): Command[] {
    const commands: Command[] = [];

    for (const action of this.pressedThisFrame) {
      const command = toCommand(action);
      if (command !== null) commands.push(command);
    }
    this.pressedThisFrame.length = 0;

    // 横移動。キー入力はマウス追従より優先する
    const left = this.held.has('moveLeft');
    const right = this.held.has('moveRight');
    const direction: -1 | 1 | 0 = left && !right ? -1 : right && !left ? 1 : 0;

    if (direction !== 0) {
      if (direction !== this.lastDirection) {
        commands.push({ kind: 'move', dx: direction });
        this.dasTimer = 0;
        this.arrTimer = 0;
        this.lastDirection = direction;
      } else {
        this.dasTimer += deltaMs;
        if (this.dasTimer >= DAS_MS) {
          this.arrTimer += deltaMs;
          while (this.arrTimer >= ARR_MS) {
            commands.push({ kind: 'move', dx: direction });
            this.arrTimer -= ARR_MS;
          }
        }
      }
      // キー操作に切り替わったらマウスの補間位置をリセットする
      this.smoothColumn = null;
    } else {
      this.lastDirection = 0;
      this.dasTimer = 0;
      this.arrTimer = 0;

      if (this.options.mouseFollow && this.rawColumn !== null) {
        const target = this.rawColumn;
        if (this.smoothColumn === null) {
          this.smoothColumn = target;
        } else {
          // smoothing 0 = 非常に鈍い / 1 = 即時追従
          const factor = Math.min(1, this.options.smoothing * (deltaMs / 16.67) * 1.2);
          this.smoothColumn += (target - this.smoothColumn) * factor;
        }
        commands.push({ kind: 'moveTo', column: Math.round(this.smoothColumn) });
      }
    }

    commands.push({ kind: 'softDrop', active: this.held.has('softDrop') });

    return commands;
  }

  // ------------------------------------------------------------ ハンドラ

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const action = this.lookup.get(event.code);
    if (action === undefined) return;

    event.preventDefault();
    if (!event.repeat) this.pushKeyLog(event.code);

    if (action === 'pause') {
      if (!event.repeat) this.pauseRequested = true;
      return;
    }

    if (!event.repeat && !this.held.has(action)) this.pressedThisFrame.push(action);
    this.held.add(action);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    const action = this.lookup.get(event.code);
    if (action === undefined) return;
    event.preventDefault();
    this.held.delete(action);
  };

  private readonly onBlur = (): void => {
    this.held.clear();
    this.lastDirection = 0;
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    const target = this.target;
    if (target === null) return;
    const rect = target.getBoundingClientRect();
    // 筐体が CSS scale されているため、実寸ではなく比率から論理座標を求める
    const scale = rect.width / target.offsetWidth;
    const local = (event.clientX - rect.left) / scale - this.playfieldOriginX;
    const column = Math.floor(local / this.playfieldCell);
    this.rawColumn = Math.max(0, Math.min(BOARD_WIDTH - 1, column));
  };

  private readonly onMouseDown = (event: MouseEvent): void => {
    const action =
      event.button === 0
        ? this.mouseBinds.leftClick
        : event.button === 2
          ? this.mouseBinds.rightClick
          : 'none';
    if (action === 'none') return;
    event.preventDefault();
    this.pressedThisFrame.push(action);
    this.pushKeyLog(event.button === 0 ? 'MOUSE-L' : 'MOUSE-R');
  };

  private readonly onWheel = (event: WheelEvent): void => {
    const action = this.mouseBinds.wheel;
    if (action === 'none') return;
    event.preventDefault();
    this.pressedThisFrame.push(action);
    this.pushKeyLog('WHEEL');
  };

  private readonly onContextMenu = (event: MouseEvent): void => {
    // 右クリックにスタック発動を割り当てているため、標準メニューは出さない
    if (this.mouseBinds.rightClick !== 'none') event.preventDefault();
  };

  private pushKeyLog(code: string): void {
    this.keyLog.push({ code, at: performance.now() });
    if (this.keyLog.length > 12) this.keyLog.shift();
  }
}

function toCommand(action: GameAction | MouseAction): Command | null {
  switch (action) {
    case 'rotateCw':
      return { kind: 'rotate', dir: 'cw' };
    case 'rotateCcw':
      return { kind: 'rotate', dir: 'ccw' };
    case 'hardDrop':
      return { kind: 'hardDrop' };
    case 'hold':
      return { kind: 'hold' };
    case 'triggerStack':
      return { kind: 'triggerStack' };
    case 'discardStack':
      return { kind: 'discardStack' };
    default:
      return null;
  }
}
