/**
 * The ear trainer running inside a live tossup.
 *
 * Mirrors LiveArtPanel exactly: match the piece from the answer line, reveal
 * only what the words read so far have described, and render nothing when the
 * question is not about a piece we have motifs for.
 */

import { useMemo } from 'react';
import MotifReveal from './MotifReveal';
import { findMotifWork, motifRevealsFor } from './motifMatch';
import type { Tossup } from '../types';

export interface LiveEarPanelProps {
  tossup: Tossup | null;
  words: string[];
  revealed: number;
  resolved: boolean;
}

export default function LiveEarPanel({
  tossup,
  words,
  revealed,
  resolved,
}: LiveEarPanelProps) {
  const work = useMemo(
    () =>
      tossup ? findMotifWork(tossup.answer || tossup.answerSanitized) : null,
    [tossup],
  );

  const heard = useMemo(
    () => words.slice(0, Math.max(0, revealed)),
    [words, revealed],
  );

  const reveals = useMemo(
    () => (work ? motifRevealsFor(work, heard) : []),
    [work, heard],
  );

  if (!work) return null;

  return <MotifReveal work={work} reveals={reveals} showAll={resolved} />;
}
