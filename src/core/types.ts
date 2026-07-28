/**
 * コアの型定義。
 * このファイル及び core/ 配下は DOM / Web Audio / Math.random / Date.now に依存しない。
 */

export type MinoType = 'I' | 'J' | 'L' | 'O' | 'S' | 'T' | 'Z';

export const MINO_TYPES: readonly MinoType[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

/** 回転状態。0 = スポーン、1 = 右回転1回、2 = 180度、3 = 左回転1回 */
export type Rotation = 0 | 1 | 2 | 3;

/** イベントスタックの種別 */
export type EventKind = 'bomb' | 'heart' | 'coin' | 'clover';

export const EVENT_KINDS: readonly EventKind[] = ['bomb', 'heart', 'coin', 'clover'];

/** 盤面のセル。null は空。 */
export type Cell = {
  readonly color: MinoType;
  readonly event: EventKind | null;
  /**
   * 対戦で相手から送られてきたおじゃまブロックか。
   * 見た目を変えるためだけの印で、ゲームルール上は通常のブロックと同じ。
   */
  readonly garbage?: boolean;
} | null;

export type Board = Cell[][];

/** 落下中のミノ */
export type ActivePiece = {
  type: MinoType;
  rot: Rotation;
  /** ミノのバウンディングボックス左上の盤面座標 */
  x: number;
  y: number;
  /**
   * イベントタイルが埋め込まれているセルの添字（0-3、getCells() の並び順に対応）。
   * null ならイベントなし。
   */
  eventCellIndex: number | null;
  eventKind: EventKind | null;
};

/** カレントイベントスタック */
export type EventStack = {
  /** カレント種別。null = 未ロック */
  kind: EventKind | null;
  /** 蓄積数 0-4 */
  count: number;
  /** このミリ秒（ゲーム内経過時間）までクールタイム中 */
  cooldownUntil: number;
};

/** フィーバータイム状態 */
export type FeverState = {
  /** このミリ秒まで継続。0 なら非フィーバー */
  until: number;
  /** フィーバー中に適用されるコンボ係数（0.15 / 0.20 / 0.25） */
  comboRate: number;
};

/** 落下速度低下（コイン効果） */
export type SlowState = {
  until: number;
  /** 低下率 0.10 / 0.15 / 0.20 */
  rate: number;
};

export type GameStatus = 'ready' | 'playing' | 'paused' | 'over';

/**
 * リザルト画面で見せる集計。
 * breakdown の4項目の合計は score と一致する。
 */
export type GameStats = {
  maxCombo: number;
  /** フィーバー状態だった累計時間 */
  feverTotalMs: number;
  /** 発動したイベントの回数 */
  eventUsed: Record<EventKind, number>;
  breakdown: {
    /** ライン消去の素点＋ドロップ点 */
    lines: number;
    /** コンボ倍率による増分 */
    combo: number;
    /** フィーバー倍率による増分 */
    fever: number;
    /** 爆弾の列削除ボーナス＋異種イベントのボーナス */
    event: number;
  };
};

/** Next キューの1要素。イベントタイルの有無をプレビュー表示に使う */
export type QueuedMino = {
  readonly type: MinoType;
  readonly hasEvent: boolean;
};

/**
 * 受信済みでまだ盤面に入っていないおじゃま。
 * 猶予のあいだに自分がラインを消せば相殺できる。
 */
export type PendingGarbage = {
  lines: number;
  /** この時刻（elapsedMs 基準）を過ぎたら盤面へ挿入する */
  readyAt: number;
  /** 穴の位置。全プレイヤーで一致させるため送信側が決める */
  holeColumn: number;
};

/** 重力で1マス以上落ちるブロックの移動 */
export type GravityMove = {
  x: number;
  fromY: number;
  toY: number;
};

/** 7-bag の状態 */
export type BagState = {
  queue: MinoType[];
  /** この bag でイベントタイルを付与するミノの添字（0-6） */
  eventSlots: number[];
  /** この bag で何個目まで配ったか */
  index: number;
};

export type GameState = {
  board: Board;
  active: ActivePiece | null;
  hold: MinoType | null;
  /** このミノで既にホールドを使った回数 */
  holdUsed: number;
  /** ホールド可能回数。ハート効果で 2 になる */
  holdCapacity: number;
  next: QueuedMino[];
  stack: EventStack;
  fever: FeverState;
  slow: SlowState;

  score: number;
  level: number;
  lines: number;
  combo: number;
  /** Back-to-Back（テトリス・T-Spin連続）フラグ */
  b2b: boolean;

  /** ゲーム開始からの経過ミリ秒。外部から deltaMs を加算して進める */
  elapsedMs: number;
  /** 次の自然落下までの残りミリ秒 */
  dropTimerMs: number;
  /** 接地してからのロックディレイ残りミリ秒。未接地なら null */
  lockTimerMs: number | null;
  /** ロックディレイのリセット回数 */
  lockResets: number;
  /**
   * ライン消去アニメーション中の状態。null なら通常進行。
   * この間はミノが存在せず、入力も落下も止まる。
   * 盤面はまだ消去前の状態を保持しており、演出の終了時にまとめて消される。
   */
  clearing: { rows: number[]; elapsedMs: number } | null;
  /**
   * 重力の落下演出中の状態。null なら通常進行。
   * clearing と同じく、盤面はまだ落下前を保持し、演出終了時にまとめて適用する。
   */
  gravity: { moves: readonly GravityMove[]; elapsedMs: number } | null;
  /** ソフトドロップ押下中か */
  softDropping: boolean;
  /** 直前の操作が回転だったか（T-Spin判定に使う） */
  lastMoveWasRotation: boolean;
  /** 直前の回転でキックが発生したか（T-Spin mini判定に使う） */
  lastRotationKicked: boolean;

  /**
   * 時間経過だけでもレベルが上がるか。対戦のサバイバル用。
   * ソロのエンドレスでは false のままで、従来どおりライン数だけで上がる。
   */
  timePressure: boolean;

  /** 相手から届き、まだ盤面に入っていないおじゃま行 */
  pendingGarbage: PendingGarbage[];

  rng: RngState;
  bag: BagState;

  stats: GameStats;
  status: GameStatus;
};

/** シード付きPRNGの状態（xorshift128+） */
export type RngState = {
  s0: number;
  s1: number;
  s2: number;
  s3: number;
};

/** ライン消去の種類 */
export type ClearType =
  | 'single'
  | 'double'
  | 'triple'
  | 'tetris'
  | 'tspin-mini'
  | 'tspin-single'
  | 'tspin-double'
  | 'tspin-triple';
