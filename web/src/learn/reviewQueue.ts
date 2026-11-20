/**
 * Spaced-review queue derivation for the Learn tab.
 *
 * A "review item" is a question the player got wrong at least once. The queue
 * is ordered by `(missCount desc, lastSeen asc)` — the most-missed questions
 * come first, and within a tie the one that has been waiting longest wins.
 *
 * Spaced-repetition lite: an item that was attempted within the last 24h is
 * dropped from the queue, so the player does not see the same card twice on
 * the same sitting and the repetitions get a chance to consolidate.
 *
 * The item carries a snapshot of the question so the ReviewCard can render
 * it without a refetch. That snapshot already lives on the event, which is
 * why `missedQuestions` in derive.ts is reused as the base.
 */

import type { AttemptEvent, Category } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReviewItem {
  /** Stable question id, used as the key and for re-launching the question. */
  questionId: string;
  category: Category;
  subcategory: string;
  difficulty: number;
  /** The question's text, straight off the most recent event's snapshot. */
  questionSanitized: string;
  answerSanitized: string;
  setName: string;
  /** How many times this question has been missed, across all attempts. */
  missCount: number;
  /** Epoch ms of the most recent attempt at this question. */
  lastSeen: number;
}

export interface ReviewQueueOptions {
  /** Hard cap on the returned list. */
  limit?: number;
  /** Items touched more recently than this cooldown are held back. */
  cooldownMs?: number;
  /** Injected clock, for tests. Defaults to `Date.now()`. */
  now?: number;
}

/**
 * Builds the review queue from the full event log. Only tossup events are
 * considered; bonus and ear-training events never surface here because the
 * "re-drill one question" UI is tossup-shaped.
 *
 * A later correct attempt at a question does NOT remove it from the queue —
 * Duolingo keeps missed items around for a few extra repetitions because the
 * first correct answer is often half-luck. The item ages out via the
 * cooldown instead, which is a gentler form of forgetting.
 */
export function reviewQueue(
  events: AttemptEvent[],
  opts: ReviewQueueOptions = {},
): ReviewItem[] {
  const { limit = 10, cooldownMs = DAY_MS, now = Date.now() } = opts;

  // Group tossup events by questionId, keeping the newest snapshot so the
  // card renders the latest text (useful if we ever re-snapshot a question).
  const byId = new Map<string, {
    missCount: number;
    lastSeen: number;
    sample: AttemptEvent;
  }>();

  for (const e of events) {
    if (e.mode !== 'tossup') continue;
    if (!e.questionSnapshot?.questionSanitized) continue;

    const bucket = byId.get(e.questionId);
    const wasMiss = e.directive !== 'accept';
    if (bucket) {
      if (wasMiss) bucket.missCount += 1;
      if (e.at > bucket.lastSeen) {
        bucket.lastSeen = e.at;
        bucket.sample = e;
      }
    } else {
      byId.set(e.questionId, {
        missCount: wasMiss ? 1 : 0,
        lastSeen: e.at,
        sample: e,
      });
    }
  }

  const items: ReviewItem[] = [];
  for (const [questionId, bucket] of byId) {
    if (bucket.missCount === 0) continue;
    if (now - bucket.lastSeen < cooldownMs) continue;
    const snap = bucket.sample.questionSnapshot;
    if (!snap) continue;
    items.push({
      questionId,
      category: bucket.sample.category,
      subcategory: bucket.sample.subcategory,
      difficulty: bucket.sample.difficulty,
      questionSanitized: snap.questionSanitized,
      answerSanitized: snap.answerSanitized,
      setName: snap.setName,
      missCount: bucket.missCount,
      lastSeen: bucket.lastSeen,
    });
  }

  items.sort((a, b) => {
    if (b.missCount !== a.missCount) return b.missCount - a.missCount;
    return a.lastSeen - b.lastSeen;
  });

  return items.slice(0, limit);
}

/** Short teaser text for a review card. 80 chars with a trailing ellipsis. */
export function teaser(questionSanitized: string, max = 80): string {
  const trimmed = questionSanitized.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1).trimEnd() + '…';
}
