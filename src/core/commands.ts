/**
 * core への入力は、キーコードやマウス座標ではなく、この Command 列に正規化して渡す。
 * これにより core は入力デバイスから独立し、将来のネットワーク同期にも転用できる。
 */

export type Command =
  /** 指定した列へ移動する（マウス追従。x は盤面の列番号） */
  | { readonly kind: 'moveTo'; readonly column: number }
  /** 相対移動（キー操作） */
  | { readonly kind: 'move'; readonly dx: -1 | 1 }
  | { readonly kind: 'rotate'; readonly dir: 'cw' | 'ccw' }
  /** ソフトドロップの押下状態 */
  | { readonly kind: 'softDrop'; readonly active: boolean }
  | { readonly kind: 'hardDrop' }
  | { readonly kind: 'hold' }
  /** イベントスタック発動 */
  | { readonly kind: 'triggerStack' }
  /** イベントスタック破棄 */
  | { readonly kind: 'discardStack' };

export type CommandKind = Command['kind'];
