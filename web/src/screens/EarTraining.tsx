/**
 * Ear training.
 *
 * A clip plays, you name the piece or the composer, and you may optionally
 * type the opening notes. Ported from the legacy Python screen, with four
 * things changed and one thing deliberately kept:
 *
 *  - Playback is a plain <audio controls> element. The legacy app used
 *    Windows-only `winsound` with fire-and-forget playback: no replay, no
 *    scrub, no volume, no way to hear the first second again. The native
 *    control gives all of that for nothing.
 *  - Answer checking goes through `judge()` rather than a substring test.
 *  - Note grading uses the fixed `notesMatch`, which grades the 23 parts that
 *    have real pitches instead of the 3 the Python version managed.
 *  - Every answer appends an AttemptEvent, so ear training shows up in Learn
 *    alongside tossups instead of incrementing two flat counters.
 *
 * KEPT: the honest distinction between a blind local clip and a YouTube
 * search, which may well show the answer in the result titles, and the rule
 * that the hint is shown only AFTER submitting. Several hints say what the
 * clip is not yet ("this comes well before the famous Ode to Joy tune
 * arrives"), so showing one on request would spoil the next clip in the set.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { judge } from '../engine/judge';
import { append } from '../engine/log';
import { notesMatch } from '../ear/match';
import {
  EAR_WORKS,
  clipUrl,
  earParts,
  hasLocalClip,
  searchUrl,
  type EarItem,
  type EarWork,
} from '../ear/works';
import type { AttemptEvent, Directive } from '../types';

/**
 * Standard repertoire: this is the Regular High School band of the QB Reader
 * difficulty scale, which is what the clip set was built for. The field is
 * required by AttemptEvent and the Learn tab buckets by it.
 */
const EAR_DIFFICULTY = 3;

/** Ten points for a correct identification. Ear training has no negs. */
const EAR_POINTS = 10;

interface Verdict {
  directive: Directive;
  correct: boolean;
  notes: boolean | null;
}

/**
 * Answerlines for everything that counts, one per candidate.
 *
 * `judge()` wants a single answerline, but these entries have a title, a list
 * of alternate titles and a composer, with no required-span markup anywhere.
 * Rather than synthesize one answerline and hope the checker splits it the way
 * we meant, each candidate is judged on its own and the most favourable
 * directive wins. For the composer the surname is marked as the required span,
 * which is the quizbowl convention and is what lets "Beethoven" accept against
 * "Ludwig van Beethoven".
 */
function answerlines(work: EarWork): string[] {
  const titles = [work.piece, ...work.accept].map((t) => `<b><u>${t}</u></b>`);
  const parts = work.composer.trim().split(/\s+/);
  const surname = parts[parts.length - 1] ?? work.composer;
  const given = parts.slice(0, -1).join(' ');
  const composer = given
    ? `${given} <b><u>${surname}</u></b>`
    : `<b><u>${surname}</u></b>`;
  return [...titles, composer];
}

/** The best directive any acceptable answer yields. */
function judgeWork(work: EarWork, given: string): Directive {
  let best: Directive = 'reject';
  for (const line of answerlines(work)) {
    const { directive } = judge(line, given);
    if (directive === 'accept') return 'accept';
    if (directive === 'prompt') best = 'prompt';
  }
  return best;
}

/** Fisher-Yates, so a session walks the whole set before repeating. */
function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = out[i];
    const b = out[j];
    if (a !== undefined && b !== undefined) {
      out[i] = b;
      out[j] = a;
    }
  }
  return out;
}

/**
 * Whether this browser can decode the bundled Ogg Opus clips.
 *
 * Checked rather than assumed: Ogg Opus only reached iOS Safari in 18.4, so
 * older iPhones get the YouTube fallback instead of a silent play button.
 */
function canPlayOpus(): boolean {
  if (typeof document === 'undefined') return true;
  const el = document.createElement('audio');
  if (typeof el.canPlayType !== 'function') return true;
  return el.canPlayType('audio/ogg; codecs=opus') !== '';
}

export default function EarTraining() {
  const items = useMemo(() => earParts(EAR_WORKS), []);
  const [queue, setQueue] = useState<EarItem[]>(() => shuffled(items));
  const [index, setIndex] = useState(0);

  const [answer, setAnswer] = useState('');
  const [notes, setNotes] = useState('');
  const [anyKey, setAnyKey] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [seen, setSeen] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);

  const shownAt = useRef(Date.now());
  const answerRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLInputElement>(null);
  const opusOk = useMemo(canPlayOpus, []);

  const item = queue[index] ?? queue[0];

  useEffect(() => {
    shownAt.current = Date.now();
    answerRef.current?.focus();
  }, [index]);

  const next = useCallback(() => {
    setAnswer('');
    setNotes('');
    setVerdict(null);
    setIndex((i) => {
      const n = i + 1;
      if (n >= queue.length) {
        setQueue(shuffled(items));
        return 0;
      }
      return n;
    });
  }, [items, queue.length]);

  const submit = useCallback((giveUp = false) => {
    if (!item || verdict) return;
    const directive: Directive = giveUp
      ? 'reject'
      : judgeWork(item.work, answer);
    const correct = directive === 'accept';
    const notesVerdict = giveUp
      ? null
      : notesMatch(notes, item.part.notes, {
          transpose: anyKey,
        });

    setVerdict({ directive, correct, notes: notesVerdict });
    setSeen((n) => n + 1);
    if (correct) setCorrectCount((n) => n + 1);

    const event: AttemptEvent = {
      id: `ear-${item.key}-${Date.now()}`,
      at: Date.now(),
      mode: 'ear',
      // The work's title, so repeated hearings of either movement of a piece
      // aggregate as one work in Learn.
      questionId: item.work.piece,
      category: 'Fine Arts',
      subcategory: 'Auditory Fine Arts',
      difficulty: EAR_DIFFICULTY,
      // A clip is not read word by word, so there is no buzz point to record.
      buzzWordIndex: null,
      totalWords: 0,
      powerWordIndex: null,
      givenAnswer: answer.trim(),
      directive,
      points: correct ? EAR_POINTS : 0,
      msToAnswer: Date.now() - shownAt.current,
      questionSnapshot: {
        questionSanitized: `${item.part.name} (${hasLocalClip(item.part) ? 'clip' : 'search'})`,
        answerSanitized: `${item.work.composer}, ${item.work.piece}`,
        setName: 'Ear training',
      },
    };
    void append(event);
  }, [answer, anyKey, item, notes, verdict]);

  if (!item) return <p className="placeholder">No clips available.</p>;

  const { work, part } = item;
  const url = clipUrl(part);
  const local = url !== null && opusOk;
  const done = verdict !== null;

  return (
    <div className="stack">
      <div className="row row--split">
        <span className="tiny muted">
          {local
            ? 'Blind clip. Nothing on screen names the piece.'
            : 'Search clip. The YouTube results may show the title, so read as little as you can.'}
        </span>
        <span className="tiny muted nums">
          {correctCount}/{seen} correct
        </span>
      </div>

      <div className="read read--card">
        {local && url ? (
          <audio
            key={url}
            className="ear__audio"
            style={{ width: '100%' }}
            controls
            preload="auto"
            src={url}
          />
        ) : (
          <div className="stack">
            <p className="banner banner--warn" style={{ margin: 0 }}>
              {url === null
                ? 'This theme has no bundled clip. Open a YouTube search instead.'
                : 'This browser cannot decode the bundled Opus clips. Open a YouTube search instead.'}
            </p>
            <a
              className="btn btn--primary"
              href={searchUrl(part)}
              target="_blank"
              rel="noreferrer noopener"
            >
              Open clip search
            </a>
          </div>
        )}

        {done ? (
          <div className="stack" style={{ marginTop: 14 }}>
            <p
              className={`banner ${verdict.correct ? 'banner--good' : 'banner--bad'}`}
              style={{ margin: 0 }}
            >
              {verdict.correct
                ? 'Correct.'
                : verdict.directive === 'prompt'
                  ? 'Close, but not specific enough.'
                  : 'Not this time.'}
            </p>
            <p className="answerline" style={{ margin: 0 }}>
              {work.composer}, {work.piece}
            </p>
            <p className="tiny muted" style={{ margin: 0 }}>
              {part.name}
            </p>
            {verdict.notes !== null ? (
              <p
                className={`banner ${verdict.notes ? 'banner--good' : 'banner--bad'}`}
                style={{ margin: 0 }}
              >
                {verdict.notes
                  ? `Notes: close enough. ${part.notes}`
                  : `Notes: not quite. Actual: ${part.notes}`}
              </p>
            ) : null}
            <p className="field__hint" style={{ margin: 0 }}>
              {part.hint}
            </p>
          </div>
        ) : null}
      </div>

      {done ? (
        <button className="btn btn--primary btn--block" onClick={next} autoFocus>
          Next clip
        </button>
      ) : (
        <div className="stack">
          <label className="field">
            <span className="field__label">piece or composer</span>
            <input
              ref={answerRef}
              className="field__input"
              value={answer}
              autoComplete="off"
              spellCheck={false}
              placeholder="either one counts"
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.shiftKey) {
                  e.preventDefault();
                  submit(true);
                  return;
                }
                if (e.key === 'Enter') {
                  e.preventDefault();
                  notesRef.current?.focus();
                }
              }}
            />
          </label>

          <label className="field">
            <span className="field__label">
              <span>opening notes (optional)</span>
            </span>
            <input
              ref={notesRef}
              className="field__input"
              value={notes}
              autoComplete="off"
              spellCheck={false}
              placeholder="e.g. G G G Eb"
              onChange={(e) => setNotes(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.shiftKey) {
                  e.preventDefault();
                  submit(true);
                  return;
                }
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submit(false);
                }
              }}
            />
            <span className="field__hint">
              Octaves and enharmonics are equivalent, and a partial answer
              counts as long as it is right as far as it goes.
            </span>
          </label>

          <label className="row tiny muted" style={{ gap: 8 }}>
            <input
              type="checkbox"
              checked={anyKey}
              onChange={(e) => setAnyKey(e.target.checked)}
            />
            <span>
              Accept any key, matching the intervals rather than the exact
              pitches.
            </span>
          </label>

          <button
            className="btn btn--primary btn--block"
            onClick={() => submit(false)}
          >
            Submit
          </button>
          <button
            className="btn btn--ghost btn--block"
            onClick={() => submit(true)}
          >
            I don't know
          </button>
        </div>
      )}
    </div>
  );
}
