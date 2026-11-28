/**
 * QB Reader-style session line for the tossup screen: powers / tens / negs
 * and celerity. Celerity is the mean of (1 - buzz fraction) over correct
 * buzzes, so 1 means buzzing on the first word and 0 at the very end.
 */

import type { AttemptEvent } from '../types';

export interface TossupTally {
  powers: number;
  tens: number;
  negs: number;
  /** null until there is at least one correct buzz. */
  celerity: number | null;
}

export function tally(events: readonly AttemptEvent[]): TossupTally {
  let powers = 0;
  let tens = 0;
  let negs = 0;
  const cel: number[] = [];
  for (const e of events) {
    if (e.mode === 'ear') continue;
    if (e.directive === 'accept') {
      const powered =
        e.buzzWordIndex !== null &&
        e.powerWordIndex !== null &&
        e.buzzWordIndex <= e.powerWordIndex;
      if (powered) powers++;
      else tens++;
      if (e.buzzWordIndex !== null && e.totalWords > 0) {
        cel.push(1 - (e.buzzWordIndex + 1) / e.totalWords);
      }
    } else if (e.points < 0) {
      negs++;
    }
  }
  return {
    powers,
    tens,
    negs,
    celerity: cel.length > 0 ? cel.reduce((a, b) => a + b, 0) / cel.length : null,
  };
}
