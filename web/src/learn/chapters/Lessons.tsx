/**
 * Chapter 3 of the Learn tab: lessons.
 *
 * Device family: lateral pan. The stage sticks while the page scrolls past it
 * and the track of cards travels sideways. Lateral movement reads as breadth,
 * which is what this chapter is: here is the ground you have not covered.
 * Another vertical argument after chapters 1 and 2 would read as a third
 * helping of the same sentence.
 *
 * The content is the most-asked answers for the subcategories chapter 1 just
 * exposed, from the question bank's frequency list.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { weakSpots } from '../derive';
import { fetchFrequencyList, type FrequencyEntry } from '../../data/qbreader';
import type { AttemptEvent } from '../../types';

export interface LessonsProps {
  events: AttemptEvent[];
  /** How many weak subcategories to build lessons for. */
  subcategoryLimit?: number;
  /** Rows per card. */
  rowLimit?: number;
}

interface Lesson {
  subcategory: string;
  rows: FrequencyEntry[];
}

type Load = 'idle' | 'loading' | 'ready' | 'unreachable';

/** Scroll progress through a tall section, 0 at the top, 1 at the bottom. */
export function panProgress(
  top: number,
  height: number,
  viewportHeight: number,
): number {
  const travel = height - viewportHeight;
  if (travel <= 0) return 0;
  const p = -top / travel;
  // `<= 0` rather than `< 0`, so a top of exactly 0 cannot return negative
  // zero and surprise a strict comparison downstream.
  return p <= 0 ? 0 : p > 1 ? 1 : p;
}

/** Horizontal offset in px for the track at progress `p`. Never positive. */
export function panOffset(
  p: number,
  trackWidth: number,
  stageWidth: number,
): number {
  const max = Math.max(0, trackWidth - stageWidth);
  const clamped = p < 0 ? 0 : p > 1 ? 1 : p;
  const offset = -clamped * max;
  return offset === 0 ? 0 : offset;
}

function reducedMotion(): boolean {
  return (
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export default function Lessons({
  events,
  subcategoryLimit = 4,
  rowLimit = 10,
}: LessonsProps) {
  const subs = useMemo(
    () =>
      weakSpots(events)
        .slice(0, subcategoryLimit)
        .map((s) => s.subcategory),
    [events, subcategoryLimit],
  );
  const key = subs.join('|');

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [load, setLoad] = useState<Load>('idle');

  useEffect(() => {
    if (subs.length === 0) {
      setLessons([]);
      setLoad('idle');
      return;
    }
    let alive = true;
    setLoad('loading');
    (async () => {
      const out: Lesson[] = [];
      try {
        for (const subcategory of subs) {
          const rows = await fetchFrequencyList(subcategory, 40);
          out.push({ subcategory, rows: rows.slice(0, rowLimit) });
        }
      } catch {
        // The bank is behind a network. Say so in words rather than drawing an
        // empty card; the rest of the tab works offline because it is derived.
        if (alive) {
          setLessons(out);
          setLoad(out.length > 0 ? 'ready' : 'unreachable');
        }
        return;
      }
      if (alive) {
        setLessons(out);
        setLoad('ready');
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, rowLimit]);

  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  const cards = lessons.filter((l) => l.rows.length > 0);
  const canPan = cards.length > 1 && !reducedMotion();

  useEffect(() => {
    if (!canPan) {
      setProgress(0);
      const track = trackRef.current;
      if (track) track.style.transform = '';
      return;
    }

    let raf = 0;
    const apply = () => {
      raf = 0;
      const section = sectionRef.current;
      const stage = stageRef.current;
      const track = trackRef.current;
      if (!section || !stage || !track) return;
      const rect = section.getBoundingClientRect();
      const p = panProgress(rect.top, rect.height, window.innerHeight);
      const x = panOffset(p, track.scrollWidth, stage.clientWidth);
      track.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0)`;
      setProgress(p);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };

    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [canPan, cards.length]);

  const status =
    load === 'loading'
      ? 'loading the frequency list'
      : cards.length > 0
        ? `${cards.length} subcategor${cards.length === 1 ? 'y' : 'ies'}, most asked first`
        : 'nothing to drill yet';

  return (
    <section
      className={[
        'chapter',
        'lessons',
        canPan ? 'lessons--panning' : 'lessons--static',
      ].join(' ')}
      ref={sectionRef}
      aria-labelledby="learn-lessons"
    >
      {cards.length === 0 ? (
        <>
          <header className="chapter__head">
            <h2 className="chapter__label" id="learn-lessons">
              Lessons
            </h2>
            <span className="chapter__status">{status}</span>
          </header>
          <div className="chapter__body">
            <Nothing load={load} hasWeakSpots={subs.length > 0} />
          </div>
        </>
      ) : (
        /* Head, cards and readout all sit inside the sticky stage, so the
           label does not scroll away while the track is still travelling. */
        <div className="lessons__stage" ref={stageRef}>
          <header className="chapter__head">
            <h2 className="chapter__label" id="learn-lessons">
              Lessons
            </h2>
            <span className="chapter__status">{status}</span>
          </header>
          <div className="chapter__body">
            <div className="lessons__viewport">
              <div className="lessons__track" ref={trackRef}>
                {cards.map((lesson) => (
                  <article className="lessons__card" key={lesson.subcategory}>
                    <header className="lessons__card-head">
                      <span className="lessons__card-title">
                        {lesson.subcategory}
                      </span>
                      <span className="lessons__card-sub">
                        {lesson.rows.length} most asked answers
                      </span>
                    </header>
                    <ol className="lessons__list">
                      {lesson.rows.map((row) => (
                        <li className="lessons__item" key={row.answer}>
                          <span className="lessons__answer">{row.answer}</span>
                          <span className="lessons__count">{row.count}x</span>
                        </li>
                      ))}
                    </ol>
                  </article>
                ))}
              </div>
            </div>
            {canPan ? (
              <p className="lessons__pos">
                {Math.min(cards.length, Math.floor(progress * cards.length) + 1)}
                {' of '}
                {cards.length} across. Keep scrolling to travel sideways.
              </p>
            ) : (
              <p className="lessons__pos">
                {cards.length} card{cards.length === 1 ? '' : 's'}. Swipe
                sideways to read across.
              </p>
            )}
            <p className="chapter__close">
              Drawn from the question bank's frequency list for the
              subcategories you are weakest in. An answer asked thirty times is
              a lesson, not a trivia fact.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function Nothing({
  load,
  hasWeakSpots,
}: {
  load: Load;
  hasWeakSpots: boolean;
}) {
  if (load === 'loading') {
    return (
      <div className="empty">
        <p className="empty__line">Fetching the most-asked answers.</p>
        <p className="empty__hint">
          One request per weak subcategory, straight from the question bank.
        </p>
      </div>
    );
  }

  if (load === 'unreachable') {
    return (
      <div className="empty">
        <p className="empty__line">
          The question bank is unreachable, so there are no lessons to show.
        </p>
        <p className="empty__hint">
          Frequency lists are the only part of this tab that needs the network.
          Everything else is derived from your own attempt log and still reads
          offline.
        </p>
      </div>
    );
  }

  return (
    <div className="empty empty--act">
      <p className="empty__line">
        {hasWeakSpots
          ? 'No frequency list came back for your weak subcategories.'
          : 'No lessons yet, because nothing is weak yet.'}
      </p>
      <p className="empty__hint">
        {hasWeakSpots
          ? 'The bank has no frequency data for these subcategories. Drill a different one and this chapter fills in.'
          : 'Lessons follow chapter one. Once a subcategory has three attempts against it, the most-asked answers for it land here.'}
      </p>
    </div>
  );
}
