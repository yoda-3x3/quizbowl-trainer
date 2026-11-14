/**
 * Chapter 4 of the Learn tab: progress.
 *
 * Device family: a wipe. This beat is a change of state, from the player you
 * were to the player you are, so the past distribution is drawn first and the
 * present one is wiped across it with `clip-path`. A fade would say the past is
 * dissolving; a wipe says it has been replaced.
 *
 * The close resolves: it lands on a sentence with your own numbers in it and
 * then stops. Nothing fades out.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { buzzDistribution, progressOverTime, summary } from '../derive';
import { pct } from '../../ui';
import type { AttemptEvent, BuzzBucket, ProgressPoint } from '../../types';

export interface ProgressProps {
  events: AttemptEvent[];
}

/**
 * How far the wipe is open, from the chart's distance to the top of the
 * viewport. It opens as the chart rises through the lower half of the screen
 * and stays open once it has.
 */
export function wipeAmount(top: number, viewportHeight: number): number {
  const start = viewportHeight * 0.88;
  const travel = Math.max(1, viewportHeight * 0.42);
  const p = (start - top) / travel;
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

/** Bar height as a percentage of the plot, normalized to the tallest bucket. */
export function barHeight(count: number, max: number): number {
  if (max <= 0) return 0;
  return Math.round((count / max) * 1000) / 10;
}

export function markPct(fraction: number): number {
  const f = fraction < 0 ? 0 : fraction > 1 ? 1 : fraction;
  return Math.round(f * 98 * 100) / 100;
}

function reducedMotion(): boolean {
  return (
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function weekLabel(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

interface Split {
  weeks: ProgressPoint[];
  then: BuzzBucket[];
  now: BuzzBucket[];
  thenMean: number | null;
  nowMean: number | null;
  hasThen: boolean;
}

/** Splits the log at the halfway week, so "then" and "now" are real cohorts. */
function split(events: AttemptEvent[]): Split {
  const weeks = progressOverTime(events);
  const boundary =
    weeks.length > 1 ? weeks[Math.floor(weeks.length / 2)]?.weekStart : undefined;

  if (boundary === undefined) {
    return {
      weeks,
      then: [],
      now: buzzDistribution(events),
      thenMean: null,
      nowMean: summary(events).meanBuzzFraction,
      hasThen: false,
    };
  }

  const past = events.filter((e) => e.at < boundary);
  const present = events.filter((e) => e.at >= boundary);
  return {
    weeks,
    then: buzzDistribution(past),
    now: buzzDistribution(present),
    thenMean: summary(past).meanBuzzFraction,
    nowMean: summary(present).meanBuzzFraction,
    hasThen: past.length > 0 && present.length > 0,
  };
}

export default function Progress({ events }: ProgressProps) {
  const data = useMemo(() => split(events), [events]);
  const chartRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(() => (reducedMotion() ? 1 : 0));

  const animate = data.hasThen && !reducedMotion();

  useEffect(() => {
    if (!animate) {
      setOpen(1);
      return;
    }
    let raf = 0;
    const apply = () => {
      raf = 0;
      const node = chartRef.current;
      if (!node) return;
      setOpen(wipeAmount(node.getBoundingClientRect().top, window.innerHeight));
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
  }, [animate]);

  if (events.length === 0) {
    return (
      <section className="chapter" aria-labelledby="learn-progress">
        <header className="chapter__head">
          <h2 className="chapter__label" id="learn-progress">
            Progress
          </h2>
          <span className="chapter__status">no history yet</span>
        </header>
        <div className="chapter__body">
          <div className="empty empty--act">
            <p className="empty__line">
              There is no before and after yet, so there is nothing to compare.
            </p>
            <p className="empty__hint">
              This chapter wipes your earliest weeks across your most recent
              ones and shows where in the question you buzz. It needs two weeks
              of practice before it has anything honest to say.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const thenMax = Math.max(1, ...data.then.map((b) => b.count));
  const nowMax = Math.max(1, ...data.now.map((b) => b.count));
  const totals = summary(events);

  return (
    <section className="chapter" aria-labelledby="learn-progress">
      <header className="chapter__head">
        <h2 className="chapter__label" id="learn-progress">
          Progress
        </h2>
        <span className="chapter__status">
          {data.weeks.length} week{data.weeks.length === 1 ? '' : 's'} tracked,{' '}
          {totals.heard} heard
        </span>
      </header>

      <div className="chapter__body prog">
        <div className="prog__chart" ref={chartRef}>
          <div className="prog__layer" aria-hidden={data.hasThen ? undefined : 'true'}>
            {(data.hasThen ? data.then : data.now).map((b) => (
              <span
                className="prog__bar prog__bar--then"
                key={`then-${b.decile}`}
                style={{
                  height: `${barHeight(b.count, data.hasThen ? thenMax : nowMax)}%`,
                }}
              />
            ))}
          </div>
          <div
            className="prog__layer prog__layer--now"
            style={{ clipPath: `inset(0 ${((1 - open) * 100).toFixed(1)}% 0 0)` }}
          >
            {data.now.map((b) => (
              <span
                className="prog__bar prog__bar--now"
                key={`now-${b.decile}`}
                style={{ height: `${barHeight(b.count, nowMax)}%` }}
              />
            ))}
          </div>
          <div className="prog__scale" aria-hidden="true">
            {data.now.map((b) => (
              <span key={`scale-${b.decile}`}>{b.decile * 10}</span>
            ))}
          </div>
        </div>

        <div className="prog__legend">
          {data.hasThen ? (
            <span>
              <span className="prog__swatch prog__swatch--then" />
              earlier weeks
            </span>
          ) : null}
          <span>
            <span className="prog__swatch prog__swatch--now" />
            {data.hasThen ? 'recent weeks' : 'every buzz so far'}
          </span>
          <span>buzz point, percent through the question</span>
        </div>

        <div className="prog__weeks">
          {data.weeks.map((w) => (
            <div className="prog__week" key={w.weekStart}>
              <span className="prog__week-date">{weekLabel(w.weekStart)}</span>
              <span className="prog__week-rail" aria-hidden="true">
                {w.meanBuzzFraction !== null ? (
                  <span
                    className="prog__week-slide"
                    style={{
                      transform: `translateX(${markPct(w.meanBuzzFraction)}%)`,
                    }}
                  >
                    <span className="prog__week-bar" />
                  </span>
                ) : null}
              </span>
              <span className="prog__week-acc">
                {pct(w.accuracy)}
                <span className="muted"> acc</span>
              </span>
            </div>
          ))}
        </div>

        <p className="chapter__close chapter__close--resolved">{close(data, totals)}</p>
      </div>
    </section>
  );
}

/** The resolving sentence. Real numbers, present tense, full stop. */
function close(
  data: Split,
  totals: ReturnType<typeof summary>,
): string {
  if (data.hasThen && data.thenMean !== null && data.nowMean !== null) {
    const delta = data.thenMean - data.nowMean;
    const earlier = Math.round(delta * 1000) / 10;
    if (earlier >= 0.5) {
      return `You buzz at ${pct(data.nowMean)} of the question now, ${earlier}% of the question earlier than you did in your first weeks. ${pct(totals.accuracy)} of everything you have heard is converted, ${pct(totals.powerRate)} of it in power.`;
    }
    if (earlier <= -0.5) {
      return `You buzz at ${pct(data.nowMean)} of the question now, ${Math.abs(earlier)}% later than in your first weeks. Accuracy is ${pct(totals.accuracy)}; the buzz point is where the work is left.`;
    }
    return `Your buzz point is holding at ${pct(data.nowMean)} of the question across ${data.weeks.length} weeks, with ${pct(totals.accuracy)} converted. Steady, and now measured.`;
  }

  if (data.nowMean !== null) {
    return `One stretch of history so far: ${totals.heard} heard, ${pct(totals.accuracy)} converted, buzzing at ${pct(data.nowMean)} of the question. Another week of practice splits this into then and now.`;
  }

  return `${totals.heard} heard and ${pct(totals.accuracy)} converted, but no buzz landed yet, so there is no buzz point to place. Buzz earlier, even when you are wrong.`;
}
