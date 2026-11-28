/**
 * Starred practice: replay the tossups the player starred with `S`.
 *
 * Wraps Tossup with a `TossupSource` over a snapshot of `listStarred()` taken
 * when the round starts, so unstarring a question mid-round (the star toggle
 * still works here) doesn't reshuffle what's left. When the snapshot runs
 * out, Tossup calls `onEnd` and this screen shows its own finish sheet rather
 * than Tossup's "nothing came back from QB Reader" dry state, which would be
 * the wrong explanation here.
 */

import RankLoader from '../RankLoader';
import { useCallback, useEffect, useState } from 'react';
import Tossup, { type TossupSource } from './Tossup';
import { Button, Sheet } from '../ui';
import { listStarred } from '../data/starred';
import type { Tossup as TossupQuestion } from '../types';

type Phase = 'loading' | 'empty' | 'playing' | 'finished';

/**
 * A TossupSource over a fixed snapshot: serves `list` in order, then null.
 * Copies the list so later changes to the starred store (unstarring mid-round)
 * can't alter what's left to play.
 */
export function snapshotSource(list: readonly TossupQuestion[], onEnd: () => void): TossupSource {
  const queue = list.slice();
  return {
    async next() {
      return queue.shift() ?? null;
    },
    onEnd,
  };
}

export interface StarredProps {
  onExit(): void;
}

export default function Starred({ onExit }: StarredProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [total, setTotal] = useState(0);
  // Bumped on "Go again" so Tossup remounts with a fresh source.
  const [round, setRound] = useState(0);
  const [source, setSource] = useState<TossupSource | null>(null);

  const begin = useCallback(async () => {
    setPhase('loading');
    const list = await listStarred();
    setSource(snapshotSource(list, () => setPhase('finished')));
    setTotal(list.length);
    setPhase(list.length === 0 ? 'empty' : 'playing');
    setRound((r) => r + 1);
  }, []);

  useEffect(() => {
    void begin();
  }, [begin]);

  if (phase === 'playing' && source) {
    return (
      <Tossup
        key={round}
        title={`Starred · ${total}`}
        onExit={onExit}
        source={source}
      />
    );
  }

  return (
    <>
      <header className="topbar">
        <h1 className="topbar__title">Starred</h1>
        <div className="topbar__right">
          <Button variant="ghost" small onClick={onExit}>
            Done
          </Button>
        </div>
      </header>
      <div className="app__body">
        {phase === 'loading' ? (
          <RankLoader label="Gathering your starred questions" />
        ) : phase === 'empty' ? (
          <Sheet title="Nothing starred yet">
            <p className="tiny muted">
              While playing Tossups, press <kbd>S</kbd> (or tap the ☆) on any
              question you want to come back to. Starred questions are kept on
              this device until you unstar them, and they show up here.
            </p>
          </Sheet>
        ) : (
          <Sheet title="That's all of them">
            <p className="tiny muted">
              You went through all {total} starred{' '}
              {total === 1 ? 'question' : 'questions'}. Unstar any you've got
              down cold, and keep the rest for next time.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="primary" onClick={() => void begin()}>
                Go again
              </Button>
              <Button variant="ghost" onClick={onExit}>
                Back to practice
              </Button>
            </div>
          </Sheet>
        )}
      </div>
    </>
  );
}
