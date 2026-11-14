/**
 * Bonus practice: leadin, then one part at a time.
 *
 * Parts are worth 10 unless `values` says otherwise. `answers` may be shorter
 * or longer than `parts` in a handful of upstream sets, so the pairing is built
 * once by `bonusPlan()` and the screen never indexes the raw arrays.
 *
 * There is no bundled bonus pack, so the IndexedDB cache in `data/cache.ts` is
 * the only offline source here.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { fetchBonuses } from '../data/qbreader';
import { cacheBonuses, cachedBonuses, pickUnseen } from '../data/cache';
import { judge } from '../engine/judge';
import { scoreBonusPart } from '../engine/scoring';
import { append, all } from '../engine/log';
import { summary } from '../learn/derive';
import {
  Button,
  PillRow,
  Sheet,
  StatPill,
  TextInput,
  filtersFrom,
  pct,
  useSettings,
} from '../ui';
import type { AttemptEvent, Bonus as BonusQuestion, Directive } from '../types';

export const DEFAULT_PART_VALUE = 10;

export interface BonusPart {
  index: number;
  prompt: string;
  /** HTML answerline, preferred by the judge for typo tolerance. */
  answer: string;
  answerSanitized: string;
  value: number;
}

export interface BonusPlan {
  parts: BonusPart[];
  /** True when `answers` and `parts` disagreed and we trimmed to the shorter. */
  truncated: boolean;
  max: number;
}

/** Pairs parts with answers defensively and resolves each part's value. */
export function bonusPlan(bonus: BonusQuestion): BonusPlan {
  const n = Math.min(bonus.parts.length, bonus.answers.length);
  const parts: BonusPart[] = [];
  for (let i = 0; i < n; i++) {
    const answer = bonus.answers[i] ?? '';
    parts.push({
      index: i,
      prompt: bonus.partsSanitized[i] ?? bonus.parts[i] ?? '',
      answer,
      answerSanitized: bonus.answersSanitized[i] ?? answer,
      value: bonus.values?.[i] ?? DEFAULT_PART_VALUE,
    });
  }
  return {
    parts,
    truncated: bonus.parts.length !== bonus.answers.length,
    max: parts.reduce((a, p) => a + p.value, 0),
  };
}

interface PartResult {
  directive: Directive;
  given: string;
  points: number;
}

export interface BonusProps {
  onExit(): void;
}

export default function Bonus({ onExit }: BonusProps) {
  const [settings] = useSettings();
  const inputRef = useRef<HTMLInputElement>(null);
  const poolRef = useRef<BonusQuestion[]>([]);
  const seenRef = useRef<Set<string>>(new Set());

  const [current, setCurrent] = useState<BonusQuestion | null>(null);
  const [results, setResults] = useState<PartResult[]>([]);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [given, setGiven] = useState('');
  const [events, setEvents] = useState<AttemptEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [dry, setDry] = useState(false);

  const filters = useMemo(() => filtersFrom(settings), [settings]);

  // A filter change invalidates the prefetched pool, same as the tossup queue.
  useEffect(() => {
    poolRef.current = [];
  }, [filters]);

  const loadNext = useCallback(async () => {
    setLoading(true);
    setResults([]);
    setPrompt(null);
    setGiven('');
    setDry(false);

    if (poolRef.current.length === 0) {
      try {
        const batch = await fetchBonuses(filters, 20);
        poolRef.current = batch.filter((b) => !seenRef.current.has(b.id));
        setOffline(false);
        if (batch.length > 0) void cacheBonuses(batch);
      } catch {
        setOffline(true);
        const cached = pickUnseen(await cachedBonuses(), seenRef.current);
        poolRef.current = cached ? [cached] : [];
      }
    }

    const next = poolRef.current.shift() ?? null;
    setLoading(false);

    if (!next) {
      setCurrent(null);
      setDry(true);
      return;
    }
    seenRef.current.add(next.id);
    setCurrent(next);
  }, [filters]);

  useEffect(() => {
    void all().then(setEvents);
  }, []);

  useEffect(() => {
    void loadNext();
    // Once on mount; loadNext re-runs on demand and on a filter change below.
  }, [loadNext]);

  const plan = useMemo(() => (current ? bonusPlan(current) : null), [current]);
  const partIndex = results.length;
  const activePart = plan?.parts[partIndex] ?? null;
  const complete = plan !== null && partIndex >= plan.parts.length;

  useEffect(() => {
    if (activePart) inputRef.current?.focus();
  }, [activePart, prompt]);

  const record = useCallback(
    (part: BonusPart, directive: Directive, answer: string) => {
      if (!current) return;
      const points = scoreBonusPart(directive === 'accept', part.value);
      const event: AttemptEvent = {
        id: `${current.id}-${part.index}-${Date.now()}`,
        at: Date.now(),
        mode: 'bonus',
        questionId: `${current.id}#${part.index}`,
        category: current.category,
        subcategory: current.subcategory,
        difficulty: current.difficulty,
        buzzWordIndex: null,
        totalWords: part.prompt.split(/\s+/).filter(Boolean).length,
        powerWordIndex: null,
        givenAnswer: answer,
        directive,
        points,
        msToAnswer: null,
        questionSnapshot: {
          questionSanitized: part.prompt,
          answerSanitized: part.answerSanitized,
          setName: current.setName,
        },
      };
      void append(event).then(() => all().then(setEvents));
      setResults((prev) => [...prev, { directive, given: answer, points }]);
    },
    [current],
  );

  const onSubmit = useCallback(
    (ev: FormEvent) => {
      ev.preventDefault();
      if (!activePart) return;
      const answer = given.trim();
      if (answer.length === 0) return;

      const judgement = judge(
        activePart.answer || activePart.answerSanitized,
        answer,
        settings.strictness,
      );

      // A prompt keeps the part open, exactly as a moderator would.
      if (judgement.directive === 'prompt') {
        setPrompt(judgement.directedPrompt ?? 'Be more specific');
        setGiven('');
        return;
      }

      setPrompt(null);
      setGiven('');
      record(activePart, judgement.directive, answer);
    },
    [activePart, given, record, settings.strictness],
  );

  const skipPart = useCallback(() => {
    if (!activePart) return;
    setPrompt(null);
    setGiven('');
    record(activePart, 'reject', '');
  }, [activePart, record]);

  const earned = results.reduce((a, r) => a + r.points, 0);
  const stats = useMemo(() => summary(events), [events]);

  return (
    <>
      <header className="topbar">
        <h1 className="topbar__title">Bonuses</h1>
        <div className="topbar__right">
          <Button variant="ghost" small onClick={onExit}>
            Done
          </Button>
        </div>
      </header>

      <div className="app__body">
        <PillRow>
          <StatPill label="heard" value={String(stats.heard)} />
          <StatPill label="acc" value={pct(stats.accuracy)} />
          <StatPill label="pts" value={String(stats.points)} tone="accent" />
          {plan ? (
            <StatPill
              label="this bonus"
              value={`${earned}/${plan.max}`}
              tone={earned > 0 ? 'good' : 'neutral'}
            />
          ) : null}
        </PillRow>

        <div className="meta">
          <span>
            {current
              ? `${current.category} / ${current.subcategory}`
              : loading
                ? 'loading'
                : 'no bonus'}
          </span>
          <span>
            {current ? `${current.setName} / diff ${current.difficulty}` : ''}
            {offline ? ' / cached' : ''}
          </span>
        </div>

        {current && plan ? (
          <Sheet>
            <p className="read">{current.leadinSanitized}</p>

            {plan.truncated ? (
              <p className="banner banner--warn">
                This bonus has {current.parts.length} parts but{' '}
                {current.answers.length} answers upstream, so it is being played
                as {plan.parts.length}.
              </p>
            ) : null}

            {plan.parts.map((part, i) => {
              const res = results[i];
              if (i > partIndex) return null;
              return (
                <div
                  key={part.index}
                  className={`part${res ? ' part--done' : ''}`}
                >
                  <div className="part__head">
                    <span>
                      part {i + 1} of {plan.parts.length}
                    </span>
                    <span className="nums">
                      {res
                        ? `${res.points}/${part.value}`
                        : `${part.value} points`}
                    </span>
                  </div>
                  <p className="read">{part.prompt}</p>

                  {res ? (
                    <div
                      className={`banner ${
                        res.directive === 'accept'
                          ? 'banner--good'
                          : 'banner--bad'
                      }`}
                    >
                      <strong>
                        {res.directive === 'accept' ? 'Correct' : 'Incorrect'}
                      </strong>
                      <p className="answerline">{part.answerSanitized}</p>
                      {res.given ? (
                        <span className="tiny muted">you said: {res.given}</span>
                      ) : (
                        <span className="tiny muted">no answer given</span>
                      )}
                    </div>
                  ) : (
                    <>
                      {prompt ? (
                        <div className="banner banner--prompt" role="status">
                          <strong>Prompt</strong> {prompt}
                        </div>
                      ) : null}
                      <form className="answer-form" onSubmit={onSubmit}>
                        <TextInput
                          ref={inputRef}
                          value={given}
                          onChange={(e) => setGiven(e.target.value)}
                          placeholder={
                            prompt
                              ? 'be more specific, then Enter'
                              : 'your answer, then Enter'
                          }
                          autoComplete="off"
                          autoCorrect="off"
                          spellCheck={false}
                          aria-label={`Answer to part ${i + 1}`}
                        />
                        <Button type="submit">Submit</Button>
                      </form>
                      <Button variant="ghost" small onClick={skipPart}>
                        I do not know
                      </Button>
                    </>
                  )}
                </div>
              );
            })}
          </Sheet>
        ) : null}

        {complete ? (
          <Button
            variant="primary"
            block
            onClick={() => void loadNext()}
            disabled={loading}
          >
            Next bonus ({earned}/{plan?.max ?? 0})
          </Button>
        ) : null}

        {dry ? (
          <Sheet title="No bonuses">
            <p className="tiny muted">
              QB Reader could not be reached and nothing is cached yet. Bonuses
              have no bundled offline pack, so play a few online first and they
              will be available later.
            </p>
            <Button small onClick={() => void loadNext()}>
              Try again
            </Button>
          </Sheet>
        ) : null}
      </div>
    </>
  );
}
