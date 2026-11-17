/**
 * Which piece is a question about, and which motifs have the clues described?
 *
 * The same shape as the vision trainer's matcher, deliberately: the two drills
 * are the same idea applied to two senses, and keeping the logic parallel
 * means a fix to one is an obvious fix to the other.
 */

import type { Motif, MotifWork } from './motifs';
import { MOTIF_WORKS } from './motifs';

export interface MotifReveal {
  motif: Motif;
  wordIndex: number;
  matched: string;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9#\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function findMotifWork(answerLine: string): MotifWork | null {
  const hay = normalize(answerLine);
  if (!hay) return null;
  let best: MotifWork | null = null;
  let bestLen = 0;
  for (const work of MOTIF_WORKS) {
    for (const kw of work.answerKeywords) {
      const needle = normalize(kw);
      if (needle && hay.includes(needle) && needle.length > bestLen) {
        best = work;
        bestLen = needle.length;
      }
    }
  }
  return best;
}

interface Span {
  end: number;
  index: number;
}

function haystack(words: string[]): { text: string; spans: Span[] } {
  const spans: Span[] = [];
  let text = '';
  for (let i = 0; i < words.length; i++) {
    const w = normalize(words[i] ?? '');
    if (!w) continue;
    if (text) text += ' ';
    text += w;
    spans.push({ end: text.length, index: i });
  }
  return { text, spans };
}

function indexAt(spans: Span[], charEnd: number): number {
  for (const s of spans) if (charEnd <= s.end) return s.index;
  return spans.length > 0 ? (spans[spans.length - 1]?.index ?? 0) : 0;
}

export function motifRevealsFor(
  work: MotifWork,
  words: string[],
): MotifReveal[] {
  const { text, spans } = haystack(words);
  if (!text) return [];

  const found: MotifReveal[] = [];
  for (const motif of work.motifs) {
    let bestIndex: number | null = null;
    let bestMatch = '';
    for (const kw of motif.keywords) {
      const needle = normalize(kw);
      if (!needle) continue;
      const at = text.indexOf(needle);
      if (at === -1) continue;
      const idx = indexAt(spans, at + needle.length);
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
      found.push({ motif, wordIndex: bestIndex, matched: bestMatch });
    }
  }
  return found.sort((a, b) => a.wordIndex - b.wordIndex);
}

/** Least giving-away first, so the drill stays guessable. */
export function motifStudyOrder(work: MotifWork): Motif[] {
  return [
    ...work.motifs.filter((m) => !m.giveaway),
    ...work.motifs.filter((m) => m.giveaway),
  ];
}

/**
 * The segments to play, in clip order rather than mention order.
 *
 * Playing them as they were mentioned would scramble the music; playing them
 * in clip order means you hear the passage as written, with the parts nobody
 * described simply absent.
 */
export function playableSegments(
  motifs: Motif[],
): { start: number; end: number }[] {
  const sorted = [...motifs].sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const m of sorted) {
    const last = merged[merged.length - 1];
    // Butt-joined or overlapping segments become one, so playback does not
    // stutter at a boundary that is not a real musical seam.
    if (last && m.start <= last.end + 0.06) {
      last.end = Math.max(last.end, m.end);
    } else {
      merged.push({ start: m.start, end: m.end });
    }
  }
  return merged;
}

/** Total seconds of the recording the clues have accounted for. */
export function heardSeconds(motifs: Motif[]): number {
  return playableSegments(motifs).reduce((n, s) => n + (s.end - s.start), 0);
}
