/**
 * Deciding which artwork a question is about, and which of its elements the
 * clues have described so far.
 *
 * Pure and synchronous: no React, no DOM, no fetch. The live reader calls this
 * on every reveal tick, so it has to be cheap and it has to be testable.
 */

import type { ArtElement, Artwork, Reveal } from './types';
import { ARTWORKS } from './works';

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Which artwork is this question about?
 *
 * Matched against the answer line rather than the clues, because the clues
 * deliberately avoid naming the work. Returns null when nothing in the curated
 * set fits, which is the common case and must stay silent rather than guessing.
 */
export function findArtwork(answerLine: string): Artwork | null {
  const hay = normalize(answerLine);
  if (!hay) return null;

  let best: Artwork | null = null;
  let bestLen = 0;
  for (const art of ARTWORKS) {
    for (const kw of art.answerKeywords) {
      const needle = normalize(kw);
      if (needle && hay.includes(needle) && needle.length > bestLen) {
        best = art;
        bestLen = needle.length;
      }
    }
  }
  return best;
}

interface WordSpan {
  start: number;
  end: number;
  index: number;
}

/**
 * Joins words into one searchable string while keeping a map back to word
 * indices, so a multi-word keyword can report which word completed it.
 */
function buildHaystack(words: string[]): { text: string; spans: WordSpan[] } {
  const spans: WordSpan[] = [];
  let text = '';
  for (let i = 0; i < words.length; i++) {
    const w = normalize(words[i] ?? '');
    if (!w) continue;
    if (text) text += ' ';
    const start = text.length;
    text += w;
    spans.push({ start, end: text.length, index: i });
  }
  return { text, spans };
}

function wordIndexAt(spans: WordSpan[], charEnd: number): number {
  for (const s of spans) {
    if (charEnd <= s.end) return s.index;
  }
  return spans.length > 0 ? (spans[spans.length - 1]?.index ?? 0) : 0;
}

/**
 * Which elements have the clues described, given the words read so far?
 *
 * Returns them in the order the question revealed them, each tagged with the
 * word that triggered it. An element already matched stays matched: the image
 * only ever accumulates.
 */
export function revealsFor(
  artwork: Artwork,
  words: string[],
): Reveal[] {
  const { text, spans } = buildHaystack(words);
  if (!text) return [];

  const found: Reveal[] = [];

  for (const element of artwork.elements) {
    let bestIndex: number | null = null;
    let bestMatch = '';

    for (const kw of element.keywords) {
      const needle = normalize(kw);
      if (!needle) continue;
      const at = text.indexOf(needle);
      if (at === -1) continue;
      const idx = wordIndexAt(spans, at + needle.length);
      // Earliest trigger wins; on a tie prefer the more specific phrase.
      if (
        bestIndex === null ||
        idx < bestIndex ||
        (idx === bestIndex && needle.length > bestMatch.length)
      ) {
        bestIndex = idx;
        bestMatch = needle;
      }
    }

    if (bestIndex !== null) {
      found.push({ element, wordIndex: bestIndex, matched: bestMatch });
    }
  }

  return found.sort((a, b) => a.wordIndex - b.wordIndex);
}

/** Elements not yet described, for the study mode's "what is left" list. */
export function remainingElements(
  artwork: Artwork,
  reveals: Reveal[],
): ArtElement[] {
  const shown = new Set(reveals.map((r) => r.element.id));
  return artwork.elements.filter((e) => !shown.has(e.id));
}

/**
 * Study-mode ordering: least giving-away first, so the work stays guessable
 * for as long as possible. Within a tier, the authored order is kept.
 */
export function studyOrder(artwork: Artwork): ArtElement[] {
  const plain = artwork.elements.filter((e) => !e.giveaway);
  const giveaways = artwork.elements.filter((e) => e.giveaway);
  return [...plain, ...giveaways];
}

/** How much of the image area has been uncovered. Drives the progress read-out. */
export function revealedArea(reveals: Reveal[]): number {
  // Union is overkill; overlapping boxes just mean the number saturates, and
  // it is a progress hint rather than a measurement.
  const total = reveals.reduce(
    (n, r) => n + r.element.box.w * r.element.box.h,
    0,
  );
  return Math.min(1, total);
}
