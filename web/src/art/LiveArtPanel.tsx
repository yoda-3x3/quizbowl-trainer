/**
 * The vision trainer running inside a live tossup.
 *
 * As the reader reveals words, any curated artwork element those words
 * describe appears on the canvas. The painting assembles clue by clue, and the
 * moment it becomes recognisable is the moment to buzz.
 *
 * The artwork is chosen from the ANSWER line, which the player never sees
 * while reading. That is safe because the title is withheld until the question
 * resolves, and it is the only reliable way to know which work a clue stack is
 * circling, since good clues deliberately avoid naming it.
 *
 * Renders nothing at all when the question is not about a work in the curated
 * set, which is most of the time. Showing the wrong painting would be far
 * worse than showing none.
 */

import { useMemo } from 'react';
import RevealCanvas from './RevealCanvas';
import { findArtwork, revealsFor } from './match';
import type { Tossup } from '../types';
import './art.css';

export interface LiveArtPanelProps {
  tossup: Tossup | null;
  /** The full word list from the reader. */
  words: string[];
  /** How many of them have been read aloud so far. */
  revealed: number;
  /** True once the question is over, which unmasks the whole work. */
  resolved: boolean;
}

export default function LiveArtPanel({
  tossup,
  words,
  revealed,
  resolved,
}: LiveArtPanelProps) {
  const artwork = useMemo(
    () => (tossup ? findArtwork(tossup.answer || tossup.answerSanitized) : null),
    [tossup],
  );

  // Only the words actually read so far may trigger a reveal. Slicing here
  // rather than inside the matcher keeps the matcher pure and testable.
  const heard = useMemo(
    () => words.slice(0, Math.max(0, revealed)),
    [words, revealed],
  );

  const reveals = useMemo(
    () => (artwork ? revealsFor(artwork, heard) : []),
    [artwork, heard],
  );

  if (!artwork) return null;

  return (
    <RevealCanvas
      artwork={artwork}
      reveals={reveals}
      showAll={resolved}
      className="reveal--live"
    />
  );
}
