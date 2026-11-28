/**
 * Practice settings: one small store, persisted to localStorage.
 *
 * localStorage throws outright in private mode and when site data is blocked,
 * so every read and write is wrapped and the app falls back to defaults in
 * memory. Settings are a convenience; losing them must never stop the app from
 * rendering.
 *
 * Shared across screens through a module-level store rather than context,
 * because Settings and Tossup are siblings under the tab bar and a change to
 * words-per-minute has to reach the reader without a remount.
 */

import { useEffect, useState } from 'react';
import {
  CATEGORIES,
  DEFAULT_DIFFICULTIES,
  SUBCATEGORIES,
  type Category,
  type QuestionFilters,
} from '../types';
import { DEFAULT_STRICTNESS } from '../engine/judge';

const KEY = 'qbt.settings.v1';

/**
 * The visual skin. `classic` is the default and keeps the existing dark
 * neutral palette with no backdrop, so existing users see no change until
 * they pick a theme. Other ids anchor on a real public-domain painting.
 */
export type ThemeId =
  | 'classic'
  | 'art'
  | 'science'
  | 'literature'
  | 'mythology'
  | 'math';

export interface ThemeOption {
  id: ThemeId;
  label: string;
  /** Short description shown under the swatch. */
  caption: string;
}

/**
 * Ordered list of themes with their picker labels. The caption names the
 * painting so a viewer can trust which artwork a swatch stands for.
 */
export const THEMES: readonly ThemeOption[] = [
  { id: 'classic', label: 'Classic', caption: 'Default dark palette' },
  { id: 'art', label: 'Art', caption: 'Vermeer, The Art of Painting' },
  { id: 'science', label: 'Science', caption: 'Wright of Derby, Orrery' },
  { id: 'literature', label: 'Literature', caption: 'Fragonard, The Reader' },
  { id: 'mythology', label: 'Mythology', caption: 'Botticelli, Birth of Venus' },
  { id: 'math', label: 'Math', caption: "Byrne's Euclid (1847)" },
];

const THEME_IDS: readonly ThemeId[] = THEMES.map((t) => t.id);

function isTheme(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value);
}

export interface Settings {
  /** Words per minute the reader reveals at. */
  wpm: number;
  /** Seconds on the clock after a buzz. */
  postBuzzSeconds: number;
  /** Inclusive QB Reader difficulty band, 0-10. */
  minDifficulty: number;
  maxDifficulty: number;
  /** Empty means every category. */
  categories: Category[];
  /** Empty means every subcategory of the selected categories. */
  subcategories: string[];
  /** 1 lenient to 12 strict. 3-9 are an identical plateau upstream. */
  strictness: number;
  /** Visual skin. `classic` is the default and the fallback for unknown values. */
  theme: ThemeId;
  /** Voice mode: read questions aloud. */
  voiceRead: boolean;
  /** Voice mode: listen for a spoken answer after a buzz. */
  voiceAnswer: boolean;
  /** Show the backdrop your rank has unlocked instead of the theme's
   *  painting. The theme's palette and fonts stay either way. */
  rankBackdrop: boolean;
}

export const WPM_RANGE = { min: 60, max: 300 } as const;
export const POST_BUZZ_RANGE = { min: 1, max: 15 } as const;

export const DEFAULT_SETTINGS: Settings = {
  wpm: 150,
  postBuzzSeconds: 5,
  minDifficulty: DEFAULT_DIFFICULTIES[0] ?? 3,
  maxDifficulty: DEFAULT_DIFFICULTIES[DEFAULT_DIFFICULTIES.length - 1] ?? 5,
  categories: [],
  subcategories: [],
  strictness: DEFAULT_STRICTNESS,
  theme: 'classic',
  voiceRead: false,
  voiceAnswer: false,
  rankBackdrop: true,
};

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

function isCategory(value: unknown): value is Category {
  return (
    typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value)
  );
}

/** Every subcategory that belongs to at least one of the given categories. */
export function subcategoriesFor(categories: Category[]): string[] {
  const source = categories.length > 0 ? categories : [...CATEGORIES];
  const out: string[] = [];
  for (const category of source) {
    for (const sub of SUBCATEGORIES[category]) {
      if (!out.includes(sub)) out.push(sub);
    }
  }
  return out;
}

/**
 * Coerces anything that came out of storage into a usable Settings. Stored
 * values can be from an older build, hand-edited, or outright garbage.
 */
export function normalizeSettings(raw: unknown): Settings {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_SETTINGS };
  const r = raw as Partial<Record<keyof Settings, unknown>>;

  const categories = Array.isArray(r.categories)
    ? r.categories.filter(isCategory)
    : [];

  const allowed = subcategoriesFor(categories);
  const subcategories = Array.isArray(r.subcategories)
    ? r.subcategories.filter(
        (s): s is string => typeof s === 'string' && allowed.includes(s),
      )
    : [];

  let min = clamp(Number(r.minDifficulty ?? DEFAULT_SETTINGS.minDifficulty), 0, 10);
  let max = clamp(Number(r.maxDifficulty ?? DEFAULT_SETTINGS.maxDifficulty), 0, 10);
  if (min > max) [min, max] = [max, min];

  return {
    wpm: clamp(
      Number(r.wpm ?? DEFAULT_SETTINGS.wpm),
      WPM_RANGE.min,
      WPM_RANGE.max,
    ),
    postBuzzSeconds: clamp(
      Number(r.postBuzzSeconds ?? DEFAULT_SETTINGS.postBuzzSeconds),
      POST_BUZZ_RANGE.min,
      POST_BUZZ_RANGE.max,
    ),
    minDifficulty: min,
    maxDifficulty: max,
    categories,
    subcategories,
    strictness: clamp(Number(r.strictness ?? DEFAULT_SETTINGS.strictness), 1, 12),
    theme: isTheme(r.theme) ? r.theme : DEFAULT_SETTINGS.theme,
    voiceRead: r.voiceRead === true,
    voiceAnswer: r.voiceAnswer === true,
    rankBackdrop: r.rankBackdrop !== false,
  };
}

/** The QB Reader filter object these settings describe. */
export function filtersFrom(s: Settings): QuestionFilters {
  const difficulties: number[] = [];
  for (let d = s.minDifficulty; d <= s.maxDifficulty; d++) difficulties.push(d);
  return {
    difficulties,
    categories: [...s.categories],
    subcategories: [...s.subcategories],
    standardOnly: true,
  };
}

export function loadSettings(): Settings {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_SETTINGS };
    const text = localStorage.getItem(KEY);
    if (!text) return { ...DEFAULT_SETTINGS };
    return normalizeSettings(JSON.parse(text));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** True when the last write failed, so the player knows nothing is persisting. */
let writeFailed = false;

export function settingsArePersisted(): boolean {
  return !writeFailed;
}

export function saveSettings(s: Settings): void {
  try {
    if (typeof localStorage === 'undefined') {
      writeFailed = true;
      return;
    }
    localStorage.setItem(KEY, JSON.stringify(s));
    writeFailed = false;
  } catch {
    writeFailed = true;
  }
}

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

let current: Settings = loadSettings();
const listeners = new Set<(s: Settings) => void>();

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  current = normalizeSettings({ ...current, ...patch });
  saveSettings(current);
  for (const listen of listeners) listen(current);
  return current;
}

export function resetSettings(): Settings {
  return updateSettings({ ...DEFAULT_SETTINGS });
}

/** Subscribes a component to the store. Returns the live settings and a setter. */
export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [value, setValue] = useState<Settings>(current);

  useEffect(() => {
    // The store may have changed between render and effect.
    setValue(current);
    const listen = (s: Settings) => setValue(s);
    listeners.add(listen);
    return () => {
      listeners.delete(listen);
    };
  }, []);

  return [value, updateSettings];
}

/** Test seam: drops persisted state and subscribers. */
export function __resetSettings(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
  current = { ...DEFAULT_SETTINGS };
  writeFailed = false;
  listeners.clear();
}
