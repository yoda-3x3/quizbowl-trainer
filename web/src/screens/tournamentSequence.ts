/**
 * Pure logic used by the TournamentDetail sequencer.
 *
 * These helpers have no React or DOM dependency, so they can be unit tested
 * against synthetic fixtures. The screen in TournamentDetail.tsx builds the
 * `TossupSource` / `BonusSource` objects out of these pieces.
 */

import { fetchBonuses, TossupQueue, normalizeTossup } from '../data/qbreader';
import type {
  Bonus as BonusQuestion,
  QuestionFilters,
  Tossup as TossupQuestion,
} from '../types';

// ---------------------------------------------------------------------------
// Question picking at tournament start
// ---------------------------------------------------------------------------

/** A picked question with the kind the server expects. */
export interface QuestionPick {
  id: string;
  kind: 'tossup' | 'bonus';
}

interface TossupQueueLike {
  next(): Promise<TossupQuestion | null>;
}

/**
 * Pulls `nTossups` tossup ids from the live tossup queue and `nBonuses` bonus
 * ids from a direct bonus fetch. Picking bonuses from `fetchBonuses` keeps
 * the bonus-format start honest; before this, bonus slots held tossup ids
 * (NOTES.md point 16).
 *
 * The bonus fetcher is injectable so unit tests don't hit the network.
 */
export async function pickQuestionIds(
  filters: QuestionFilters,
  nTossups: number,
  nBonuses: number,
  deps: {
    makeTossupQueue?: (filters: QuestionFilters) => TossupQueueLike;
    fetchBonuses?: typeof fetchBonuses;
    maxBonusFetchRounds?: number;
  } = {},
): Promise<QuestionPick[]> {
  const picks: QuestionPick[] = [];
  const makeQueue =
    deps.makeTossupQueue ??
    ((f: QuestionFilters): TossupQueueLike => new TossupQueue(f));
  const fetchBonusesFn = deps.fetchBonuses ?? fetchBonuses;
  const maxRounds = deps.maxBonusFetchRounds ?? 4;

  if (nTossups > 0) {
    const queue = makeQueue(filters);
    for (let i = 0; i < nTossups; i++) {
      const t = await queue.next();
      if (!t) break;
      picks.push({ id: t.id, kind: 'tossup' });
    }
  }

  if (nBonuses > 0) {
    const seen = new Set<string>();
    let bonusesPicked = 0;
    for (let round = 0; round < maxRounds && bonusesPicked < nBonuses; round++) {
      const batch = await fetchBonusesFn(filters, Math.max(20, nBonuses));
      let newThisRound = 0;
      for (const b of batch) {
        if (seen.has(b.id)) continue;
        seen.add(b.id);
        newThisRound++;
        picks.push({ id: b.id, kind: 'bonus' });
        bonusesPicked++;
        if (bonusesPicked >= nBonuses) break;
      }
      if (newThisRound === 0) break;
    }
  }

  return picks;
}

// ---------------------------------------------------------------------------
// Server-shape → client-type adapters
// ---------------------------------------------------------------------------

export interface PublicTossupRow {
  id: string;
  question: string;
  question_sanitized: string;
  answer: string;
  answer_sanitized: string;
  category: string;
  subcategory: string;
  difficulty: number;
  set_name: string;
  set_year: number;
  packet_number: number;
  question_number: number;
}

export interface PublicBonusRow {
  id: string;
  leadin: string;
  leadin_sanitized: string;
  parts: string[];
  parts_sanitized: string[];
  answers: string[];
  answers_sanitized: string[];
  values: number[] | null;
  category: string;
  subcategory: string;
  difficulty: number;
  set_name: string;
}

export function publicToTossup(row: PublicTossupRow): TossupQuestion {
  // Reuse the owned qbreader normalizer so the Tossup carries every field the
  // reader engine expects (power parsing, judge markup, display metadata).
  const normalized = normalizeTossup({
    _id: row.id,
    question: row.question,
    question_sanitized: row.question_sanitized,
    answer: row.answer,
    answer_sanitized: row.answer_sanitized,
    category: row.category,
    subcategory: row.subcategory,
    difficulty: row.difficulty,
    number: row.question_number,
    packet: { number: row.packet_number },
    set: { name: row.set_name, year: row.set_year },
  });
  if (normalized) return normalized;
  // Fallback for the (server-rejected) case of a missing question or answer.
  return {
    id: row.id,
    question: row.question,
    questionSanitized: row.question_sanitized,
    answer: row.answer,
    answerSanitized: row.answer_sanitized,
    category: row.category as TossupQuestion['category'],
    subcategory: row.subcategory,
    difficulty: row.difficulty,
    setName: row.set_name,
    setYear: row.set_year,
    packetNumber: row.packet_number,
    questionNumber: row.question_number,
    source: 'qbreader',
  };
}

export function publicToBonus(row: PublicBonusRow): BonusQuestion {
  const n = Math.min(row.parts.length, row.answers.length);
  const base: BonusQuestion = {
    id: row.id,
    leadin: row.leadin,
    leadinSanitized: row.leadin_sanitized,
    parts: row.parts.slice(0, n),
    partsSanitized: row.parts_sanitized.slice(0, n),
    answers: row.answers.slice(0, n),
    answersSanitized: row.answers_sanitized.slice(0, n),
    category: row.category as BonusQuestion['category'],
    subcategory: row.subcategory,
    difficulty: row.difficulty,
    setName: row.set_name,
    source: 'qbreader',
  };
  if (row.values) base.values = row.values.slice(0, n);
  return base;
}

// ---------------------------------------------------------------------------
// Burst walker — pure logic
// ---------------------------------------------------------------------------

export interface PinnedSeqEntry {
  seq: number;
  question_id: string;
  question_kind: 'tossup' | 'bonus';
}

/**
 * Walks a pinned sequence yielding the next consecutive tossup entry. Returns
 * the matching entry and the new cursor position, or `null` when the next
 * entry is a bonus or we've run out.
 *
 * Separated from the component so the end-of-burst behaviour is testable.
 */
export function nextTossupInBurst(
  pinned: ReadonlyArray<PinnedSeqEntry>,
  cursor: number,
): { entry: PinnedSeqEntry; nextCursor: number } | null {
  const entry = pinned[cursor];
  if (!entry || entry.question_kind !== 'tossup') return null;
  return { entry, nextCursor: cursor + 1 };
}
