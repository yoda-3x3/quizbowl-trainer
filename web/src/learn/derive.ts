/**
 * Learn tab derivations. OWNED FILE.
 *
 * Everything here is computed from the AttemptEvent log. No stored aggregates.
 *
 * The interesting one is `missedQuestions`, which produces the data behind the
 * buzz-point replay rail: for a question you got wrong, the earliest word that
 * mentions something you have demonstrably answered correctly before. That
 * second marker is what no generic scroll device can produce, because it needs
 * your own answer history cross-referenced against this question's clue text.
 */

import type {
  AttemptEvent,
  BuzzBucket,
  Category,
  MissedQuestion,
  ProgressPoint,
  WeakSpot,
} from '../types';
import { buildSchedule } from '../engine/reader';
import { parseQuestion } from '../engine/power';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  'this', 'that', 'these', 'those', 'with', 'from', 'which', 'their', 'there',
  'them', 'then', 'than', 'were', 'what', 'when', 'where', 'while', 'about',
  'after', 'also', 'been', 'both', 'each', 'into', 'more', 'most', 'other',
  'over', 'same', 'some', 'such', 'only', 'other', 'name', 'points', 'answer',
  'author', 'novel', 'poem', 'work', 'works', 'play', 'wrote', 'written',
  'described', 'depicted', 'called', 'known', 'first', 'used', 'include',
  'includes', 'including', 'another', 'during', 'between', 'because',
  'accept', 'prompt', 'reject', 'either', 'partial',
]);

function normToken(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/** Significant tokens from an answer line, for cross-referencing clue text. */
function answerTerms(answerSanitized: string): string[] {
  // Drop bracketed directive sections; they are instructions, not the answer.
  const main = answerSanitized.replace(/\[[^\]]*\]/g, ' ');
  const out: string[] = [];
  for (const piece of main.split(/\s+/)) {
    const tok = normToken(piece);
    if (tok.length >= 4 && !STOPWORDS.has(tok)) out.push(tok);
  }
  return out;
}

function isCorrect(e: AttemptEvent): boolean {
  return e.directive === 'accept';
}

function buzzFraction(e: AttemptEvent): number | null {
  if (e.buzzWordIndex === null || e.totalWords <= 0) return null;
  return (e.buzzWordIndex + 1) / e.totalWords;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// ---------------------------------------------------------------------------
// Chapter 1 — weak spots
// ---------------------------------------------------------------------------

const MIN_TREND_SAMPLE = 6;

export function weakSpots(events: AttemptEvent[], minAttempts = 3): WeakSpot[] {
  const bySub = new Map<string, AttemptEvent[]>();
  for (const e of events) {
    if (e.mode === 'ear') continue;
    const list = bySub.get(e.subcategory);
    if (list) list.push(e);
    else bySub.set(e.subcategory, [e]);
  }

  const spots: WeakSpot[] = [];
  for (const [subcategory, list] of bySub) {
    if (list.length < minAttempts) continue;
    const correct = list.filter(isCorrect).length;
    const fractions = list
      .map(buzzFraction)
      .filter((f): f is number => f !== null);

    let trend: number | null = null;
    if (list.length >= MIN_TREND_SAMPLE) {
      const half = Math.floor(list.length / 2);
      const early = list.slice(0, half);
      const late = list.slice(half);
      const earlyAcc = early.filter(isCorrect).length / early.length;
      const lateAcc = late.filter(isCorrect).length / late.length;
      trend = lateAcc - earlyAcc;
    }

    spots.push({
      subcategory,
      category: (list[0]?.category ?? 'Other Academic') as Category,
      attempts: list.length,
      correct,
      accuracy: correct / list.length,
      meanBuzzFraction: mean(fractions),
      trend,
    });
  }

  // Worst first. Ties broken by sample size, so a well-evidenced weakness
  // outranks a 3-attempt fluke.
  return spots.sort(
    (a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts,
  );
}

// ---------------------------------------------------------------------------
// Chapter 2 — the misses. This feeds the signature move.
// ---------------------------------------------------------------------------

/**
 * Builds the vocabulary of things this player has proven they know, from every
 * question they answered correctly.
 */
export function knownTerms(events: AttemptEvent[]): Set<string> {
  const terms = new Set<string>();
  for (const e of events) {
    if (!isCorrect(e)) continue;
    const line = e.questionSnapshot?.answerSanitized;
    if (!line) continue;
    for (const term of answerTerms(line)) terms.add(term);
  }
  return terms;
}

/**
 * Earliest word index in `words` that mentions a term the player already knows.
 * Returns null when the question contains nothing they have answered before.
 */
export function findKnowableIndex(
  words: string[],
  known: Set<string>,
): number | null {
  for (let i = 0; i < words.length; i++) {
    const raw = words[i];
    if (!raw) continue;
    const tok = normToken(raw);
    if (tok.length < 4 || STOPWORDS.has(tok)) continue;
    if (known.has(tok)) return i;
    // Light de-pluralising so "Brunelleschi's" and "sonatas" still match.
    if (tok.endsWith('s') && known.has(tok.slice(0, -1))) return i;
  }
  return null;
}

export function missedQuestions(
  events: AttemptEvent[],
  opts: { wpm: number; limit?: number } = { wpm: 150 },
): MissedQuestion[] {
  const { wpm, limit = 25 } = opts;
  const known = knownTerms(events);

  const misses = events
    .filter((e) => e.mode === 'tossup' && !isCorrect(e))
    .filter((e) => Boolean(e.questionSnapshot?.questionSanitized))
    .sort((a, b) => b.at - a.at)
    .slice(0, limit);

  return misses.map((event) => {
    const snapshot = event.questionSnapshot;
    const parsed = parseQuestion(snapshot?.questionSanitized ?? '');
    const words = parsed.words;
    const knowableWordIndex = findKnowableIndex(words, known);

    let secondsLate: number | null = null;
    if (knowableWordIndex !== null && event.buzzWordIndex !== null) {
      const schedule = buildSchedule(words, wpm);
      const from = schedule[knowableWordIndex];
      const to = schedule[event.buzzWordIndex];
      if (from !== undefined && to !== undefined && to > from) {
        secondsLate = (to - from) / 1000;
      }
    }

    return {
      event,
      words,
      buzzWordIndex: event.buzzWordIndex,
      knowableWordIndex,
      secondsLate,
    };
  });
}

// ---------------------------------------------------------------------------
// Chapter 4 — progress
// ---------------------------------------------------------------------------

export function buzzDistribution(events: AttemptEvent[]): BuzzBucket[] {
  const buckets: BuzzBucket[] = Array.from({ length: 10 }, (_, i) => ({
    decile: i,
    count: 0,
  }));
  for (const e of events) {
    const f = buzzFraction(e);
    if (f === null) continue;
    const idx = Math.min(9, Math.max(0, Math.floor(f * 10)));
    const bucket = buckets[idx];
    if (bucket) bucket.count += 1;
  }
  return buckets;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function weekStart(at: number): number {
  const d = new Date(at);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime() - day * 24 * 60 * 60 * 1000;
}

export function progressOverTime(events: AttemptEvent[]): ProgressPoint[] {
  const byWeek = new Map<number, AttemptEvent[]>();
  for (const e of events) {
    if (e.mode === 'ear') continue;
    const key = weekStart(e.at);
    const list = byWeek.get(key);
    if (list) list.push(e);
    else byWeek.set(key, [e]);
  }

  return [...byWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ws, list]) => {
      const correct = list.filter(isCorrect).length;
      const powered = list.filter(
        (e) =>
          isCorrect(e) &&
          e.buzzWordIndex !== null &&
          e.powerWordIndex !== null &&
          e.buzzWordIndex <= e.powerWordIndex,
      ).length;
      const fractions = list
        .map(buzzFraction)
        .filter((f): f is number => f !== null);
      return {
        weekStart: ws,
        attempts: list.length,
        accuracy: correct / list.length,
        powerRate: powered / list.length,
        meanBuzzFraction: mean(fractions),
      };
    });
}

/** Headline numbers for the tab header. */
export function summary(events: AttemptEvent[]) {
  const play = events.filter((e) => e.mode !== 'ear');
  const buzzed = play.filter((e) => e.buzzWordIndex !== null);
  const correct = play.filter(isCorrect);
  const powered = correct.filter(
    (e) =>
      e.buzzWordIndex !== null &&
      e.powerWordIndex !== null &&
      e.buzzWordIndex <= e.powerWordIndex,
  );
  const negs = buzzed.filter((e) => e.directive === 'reject');
  const fractions = play
    .map(buzzFraction)
    .filter((f): f is number => f !== null);

  return {
    heard: play.length,
    accuracy: play.length > 0 ? correct.length / play.length : 0,
    powerRate: play.length > 0 ? powered.length / play.length : 0,
    negRate: play.length > 0 ? negs.length / play.length : 0,
    meanBuzzFraction: mean(fractions),
    points: play.reduce((a, e) => a + e.points, 0),
    weeksTracked: new Set(play.map((e) => weekStart(e.at))).size,
    spanMs:
      play.length > 1
        ? (play[play.length - 1]?.at ?? 0) - (play[0]?.at ?? 0)
        : 0,
    weekMs: WEEK_MS,
  };
}
