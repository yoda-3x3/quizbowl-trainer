/**
 * ELO chart: every player as one dot on a single ELO axis, over the feudal
 * tier bands (Serf..King). Dots that share an ELO stack upward instead of
 * hiding each other, so the whole player base is visible at once.
 *
 * Tier identity is carried by labelled bands, not by dot colour; dots stay
 * neutral ink. Only two dots are called out, each with a label as well as
 * colour: God (#1, gold, ✡) and you (accent). Hovering or focusing a dot
 * shows name, ELO and rank; clicking opens that player's profile. The
 * leaderboard list under the chart is its table view.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { LeaderboardEntry } from './rank';
import { tierVisual } from './rankVisuals';
import { dodge, eloDomain, tierBands } from './eloLayout';
import { openProfile } from './profile';

const DOT_R = 5;
const DOT_D = DOT_R * 2 + 2; // 2px surface gap between neighbours
const PAD_X = 14;
const AXIS_H = 22;
const BAND_LABEL_H = 18;
const MAX_STACK_H = 150;

export interface EloChartProps {
  entries: LeaderboardEntry[];
  meId?: number | null;
}

export default function EloChart({ entries, meId = null }: EloChartProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(260, Math.round(entry.contentRect.width)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const plotW = width - PAD_X * 2;
  const domain = useMemo(() => eloDomain(entries.map((e) => e.elo)), [entries]);
  const bands = useMemo(() => tierBands(domain), [domain]);
  const layout = useMemo(
    () => dodge(entries.map((e) => ({ id: e.user_id, elo: e.elo })), domain, plotW, DOT_D),
    [entries, domain, plotW],
  );
  // Very tall stacks (lots of unrated players at the start ELO) compress
  // their row step rather than growing the chart without bound.
  const rowStep = Math.min(DOT_D, MAX_STACK_H / Math.max(1, layout.rows));
  const stackH = Math.max(DOT_D, rowStep * (layout.rows - 1) + DOT_D);
  const plotTop = BAND_LABEL_H + 6;
  const baseY = plotTop + stackH - DOT_R;
  const height = plotTop + stackH + 6 + AXIS_H;
  const xOf = (elo: number) =>
    PAD_X + ((elo - domain.min) / (domain.max - domain.min)) * plotW;

  const byId = useMemo(() => new Map(entries.map((e) => [e.user_id, e])), [entries]);
  const ticks: number[] = [];
  // Keep tick labels ~60px apart so they never collide on a phone.
  const bandsN = (domain.max - domain.min) / 500;
  const tickStep = 500 * Math.max(1, Math.ceil((bandsN * 60) / Math.max(1, plotW)));
  for (let t = domain.min; t <= domain.max; t += tickStep) ticks.push(t);

  const hovered = hover !== null ? byId.get(hover) : undefined;
  const hoveredDot = hover !== null ? layout.dots.find((d) => d.id === hover) : undefined;

  // Draw the called-out dots last so their ring sits on top of neighbours.
  const ordered = [...layout.dots].sort((a, b) => {
    const rank = (id: number) =>
      id === meId ? 2 : byId.get(id)?.rank.is_god ? 3 : id === hover ? 4 : 0;
    return rank(a.id) - rank(b.id);
  });

  return (
    <div className="elo-chart" ref={wrapRef}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`ELO of all ${entries.length} players, from ${domain.min} to ${domain.max}, over the rank tiers`}
      >
        {bands.map((b, i) => {
          const x0 = xOf(b.from) + (i === 0 ? 0 : 1);
          const x1 = xOf(b.to) - (i === bands.length - 1 ? 0 : 1);
          const color = tierVisual(b.tier).color;
          return (
            <g key={b.tier}>
              <rect
                className="elo-chart__band"
                x={x0}
                y={plotTop - 4}
                width={Math.max(0, x1 - x0)}
                height={stackH + 8}
                rx={4}
                style={{ fill: color }}
              />
              <text className="elo-chart__band-label" x={(x0 + x1) / 2} y={BAND_LABEL_H - 4}>
                {x1 - x0 > 54 ? b.tier : b.tier.slice(0, 1)}
              </text>
            </g>
          );
        })}

        <line
          className="elo-chart__axis"
          x1={PAD_X}
          x2={width - PAD_X}
          y1={plotTop + stackH + 6}
          y2={plotTop + stackH + 6}
        />
        {ticks.map((t) => (
          <text key={t} className="elo-chart__tick" x={xOf(t)} y={height - 6}>
            {t}
          </text>
        ))}

        {ordered.map((d) => {
          const e = byId.get(d.id);
          if (!e) return null;
          const cx = PAD_X + d.x;
          const cy = baseY - d.row * rowStep;
          const isGod = e.rank.is_god;
          const isMe = d.id === meId;
          const cls = [
            'elo-chart__dot',
            isGod ? 'elo-chart__dot--god' : '',
            isMe ? 'elo-chart__dot--me' : '',
            e.rated === false ? 'elo-chart__dot--unrated' : '',
            hover === d.id ? 'elo-chart__dot--hover' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <g key={d.id}>
              {/* Hit target larger than the mark. */}
              <circle
                className="elo-chart__hit"
                cx={cx}
                cy={cy}
                r={Math.max(DOT_R + 4, 9)}
                tabIndex={0}
                role="button"
                aria-label={`${e.username}, ${e.elo} ELO, ${isGod ? 'God' : e.rank.label}${
                  e.rated === false ? ', unrated' : ''
                }`}
                onMouseEnter={() => setHover(d.id)}
                onMouseLeave={() => setHover((h) => (h === d.id ? null : h))}
                onFocus={() => setHover(d.id)}
                onBlur={() => setHover((h) => (h === d.id ? null : h))}
                onClick={() => openProfile(d.id)}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    openProfile(d.id);
                  }
                }}
              />
              <circle className={cls} cx={cx} cy={cy} r={isGod || isMe ? DOT_R + 1 : DOT_R} />
              {isGod ? (
                <text className="elo-chart__callout elo-chart__callout--god" x={cx} y={cy - 11}>
                  {`✡ ${e.username}`}
                </text>
              ) : null}
              {isMe && !isGod ? (
                <text className="elo-chart__callout elo-chart__callout--me" x={cx} y={cy - 11}>
                  you
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>

      {hovered && hoveredDot ? (
        <div
          className="elo-chart__tip"
          role="status"
          style={{
            left: Math.min(width - 90, Math.max(90, PAD_X + hoveredDot.x)),
            top: baseY - hoveredDot.row * rowStep - 14,
          }}
        >
          <strong>{hovered.username}</strong>
          <span className="elo-chart__tip-elo">{hovered.elo} ELO</span>
          <span className="elo-chart__tip-rank">
            {hovered.rank.is_god ? '✡ God' : hovered.rank.label}
            {hovered.rated === false ? ' · unrated' : ''}
          </span>
        </div>
      ) : null}

      <p className="elo-chart__legend tiny muted">
        <span className="elo-chart__key elo-chart__key--player" aria-hidden="true" /> player
        <span className="elo-chart__key elo-chart__key--unrated" aria-hidden="true" /> unrated
        (start ELO)
        <span className="elo-chart__key elo-chart__key--god" aria-hidden="true" /> God
        {meId !== null ? (
          <>
            <span className="elo-chart__key elo-chart__key--me" aria-hidden="true" /> you
          </>
        ) : null}
      </p>
    </div>
  );
}
