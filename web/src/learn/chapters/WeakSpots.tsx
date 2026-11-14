/**
 * Chapter 1 of the Learn tab: weak spots.
 *
 * Device family: counting numbers. On entry every readout counts from zero to
 * its true value, once, and then the chapter is held still. That stillness is
 * deliberate: chapter 2 is the peak, and a page that is still moving when it
 * arrives has spent the silence before it.
 *
 * All numbers come from `weakSpots()` in derive.ts. Nothing is recomputed here.
 */

import { useEffect, useRef, useState } from 'react';
import { weakSpots } from '../derive';
import { pct } from '../../ui';
import type { AttemptEvent, WeakSpot } from '../../types';

export interface WeakSpotsProps {
  events: AttemptEvent[];
  /** How many subcategories to expose. Worst first. */
  limit?: number;
}

/** Minimum attempts before a subcategory counts as evidence of anything. */
const MIN_ATTEMPTS = 3;
const COUNT_MS = 820;

export function easeOutCubic(t: number): number {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return 1 - Math.pow(1 - clamped, 3);
}

/** Value of a counting readout at eased progress `p`. */
export function countTo(target: number, p: number): number {
  return target * easeOutCubic(p);
}

/**
 * Marker position as a percentage of the rail, kept just inside the right edge
 * so a 100% buzz point is still visible rather than clipped away.
 */
export function railPct(fraction: number): number {
  const f = fraction < 0 ? 0 : fraction > 1 ? 1 : fraction;
  return Math.round(f * 98 * 100) / 100;
}

export function accTone(accuracy: number): string {
  if (accuracy < 0.34) return 'weak__acc--low';
  if (accuracy < 0.67) return 'weak__acc--mid';
  return 'weak__acc--ok';
}

function reducedMotion(): boolean {
  return (
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Runs a 0..1 progress ramp the first time the element is in view. Under
 * reduced motion it reports 1 immediately, so the numbers are simply correct.
 */
function useCountOnEntry(): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [p, setP] = useState(() => (reducedMotion() ? 1 : 0));

  useEffect(() => {
    if (reducedMotion()) {
      setP(1);
      return;
    }
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setP(1);
      return;
    }

    let raf = 0;
    let started = false;
    const run = () => {
      const t0 = performance.now();
      const tick = () => {
        const elapsed = (performance.now() - t0) / COUNT_MS;
        setP(elapsed >= 1 ? 1 : elapsed);
        if (elapsed < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !started) {
            started = true;
            obs.disconnect();
            run();
          }
        }
      },
      { threshold: 0.2 },
    );
    obs.observe(node);

    return () => {
      obs.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return [ref, p];
}

export default function WeakSpots({ events, limit = 6 }: WeakSpotsProps) {
  const spots = weakSpots(events, MIN_ATTEMPTS);
  const shown = spots.slice(0, limit);
  const [ref, p] = useCountOnEntry();

  return (
    <section className="chapter" aria-labelledby="learn-weak">
      <header className="chapter__head">
        <h2 className="chapter__label" id="learn-weak">
          Weak spots
        </h2>
        <span className="chapter__status">
          {spots.length > 0
            ? `${spots.length} subcategor${spots.length === 1 ? 'y' : 'ies'} with ${MIN_ATTEMPTS}+ attempts`
            : 'no subcategory at threshold'}
        </span>
      </header>

      <div className="chapter__body" ref={ref}>
        {shown.length === 0 ? (
          <Nothing attempts={events.length} />
        ) : (
          <>
            <div className="weak">
              {shown.map((spot) => (
                <Row key={spot.subcategory} spot={spot} p={p} />
              ))}
            </div>
            <p className="chapter__close">
              Sorted worst first. A subcategory needs {MIN_ATTEMPTS} attempts
              before it appears, so one bad night cannot invent a weakness. The
              marker on each rail is where your buzzes land in the question;
              the faint line is the halfway point.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function Row({ spot, p }: { spot: WeakSpot; p: number }) {
  const acc = countTo(spot.accuracy, p);
  const correct = Math.round(countTo(spot.correct, p));
  const attempts = Math.round(countTo(spot.attempts, p));
  const buzz = spot.meanBuzzFraction;

  return (
    <div className="weak__row">
      <span className="weak__name">{spot.subcategory}</span>
      <span className="weak__meta">
        <span>{spot.category}</span>
        <span className="nums">
          {correct} of {attempts} correct
        </span>
        {buzz !== null ? (
          <span className="nums">buzz at {pct(countTo(buzz, p))}</span>
        ) : (
          <span>never buzzed</span>
        )}
        {spot.trend !== null ? (
          <span
            className={
              spot.trend > 0.001
                ? 'weak__trend--up'
                : spot.trend < -0.001
                  ? 'weak__trend--down'
                  : undefined
            }
          >
            {spot.trend > 0.001
              ? `improving ${pct(Math.abs(spot.trend))}`
              : spot.trend < -0.001
                ? `slipping ${pct(Math.abs(spot.trend))}`
                : 'flat'}
          </span>
        ) : (
          <span>trend needs more history</span>
        )}
      </span>
      <span className={['weak__acc', accTone(spot.accuracy)].join(' ')}>
        {pct(acc)}
      </span>
      <span className="weak__rail" aria-hidden="true">
        <span
          className="weak__rail-slide weak__rail-slide--ghost"
          style={{ transform: 'translateX(50%)' }}
        >
          <span className="weak__rail-bar" />
        </span>
        {buzz !== null ? (
          <span
            className="weak__rail-slide"
            style={{ transform: `translateX(${railPct(countTo(buzz, p))}%)` }}
          >
            <span className="weak__rail-bar" />
          </span>
        ) : null}
      </span>
    </div>
  );
}

/**
 * The written empty state. Two different situations, because "you have never
 * practised" and "you have practised, but nothing has 3 attempts yet" deserve
 * different sentences.
 */
function Nothing({ attempts }: { attempts: number }) {
  return (
    <div className="empty empty--act">
      {attempts === 0 ? (
        <>
          <p className="empty__line">
            Nothing to expose yet. Your attempt log is empty.
          </p>
          <p className="empty__hint">
            Read a few tossups in Practice and this fills itself in. Every
            number on this tab is derived from that log, so there is nothing to
            set up first.
          </p>
        </>
      ) : (
        <>
          <p className="empty__line">
            {attempts} attempt{attempts === 1 ? '' : 's'} logged, but no
            subcategory has reached {MIN_ATTEMPTS} yet.
          </p>
          <p className="empty__hint">
            The threshold is there on purpose. Three attempts in one
            subcategory is the smallest sample worth calling a weakness.
          </p>
        </>
      )}
    </div>
  );
}
