/**
 * localStorage への永続化。外部通信は一切行わない。
 * 読み出しは必ず失敗を吸収し、壊れた値が入っていてもゲームが起動できるようにする。
 */
import type { EventKind } from '@core/types';
import { DEFAULT_EFFECT_SETTINGS } from '@render/quality/qualityProfiles';
import type { EffectSettings } from '@render/quality/qualityProfiles';

export type HighScore = {
  score: number;
  lines: number;
  level: number;
  maxCombo: number;
  /** ISO文字列 */
  date: string;
};

const HIGHSCORE_KEY = 'dopatetris.highscores';
const SETTINGS_KEY = 'dopatetris.settings';
const WARNED_KEY = 'dopatetris.photosensitiveWarned';
const MOUSE_FOLLOW_KEY = 'dopatetris.mouseFollow';

const HIGHSCORE_LIMIT = 10;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 保存に失敗してもゲームは続行する
  }
}

// ---------------------------------------------------------------- ハイスコア

export function loadHighScores(): HighScore[] {
  const scores = read<HighScore[]>(HIGHSCORE_KEY, []);
  return Array.isArray(scores) ? scores.slice(0, HIGHSCORE_LIMIT) : [];
}

/**
 * スコアを登録し、更新後の一覧と順位を返す。
 * ランク外だった場合 rank は null。
 */
export function submitHighScore(entry: HighScore): { scores: HighScore[]; rank: number | null } {
  const scores = [...loadHighScores(), entry]
    .sort((a, b) => b.score - a.score)
    .slice(0, HIGHSCORE_LIMIT);

  write(HIGHSCORE_KEY, scores);

  const index = scores.findIndex((s) => s.date === entry.date && s.score === entry.score);
  return { scores, rank: index >= 0 ? index + 1 : null };
}

export function getBestScore(): HighScore | null {
  return loadHighScores()[0] ?? null;
}

// ---------------------------------------------------------------- 設定

export type Settings = EffectSettings & {
  /** マウス追従で横位置を決めるか */
  mouseFollow: boolean;
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  muted: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  ...DEFAULT_EFFECT_SETTINGS,
  mouseFollow: true,
  masterVolume: 0.7,
  sfxVolume: 1,
  musicVolume: 0.6,
  muted: false,
};

export function loadSettings(): Settings {
  const stored = read<Partial<Settings>>(SETTINGS_KEY, {});
  const merged = { ...DEFAULT_SETTINGS, ...stored };

  // 壊れた値が入っていても破綻しないように丸める
  return {
    ...merged,
    shakeScale: clamp(merged.shakeScale, 0, 1.5),
    particleScale: clamp(merged.particleScale, 0, 1),
    flashScale: clamp(merged.flashScale, 0, 1),
    mouseSmoothing: clamp(merged.mouseSmoothing, 0.05, 1),
    masterVolume: clamp(merged.masterVolume, 0, 1),
    sfxVolume: clamp(merged.sfxVolume, 0, 1),
    musicVolume: clamp(merged.musicVolume, 0, 1),
  };
}

export function saveSettings(settings: Settings): void {
  write(SETTINGS_KEY, settings);
  // マウス追従だけは入力層が単独で参照するため別キーにも持たせる
  write(MOUSE_FOLLOW_KEY, settings.mouseFollow);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

// ---------------------------------------------------------------- 初回警告

export function hasSeenPhotosensitiveWarning(): boolean {
  return read<boolean>(WARNED_KEY, false) === true;
}

export function markPhotosensitiveWarningSeen(): void {
  write(WARNED_KEY, true);
}

// ---------------------------------------------------------------- リザルト用

export type RunResult = {
  score: number;
  lines: number;
  level: number;
  maxCombo: number;
  feverTotalMs: number;
  eventUsed: Record<EventKind, number>;
  breakdown: { lines: number; combo: number; fever: number; event: number };
  rank: number | null;
  isBest: boolean;
};
