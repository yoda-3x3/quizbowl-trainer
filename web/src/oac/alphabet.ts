/**
 * Round 2, the alphabet round: a written worksheet where every answer begins
 * with the same letter, announced up front.
 *
 * Twenty items, four minutes, two points each, identical for both teams. It is
 * not a buzzer round, so nothing here runs a per-question clock; the round has
 * one clock and the state machine owns it.
 *
 * Generating a round is a filtering problem, not a writing problem: take a
 * pyramidal bank, keep the questions whose answer unambiguously starts with the
 * announced letter, and use each one's giveaway clause as the clue. The
 * ambiguity test is the interesting part. "The Great Gatsby" is a G answer to
 * one person and a T answer to another, so an answer that opens with an article
 * is rejected rather than guessed at.
 */

import type { OacAlphabetItem, Tossup } from '../types';
import { OAC_SCORING } from '../types';
import { acceptableAnswers, giveawayClause, primaryAnswer } from './convert';

/**
 * Leading words that make the first letter ambiguous. English articles plus the
 * ones that survive untranslated in titles a quizbowl answerline would print.
 */
const LEADING_ARTICLE =
  /^(the|a|an|la|le|les|los|las|el|il|lo|der|die|das|den|det|ein|eine|un|una|une|o|os|as|l')\s+/i;

function normalizeAnswer(answer: string): string {
  return answer.replace(/^[\s"'“”‘’(\[]+/, '').trim();
}

/**
 * The letter an answer files under, or null when it is ambiguous.
 *
 * Ambiguous means stripping a leading article would change the answer, i.e. the
 * answer starts with one. It also covers answers that do not start with a
 * letter at all, such as "1984" or "<i>Guernica</i>" once stripped to nothing.
 */
export function alphabetLetterOf(answer: string): string | null {
  const value = normalizeAnswer(answer);
  if (value.length === 0) return null;
  if (LEADING_ARTICLE.test(value)) return null;

  const first = value[0];
  if (first === undefined) return null;
  if (!/\p{L}/u.test(first)) return null;
  return first.toUpperCase();
}

/** Does this answer file under `letter`? */
export function matchesLetter(answer: string, letter: string): boolean {
  const of = alphabetLetterOf(answer);
  if (of === null) return false;
  return of === letter.trim().toUpperCase();
}

function wordCount(answer: string): number {
  return normalizeAnswer(answer).split(/\s+/).filter((w) => w.length > 0).length;
}

export interface AlphabetRound {
  letter: string;
  items: OacAlphabetItem[];
}

/**
 * Build an alphabet round for `letter` out of a pyramidal bank.
 *
 * Returns as many items as the bank supports, up to `count`. Callers check
 * `items.length` rather than trusting the bank: a short round is a data
 * problem, and silently padding it with off-letter answers would be worse.
 */
export function generateAlphabetRound(
  letter: string,
  bank: Tossup[],
  count: number = OAC_SCORING.alphabetItemCount,
): AlphabetRound {
  const target = letter.trim().toUpperCase().slice(0, 1);
  const items: OacAlphabetItem[] = [];
  const seen = new Set<string>();

  for (const t of bank) {
    if (items.length >= count) break;

    const answerline = t.answer || t.answerSanitized;
    const answer = normalizeAnswer(primaryAnswer(answerline));
    if (!matchesLetter(answer, target)) continue;

    const key = answer.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const prompt = giveawayClause(t.questionSanitized);
    if (prompt.length === 0) continue;

    items.push({
      index: items.length + 1,
      prompt,
      answer,
      // An alternate that files under a different letter would contradict the
      // announced letter, so it is dropped rather than accepted.
      acceptable: acceptableAnswers(answerline).filter((alt) =>
        matchesLetter(alt, target),
      ),
      twoWord: wordCount(answer) >= 2,
    });
  }

  return { letter: target, items };
}

/**
 * The letter this bank can actually fill a round with, or null when none can.
 *
 * Ties break alphabetically so the same bank always yields the same round.
 */
export function bestAlphabetLetter(
  bank: Tossup[],
  count: number = OAC_SCORING.alphabetItemCount,
): string | null {
  const tally = new Map<string, Set<string>>();

  for (const t of bank) {
    const answer = normalizeAnswer(primaryAnswer(t.answer || t.answerSanitized));
    const letter = alphabetLetterOf(answer);
    if (letter === null) continue;
    const bucket = tally.get(letter) ?? new Set<string>();
    bucket.add(answer.toLowerCase());
    tally.set(letter, bucket);
  }

  let best: string | null = null;
  let bestSize = 0;
  for (const letter of [...tally.keys()].sort()) {
    const size = tally.get(letter)?.size ?? 0;
    if (size > bestSize) {
      best = letter;
      bestSize = size;
    }
  }

  // Null rather than a letter that cannot fill the round. Pass count 1 to get
  // the richest letter regardless.
  return bestSize >= count ? best : null;
}
