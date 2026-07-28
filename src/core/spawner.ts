/**
 * 7-bag によるミノ生成と、イベントタイルの埋め込み。
 *
 * 1つの bag（7個）につき EVENT_TILES_PER_BAG 個のミノにイベントタイルが1つ埋め込まれる。
 * 種別は4種から均等抽選、埋め込み位置はミノを構成する4セルから均等抽選。
 */
import { EVENT_TILES_PER_BAG } from './config/balance';
import { getSpawnPosition } from './pieces';
import { nextInt, shuffle } from './rng';
import { EVENT_KINDS, MINO_TYPES } from './types';
import type { ActivePiece, BagState, EventKind, MinoType, RngState } from './types';

/** 新しい bag を生成する */
export function refillBag(rng: RngState): { rng: RngState; bag: BagState } {
  const shuffled = shuffle(rng, MINO_TYPES);
  let state = shuffled.state;

  // 重複しない添字を EVENT_TILES_PER_BAG 個選ぶ
  const slots: number[] = [];
  const candidates = shuffle(state, [0, 1, 2, 3, 4, 5, 6]);
  state = candidates.state;
  for (let i = 0; i < EVENT_TILES_PER_BAG; i++) {
    const slot = candidates.value[i];
    if (slot !== undefined) slots.push(slot);
  }

  return {
    rng: state,
    bag: { queue: shuffled.value, eventSlots: slots.sort((a, b) => a - b), index: 0 },
  };
}

/**
 * キューの先頭を取り出す。bag が尽きたら自動で補充する。
 * 取り出したミノがイベント枠に該当するかどうかも返す。
 */
export function drawNext(
  rng: RngState,
  bag: BagState,
): { rng: RngState; bag: BagState; type: MinoType; hasEvent: boolean } {
  let state = rng;
  let current = bag;

  if (current.index >= current.queue.length) {
    const refilled = refillBag(state);
    state = refilled.rng;
    current = refilled.bag;
  }

  const type = current.queue[current.index];
  if (type === undefined) {
    // 補充直後は必ず要素が存在するため到達しない。型の網羅のためのフォールバック。
    const refilled = refillBag(state);
    const fallback = refilled.bag.queue[0] ?? 'T';
    return {
      rng: refilled.rng,
      bag: { ...refilled.bag, index: 1 },
      type: fallback,
      hasEvent: refilled.bag.eventSlots.includes(0),
    };
  }

  const hasEvent = current.eventSlots.includes(current.index);
  return {
    rng: state,
    bag: { ...current, index: current.index + 1 },
    type,
    hasEvent,
  };
}

/** ミノを盤面上部に出現させる。イベント付きなら種別と埋め込み位置を抽選する */
export function spawnPiece(
  rng: RngState,
  type: MinoType,
  hasEvent: boolean,
): { rng: RngState; piece: ActivePiece } {
  const spawn = getSpawnPosition(type);

  if (!hasEvent) {
    return {
      rng,
      piece: { type, rot: 0, x: spawn.x, y: spawn.y, eventCellIndex: null, eventKind: null },
    };
  }

  const kindPick = nextInt(rng, EVENT_KINDS.length);
  const cellPick = nextInt(kindPick.state, 4);
  const eventKind: EventKind = EVENT_KINDS[kindPick.value] ?? 'bomb';

  return {
    rng: cellPick.state,
    piece: {
      type,
      rot: 0,
      x: spawn.x,
      y: spawn.y,
      eventCellIndex: cellPick.value,
      eventKind,
    },
  };
}
