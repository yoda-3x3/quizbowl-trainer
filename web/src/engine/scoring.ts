/**
 * Pyramidal quizbowl scoring. OWNED FILE.
 *
 * Standard values: 15 in power, 10 after power, -5 for an incorrect buzz,
 * 10 for a correct answer given at the end of the question with no buzz,
 * 0 for an incorrect answer at the end.
 */

import { isPower } from './power';

export interface TossupOutcome {
  points: number;
  powered: boolean;
  negged: boolean;
}

export function scoreTossup(opts: {
  buzzWordIndex: number | null;
  powerIndex: number | null;
  correct: boolean;
}): TossupOutcome {
  const { buzzWordIndex, powerIndex, correct } = opts;
  const buzzed = buzzWordIndex !== null;

  if (!buzzed) {
    // Ran to the end of the question, then answered. No neg is possible.
    return { points: correct ? 10 : 0, powered: false, negged: false };
  }

  if (!correct) {
    return { points: -5, powered: false, negged: true };
  }

  const powered = isPower(buzzWordIndex, powerIndex);
  return { points: powered ? 15 : 10, powered, negged: false };
}

/** Bonus parts are flat 10 each unless the set says otherwise. */
export function scoreBonusPart(correct: boolean, value = 10): number {
  return correct ? value : 0;
}
