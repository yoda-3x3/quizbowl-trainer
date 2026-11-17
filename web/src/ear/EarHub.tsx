/**
 * Both ear drills behind one entry, so the practice grid does not grow a
 * seventh card for what is really two views of the same subject.
 *
 * Wraps the existing clip drill rather than editing it: that screen works and
 * is well tested, and a wrapper keeps this addition from being able to break
 * it.
 */

import { useState } from 'react';
import EarTraining from '../screens/EarTraining';
import MotifStudy from './MotifStudy';

type Drill = 'clip' | 'motif';

const DRILLS: { id: Drill; label: string; blurb: string }[] = [
  {
    id: 'clip',
    label: 'Name the clip',
    blurb: 'Hear an excerpt and identify it.',
  },
  {
    id: 'motif',
    label: 'Build from motifs',
    blurb: 'Assemble the passage from described motifs, as a tossup would.',
  },
];

export default function EarHub() {
  const [drill, setDrill] = useState<Drill>('clip');
  const active = DRILLS.find((d) => d.id === drill) ?? DRILLS[0]!;

  return (
    <div className="stack">
      <div className="chips" role="tablist" aria-label="Ear drill">
        {DRILLS.map((d) => (
          <button
            key={d.id}
            type="button"
            role="tab"
            className="chip"
            aria-pressed={d.id === drill}
            aria-selected={d.id === drill}
            onClick={() => setDrill(d.id)}
          >
            {d.label}
          </button>
        ))}
      </div>

      <p className="tiny muted">{active.blurb}</p>

      {drill === 'clip' ? <EarTraining /> : <MotifStudy />}
    </div>
  );
}
