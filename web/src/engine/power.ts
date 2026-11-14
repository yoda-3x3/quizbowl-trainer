/**
 * Power-mark parsing. OWNED FILE.
 *
 * The power boundary is the literal string "(*)" in the question text. This is
 * the reliable marker in both `question` and `questionSanitized`.
 *
 * Do NOT key off the <b> tags in the HTML `question` field: QB Reader wraps the
 * pre-power span in <b>, but <b> is also used mid-question for moderator
 * instructions such as "(read slowly)", so it is ambiguous. "(*)" is not.
 */

export interface ParsedQuestion {
  /** Whitespace-split words with the power marker removed. */
  words: string[];
  /**
   * 0-based index of the LAST in-power word, or null when the question has no
   * power mark (roughly 40% of them) or the mark precedes every word.
   */
  powerIndex: number | null;
}

const MARKER = '(*)';

export function parseQuestion(questionSanitized: string): ParsedQuestion {
  const tokens = questionSanitized.split(/\s+/).filter((t) => t.length > 0);
  const words: string[] = [];
  let powerIndex: number | null = null;

  for (const token of tokens) {
    if (token === MARKER) {
      // Standalone marker: everything already pushed is in power.
      if (powerIndex === null) powerIndex = words.length - 1;
      continue;
    }

    if (token.includes(MARKER)) {
      // Defensive: marker fused to a neighbouring word, e.g. "their(*)".
      const stripped = token.split(MARKER).join('').trim();
      if (stripped.length > 0) words.push(stripped);
      if (powerIndex === null) powerIndex = words.length - 1;
      continue;
    }

    words.push(token);
  }

  // A marker before any word leaves nothing in power.
  if (powerIndex !== null && powerIndex < 0) powerIndex = null;

  return { words, powerIndex };
}

/**
 * Was a buzz at `buzzWordIndex` inside power?
 *
 * `buzzWordIndex` is the index of the last word the player had seen. The
 * boundary is inclusive: buzzing on the final in-power word still powers.
 */
export function isPower(
  buzzWordIndex: number | null,
  powerIndex: number | null,
): boolean {
  if (buzzWordIndex === null || powerIndex === null) return false;
  return buzzWordIndex <= powerIndex;
}

/** Strips HTML tags for plain-text rendering or search. */
export function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Converts a pyramidal tossup giveaway into Ohio Academic Competition phrasing.
 *
 * HSAPQ built their OAC rounds from their pyramidal bank by exactly this
 * transformation, verified by the same Truman question appearing in both their
 * VHSL set and their OAC set differing only in this clause.
 */
export function toOacPhrasing(questionSanitized: string): string {
  const GIVEAWAY = 'for (?:10|ten) points(?: each)?';

  return (
    questionSanitized
      .split(MARKER)
      .join('')
      // When the giveaway opens a sentence, removing it leaves the following
      // word lowercase mid-paragraph. Re-capitalize it.
      .replace(
        new RegExp(`(^|[.!?]["')\\]]?\\s+)${GIVEAWAY},?\\s*([a-z])`, 'gi'),
        (_m, lead: string, ch: string) => `${lead}${ch.toUpperCase()}`,
      )
      // Any remaining mid-sentence occurrence just collapses to a space.
      .replace(new RegExp(`,?\\s*${GIVEAWAY},?\\s*`, 'gi'), ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^([a-z])/, (m) => m.toUpperCase())
  );
}
