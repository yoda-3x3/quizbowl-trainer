/**
 * Question pacing. OWNED FILE.
 *
 * Deliberately free of React and of any DOM API, because the Durable Object
 * room server imports this too. Client and server must compute identical
 * schedules or a synced room will drift apart.
 */

/**
 * The per-word slice time boils down to `baseMs * wordMultiplier(word)`.
 * Factored out so `revealedCharsAt` can reconstruct `baseMs` from a schedule
 * without threading `wpm` through every call site (the room server sends a
 * `number[]` over the wire and nothing else).
 */
function wordMultiplier(word: string): number {
  const letters = word.replace(/[^\p{L}\p{N}]/gu, '').length;
  // Damped length weighting: a 1-letter word is ~0.68x, a 13+ letter word ~1.6x.
  let m = 0.6 + 0.4 * Math.min(2.5, letters / 5);
  if (/[.!?]['")\]]?$/.test(word)) m += 0.9;
  else if (/[,;:]['")\]]?$/.test(word)) m += 0.35;
  return m;
}

/** Milliseconds this word should occupy at the given base pace. */
export function wordDelay(word: string, baseMs: number): number {
  return baseMs * wordMultiplier(word);
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

/**
 * The number of characters of `words.join(' ')` that should be visible after
 * `elapsed` ms. Interpolates within each word's scheduled time slice so the
 * UI can type the question out letter-by-letter instead of popping whole
 * words in. The per-word `schedule` stays authoritative, so client and room
 * server still agree on which word is live at any given moment.
 */
export function revealedCharsAt(
  words: string[],
  schedule: number[],
  elapsed: number,
): number {
  if (words.length === 0) return 0;
  const fullLen = joinedLength(words);
  if (elapsed <= 0) return 0;

  const n = revealedAt(schedule, elapsed);
  if (n === 0) return 0;
  const i = Math.min(n - 1, words.length - 1);

  // Characters already fully revealed: every word before `i`, each with its
  // trailing space.
  let base = 0;
  for (let k = 0; k < i; k++) base += (words[k] ?? '').length + 1;

  // Duration of word `i`'s slice. For an interior word this is a plain diff
  // of the schedule. For the final word there is no next entry, so we
  // reconstruct `baseMs` from the schedule (schedule[i] = baseMs * sum of
  // multipliers for words 0..i-1) and recompute its own delay. That stays
  // consistent with `buildSchedule` even when the last word is unusually
  // short or long.
  const wordStart = schedule[i] ?? 0;
  let wordDur: number;
  if (i + 1 < schedule.length) {
    wordDur = Math.max(0, (schedule[i + 1] ?? wordStart) - wordStart);
  } else {
    let priorMult = 0;
    for (let k = 0; k < i; k++) priorMult += wordMultiplier(words[k] ?? '');
    const baseMs = priorMult > 0 ? wordStart / priorMult : 0;
    wordDur = baseMs * wordMultiplier(words[i] ?? '');
  }

  // The current word owns its own letters plus the trailing space, except
  // the last word in the question which has no trailing space.
  const currWord = words[i] ?? '';
  const currSlice = currWord.length + (i < words.length - 1 ? 1 : 0);
  const frac =
    wordDur > 0
      ? Math.min(1, Math.max(0, (elapsed - wordStart) / wordDur))
      : 1;
  const revealedInCurr = Math.floor(frac * currSlice);
  return Math.min(fullLen, base + revealedInCurr);
}

function joinedLength(words: string[]): number {
  let n = 0;
  for (let k = 0; k < words.length; k++) {
    n += (words[k] ?? '').length;
    if (k < words.length - 1) n += 1;
  }
  return n;
}
