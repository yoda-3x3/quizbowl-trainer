/**
 * Question pacing. OWNED FILE.
 *
 * Deliberately free of React and of any DOM API, because the Durable Object
 * room server imports this too. Client and server must compute identical
 * schedules or a synced room will drift apart.
 */

/** Milliseconds this word should occupy at the given base pace. */
export function wordDelay(word: string, baseMs: number): number {
  const letters = word.replace(/[^\p{L}\p{N}]/gu, '').length;
  // Damped length weighting: a 1-letter word is ~0.68x, a 13+ letter word ~1.6x.
  const lengthFactor = 0.6 + 0.4 * Math.min(2.5, letters / 5);
  let ms = baseMs * lengthFactor;
  if (/[.!?]['")\]]?$/.test(word)) ms += baseMs * 0.9;
  else if (/[,;:]['")\]]?$/.test(word)) ms += baseMs * 0.35;
  return ms;
}

/**
 * Cumulative due-time for each word, in ms from start.
 * `schedule[i]` is when word i becomes visible.
 */
export function buildSchedule(words: string[], wpm: number): number[] {
  const baseMs = 60000 / Math.max(20, wpm);
  const out: number[] = new Array(words.length);
  let acc = 0;
  for (let i = 0; i < words.length; i++) {
    out[i] = acc;
    acc += wordDelay(words[i] ?? '', baseMs);
  }
  return out;
}

/** How many words should be visible after `elapsed` ms. */
export function revealedAt(schedule: number[], elapsed: number): number {
  let lo = 0;
  let hi = schedule.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((schedule[mid] ?? 0) <= elapsed) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
