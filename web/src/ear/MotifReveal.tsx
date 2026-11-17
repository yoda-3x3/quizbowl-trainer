/**
 * The ear trainer's reveal surface: what you have heard, and what it looks
 * like on a staff.
 *
 * Playback walks the revealed segments in clip order using one audio element
 * and a timeupdate guard, rather than slicing buffers with the Web Audio API.
 * That keeps it to a plain <audio> source, works with the Opus files already
 * shipped, and costs nothing when the panel is idle.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Staff from './Staff';
import { heardSeconds, playableSegments, type MotifReveal as Rev } from './motifMatch';
import type { MotifWork } from './motifs';
import './ear-reveal.css';

export interface MotifRevealProps {
  work: MotifWork;
  reveals: Rev[];
  /** Drop the masking and offer the whole clip. */
  showAll?: boolean;
}

export default function MotifReveal({
  work,
  reveals,
  showAll = false,
}: MotifRevealProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [segmentIndex, setSegmentIndex] = useState(-1);

  const motifs = useMemo(() => reveals.map((r) => r.motif), [reveals]);

  const segments = useMemo(
    () =>
      showAll
        ? [{ start: 0, end: work.duration }]
        : playableSegments(motifs),
    [motifs, showAll, work.duration],
  );

  const notes = useMemo(
    () =>
      [...motifs]
        .sort((a, b) => a.start - b.start)
        .map((m) => m.notes)
        .filter((n): n is string => Boolean(n))
        .join(' '),
    [motifs],
  );

  const heard = showAll ? work.duration : heardSeconds(motifs);
  const latest = reveals.length > 0 ? reveals[reveals.length - 1] : null;

  const stop = useCallback(() => {
    const el = audioRef.current;
    if (el) el.pause();
    setPlaying(false);
    setSegmentIndex(-1);
  }, []);

  const playFrom = useCallback(
    (index: number) => {
      const el = audioRef.current;
      const seg = segments[index];
      if (!el || !seg) {
        stop();
        return;
      }
      setSegmentIndex(index);
      el.currentTime = seg.start;
      void el.play().catch(() => setPlaying(false));
    },
    [segments, stop],
  );

  const play = useCallback(() => {
    if (segments.length === 0) return;
    setPlaying(true);
    playFrom(0);
  }, [playFrom, segments.length]);

  // Advance at the end of each segment. Checking on timeupdate rather than
  // scheduling a timer means a stall or a seek cannot desynchronise it.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const onTime = () => {
      if (segmentIndex < 0) return;
      const seg = segments[segmentIndex];
      if (!seg) return;
      if (el.currentTime >= seg.end) {
        const next = segmentIndex + 1;
        if (next < segments.length) playFrom(next);
        else stop();
      }
    };
    const onEnded = () => stop();

    el.addEventListener('timeupdate', onTime);
    el.addEventListener('ended', onEnded);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('ended', onEnded);
    };
  }, [playFrom, segmentIndex, segments, stop]);

  // A new reveal arriving mid-playback should not strand the playhead in a
  // segment that no longer exists.
  useEffect(() => {
    if (segmentIndex >= segments.length) stop();
  }, [segmentIndex, segments.length, stop]);

  const pct = Math.round((heard / work.duration) * 100);

  return (
    <div className="earrev">
      <audio ref={audioRef} src={work.clip} preload="metadata" />

      <div className="earrev__bar" aria-hidden="true">
        {segments.map((s, i) => (
          <span
            key={i}
            className={`earrev__seg${i === segmentIndex ? ' earrev__seg--on' : ''}`}
            style={{
              left: `${(s.start / work.duration) * 100}%`,
              width: `${((s.end - s.start) / work.duration) * 100}%`,
            }}
          />
        ))}
      </div>

      <div className="earrev__row">
        <button
          type="button"
          className="btn btn--sm"
          onClick={playing ? stop : play}
          disabled={segments.length === 0}
        >
          {playing ? 'Stop' : segments.length === 0 ? 'Nothing yet' : 'Play what you have'}
        </button>
        <span className="earrev__meta nums">
          {heard.toFixed(1)}s of {work.duration.toFixed(0)}s · {pct}%
        </span>
      </div>

      {notes ? (
        <Staff notes={notes} />
      ) : (
        <p className="earrev__empty">
          No pitches described yet. Named motifs appear here on the staff.
        </p>
      )}

      <p className="earrev__caption">
        {showAll ? (
          <span>
            {work.title}
            <span className="muted"> · {work.composer}</span>
          </span>
        ) : latest ? (
          <span className="earrev__latest">{latest.motif.label}</span>
        ) : (
          <span className="muted">
            Nothing described yet. Motifs are added as the clues name them.
          </span>
        )}
      </p>
    </div>
  );
}
