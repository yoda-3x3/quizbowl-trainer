/**
 * Streak, XP and daily-lesson derivations for the Learn tab.
 *
 * All day boundaries are in UTC so a late-night session cannot pretend to be
 * yesterday's practice — the trade-off is that someone travelling across a
 * time zone will see a small off-by-one, which is less harmful than a double
 * credit for a single day of play.
 *
 * Correctness is the usual `directive === 'accept'` and only `mode === 'tossup'`
 * events count. A bonus or an ear-training session does not keep a streak alive,
 * because this tab is specifically about tossup practice.
 */

import type { AttemptEvent } from '../types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Default lessons-per-day the streak header fills its ring against. */
export const DEFAULT_DAILY_GOAL = 3;

function isCorrectTossup(e: AttemptEvent): boolean {
  return e.mode === 'tossup' && e.directive === 'accept';
}

/** YYYY-MM-DD in UTC. Used as the day key for all daily rollups. */
export function dayKey(epochMs: number): string {
  const d = new Date(epochMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Midnight-UTC epoch for the day that contains `epochMs`. */
export function startOfUtcDay(epochMs: number): number {
  return Math.floor(epochMs / MS_PER_DAY) * MS_PER_DAY;
}

/**
 * Consecutive days (UTC) with at least one correct tossup, ending today or
 * yesterday. If the latest correct tossup is older than yesterday the streak
 * is 0.
 *
 * `now` is an injected clock so tests can pin a specific date; the only caller
 * in the app passes `Date.now()`.
 */
export function currentStreak(events: AttemptEvent[], now = Date.now()): number {
  const correctDays = new Set<string>();
  for (const e of events) {
    if (!isCorrectTossup(e)) continue;
    correctDays.add(dayKey(e.at));
  }
  if (correctDays.size === 0) return 0;

  const today = startOfUtcDay(now);
  const todayKey = dayKey(today);
  const yesterdayKey = dayKey(today - MS_PER_DAY);

  // Streak is alive if today OR yesterday is in the set. If only yesterday,
  // today has not been played yet but the streak has not expired.
  let cursor: number;
  if (correctDays.has(todayKey)) {
    cursor = today;
  } else if (correctDays.has(yesterdayKey)) {
    cursor = today - MS_PER_DAY;
  } else {
    return 0;
  }

  let count = 0;
  while (correctDays.has(dayKey(cursor))) {
    count += 1;
    cursor -= MS_PER_DAY;
  }
  return count;
}

/**
 * True when the streak is still alive but today has no correct tossup yet.
 * The UI uses this to say "keep it alive" rather than silently drop the count.
 */
export function streakAtRisk(
  events: AttemptEvent[],
  now = Date.now(),
): boolean {
  const streak = currentStreak(events, now);
  if (streak === 0) return false;
  const todayKey = dayKey(startOfUtcDay(now));
  for (const e of events) {
    if (isCorrectTossup(e) && dayKey(e.at) === todayKey) return false;
  }
  return true;
}

/**
 * XP across all time. +2 per powered correct tossup, +1 per non-powered
 * correct tossup, 0 otherwise. Derived from the scoring already baked into
 * the event, but kept here so the Learn UI never has to duplicate the rule.
 */
export function xpTotal(events: AttemptEvent[]): number {
  let xp = 0;
  for (const e of events) {
    if (e.mode !== 'tossup') continue;
    if (e.directive !== 'accept') continue;
    const powered =
      e.buzzWordIndex !== null &&
      e.powerWordIndex !== null &&
      e.buzzWordIndex <= e.powerWordIndex;
    xp += powered ? 2 : 1;
  }
  return xp;
}

/** XP a single tossup event would contribute. */
export function xpForEvent(e: AttemptEvent): number {
  if (e.mode !== 'tossup' || e.directive !== 'accept') return 0;
  const powered =
    e.buzzWordIndex !== null &&
    e.powerWordIndex !== null &&
    e.buzzWordIndex <= e.powerWordIndex;
  return powered ? 2 : 1;
}

/**
 * How many lessons the player has completed today. A lesson is a distinct
 * `lessonId` whose events land on today's UTC day. Events without a
 * `lessonId` — every event logged before this feature shipped — are ignored,
 * which is deliberate: the counter starts at zero on day one of the new UI
 * rather than pretending old solo practice was a Duolingo lesson.
 */
export function todaysLessons(
  events: AttemptEvent[],
  now = Date.now(),
): number {
  const today = dayKey(startOfUtcDay(now));
  const ids = new Set<string>();
  for (const e of events) {
    if (!e.lessonId) continue;
    if (dayKey(e.at) !== today) continue;
    ids.add(e.lessonId);
  }
  return ids.size;
}

export interface StreakSummary {
  streak: number;
  atRisk: boolean;
  xp: number;
  lessonsToday: number;
  dailyGoal: number;
}

/** One bundle so the StreakHeader does not have to call four functions. */
export function streakSummary(
  events: AttemptEvent[],
  dailyGoal = DEFAULT_DAILY_GOAL,
  now = Date.now(),
): StreakSummary {
  return {
    streak: currentStreak(events, now),
    atRisk: streakAtRisk(events, now),
    xp: xpTotal(events),
    lessonsToday: todaysLessons(events, now),
    dailyGoal,
  };
}
