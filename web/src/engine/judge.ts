/**
 * Answer checking. OWNED FILE.
 *
 * Wraps `qb-answer-checker`, which is the exact logic behind QB Reader's own
 * /api/check-answer endpoint (that endpoint is a one-line wrapper around this
 * npm package). Bundling it means judging is instant, works offline, and
 * exposes the `strictness` parameter that the HTTP endpoint silently discards.
 *
 * Do not write a hand-rolled matcher. The legacy Python app's substring rule
 * accepted "ring" for "The Rite of Spring"; this package rejects that, and does
 * edit-distance, stemming, diacritic folding, number and roman-numeral
 * normalization, and real prompt handling.
 *
 * VERIFIED BEHAVIOUR (measured against v1.1.9, not assumed):
 *
 *  - Strictness runs BACKWARDS from what the name suggests: 1 is the most
 *    lenient and accepts almost anything; 12 is the strictest. Values 3 through
 *    9 are an identical plateau, so the default of 7 is not a tuned midpoint.
 *  - Typo tolerance depends on the answerline markup, not on strictness.
 *    "Tchaikovksy" is accepted against `Pyotr Ilyich <b><u>Tchaikovsky</u></b>`
 *    but rejected against `<b><u>Pyotr Ilyich Tchaikovsky</u></b>`, because in
 *    the second case the whole span is required. That is correct quizbowl
 *    behaviour, so prefer the HTML `answer` field over `answerSanitized`.
 *  - Diacritics are already folded internally: "Salvador Dali",
 *    "Rene Magritte" and "Antonin Dvorak" all accept. No pre-normalization
 *    needed, and pre-folding measurably changes nothing.
 *  - Matching is token-containment based, so an answer that CONTAINS the
 *    required tokens is accepted regardless of surrounding words. This means
 *    "not michelangelo" is accepted for "Michelangelo". We deliberately do not
 *    guard against this: any negation blocklist would also reject legitimate
 *    answers like "No Exit" or "Nothing Gold Can Stay", and typing a negation
 *    as your own self-test answer is not a realistic failure mode.
 */

import checkAnswer from 'qb-answer-checker';
import type { Directive, Judgement } from '../types';

/**
 * QB Reader's own default, and the value their API hardcodes.
 * Lower is MORE lenient. 3-9 behave identically; 1 accepts nearly anything.
 */
export const DEFAULT_STRICTNESS = 7;

/** The useful ends of the range, for a settings slider. */
export const STRICTNESS_RANGE = { lenient: 1, standard: 7, strict: 12 } as const;

interface RawResult {
  directive?: string;
  directedPrompt?: string | null;
}

function coerceDirective(value: unknown): Directive {
  if (value === 'accept' || value === 'prompt' || value === 'reject') {
    return value;
  }
  return 'reject';
}

/**
 * Judge a given answer against an answerline.
 *
 * `answerline` should be the HTML form (`answer`) when available, since the
 * <b><u>…</u></b> markup tells the checker which substring is required. The
 * sanitized form also works, just slightly less precisely.
 */
export function judge(
  answerline: string,
  given: string,
  strictness: number = DEFAULT_STRICTNESS,
): Judgement {
  const trimmed = given.trim();
  if (trimmed.length === 0) return { directive: 'reject' };

  try {
    const raw = checkAnswer(answerline, trimmed, strictness) as RawResult;
    const directive = coerceDirective(raw?.directive);
    // The wire format omits directedPrompt entirely when absent, and the
    // package may return null. Normalize both to "field not present".
    const prompt = raw?.directedPrompt;
    return prompt ? { directive, directedPrompt: prompt } : { directive };
  } catch {
    // A malformed answerline must never crash a live buzz.
    return { directive: 'reject' };
  }
}

/** True when the judgement should end the question in the player's favour. */
export function isCorrect(j: Judgement): boolean {
  return j.directive === 'accept';
}

/** True when the player should be asked to be more specific and try again. */
export function isPrompt(j: Judgement): boolean {
  return j.directive === 'prompt';
}
