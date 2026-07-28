/**
 * キーバインド定義と永続化。出典は docs/design/design-screens.html（3e CONFIG / KEYBIND）。
 * 物理キー（KeyboardEvent.code）で保持するため、キーボードレイアウトに依存しない。
 */

export type GameAction =
  | 'moveLeft'
  | 'moveRight'
  | 'rotateCw'
  | 'rotateCcw'
  | 'softDrop'
  | 'hardDrop'
  | 'hold'
  | 'triggerStack'
  | 'discardStack'
  | 'pause';

export type Keybinds = Record<GameAction, string[]>;

/** マウスの割当。デザイン案では左クリック・ホイール・右クリックにも操作が乗る */
export type MouseAction = 'hardDrop' | 'hold' | 'triggerStack' | 'none';

export type MouseBinds = {
  leftClick: MouseAction;
  rightClick: MouseAction;
  wheel: MouseAction;
};

export const ACTION_LABELS: Record<GameAction, string> = {
  moveLeft: '左移動',
  moveRight: '右移動',
  rotateCw: '回転（右）',
  rotateCcw: '回転（左）',
  softDrop: 'ソフトドロップ',
  hardDrop: 'ハードドロップ',
  hold: 'ホールド',
  triggerStack: 'イベントスタック発動',
  discardStack: 'カレントスタック破棄',
  pause: 'ポーズ',
};

export const DEFAULT_KEYBINDS: Keybinds = {
  moveLeft: ['KeyA', 'ArrowLeft'],
  moveRight: ['KeyD', 'ArrowRight'],
  rotateCw: ['KeyW'],
  rotateCcw: ['KeyS'],
  softDrop: ['ArrowDown'],
  hardDrop: ['Space'],
  hold: ['ShiftLeft'],
  triggerStack: ['KeyE'],
  discardStack: ['KeyQ'],
  pause: ['Escape'],
};

export const DEFAULT_MOUSE_BINDS: MouseBinds = {
  leftClick: 'hardDrop',
  rightClick: 'triggerStack',
  wheel: 'hold',
};

const KEY_STORAGE = 'dopatetris.keybinds';
const MOUSE_STORAGE = 'dopatetris.mousebinds';

export function loadKeybinds(): Keybinds {
  try {
    const raw = localStorage.getItem(KEY_STORAGE);
    if (raw === null) return { ...DEFAULT_KEYBINDS };
    return { ...DEFAULT_KEYBINDS, ...(JSON.parse(raw) as Partial<Keybinds>) };
  } catch {
    return { ...DEFAULT_KEYBINDS };
  }
}

export function saveKeybinds(binds: Keybinds): void {
  try {
    localStorage.setItem(KEY_STORAGE, JSON.stringify(binds));
  } catch {
    // 保存に失敗してもゲームは続行する
  }
}

export function loadMouseBinds(): MouseBinds {
  try {
    const raw = localStorage.getItem(MOUSE_STORAGE);
    if (raw === null) return { ...DEFAULT_MOUSE_BINDS };
    return { ...DEFAULT_MOUSE_BINDS, ...(JSON.parse(raw) as Partial<MouseBinds>) };
  } catch {
    return { ...DEFAULT_MOUSE_BINDS };
  }
}

export function saveMouseBinds(binds: MouseBinds): void {
  try {
    localStorage.setItem(MOUSE_STORAGE, JSON.stringify(binds));
  } catch {
    // 保存に失敗してもゲームは続行する
  }
}

/** 押されたキーコードから対応するアクションを引く逆引き表 */
export function buildLookup(binds: Keybinds): Map<string, GameAction> {
  const lookup = new Map<string, GameAction>();
  for (const [action, codes] of Object.entries(binds) as [GameAction, string[]][]) {
    for (const code of codes) lookup.set(code, action);
  }
  return lookup;
}

/** 表示用のキー名。KEY LOG とコンフィグ画面で使う */
export function formatKey(code: string): string {
  const map: Record<string, string> = {
    ArrowLeft: '←',
    ArrowRight: '→',
    ArrowUp: '↑',
    ArrowDown: '↓',
    Space: 'SPC',
    ShiftLeft: 'SHIFT',
    ShiftRight: 'SHIFT',
    Escape: 'ESC',
    Enter: 'ENTER',
  };
  return map[code] ?? code.replace(/^Key/, '').replace(/^Digit/, '');
}

export const MOUSE_LABELS: Record<MouseAction, string> = {
  hardDrop: 'DROP',
  hold: 'HOLD',
  triggerStack: 'STACK',
  none: '未設定',
};
