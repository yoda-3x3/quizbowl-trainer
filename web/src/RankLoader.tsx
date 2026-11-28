/**
 * The loading screen shown while questions or packets load. Each tier has
 * its own: a vignette of the backdrop that tier unlocked, the tier crest,
 * orbiting motes (none for Serf, seven for God) and a tier tagline. God's
 * is a tight crop of the gap between the two fingers in The Creation of
 * Adam, with a breathing spark between them.
 *
 * Signed-out players (no rank) get the same frame in the theme's accent
 * colour, with no art.
 */

import type { CSSProperties } from 'react';
import { useMyRank } from './myRank';
import { auraStyle, visualForRank, type TierVisual } from './rankVisuals';

export interface RankLoaderProps {
  /** What is loading, e.g. "Loading questions". */
  label?: string;
  /** Override the viewer's own rank (tests, previews). */
  visual?: TierVisual | null;
}

export default function RankLoader({ label = 'Loading', visual }: RankLoaderProps) {
  const mine = useMyRank();
  const v = visual !== undefined ? visual : mine ? visualForRank(mine.rank) : null;
  return <RankLoaderView label={label} visual={v} />;
}

/** Pure view, split out so tests can render it without the rank store. */
export function RankLoaderView({ label, visual }: { label: string; visual: TierVisual | null }) {
  const style = (
    visual ? auraStyle(visual) : { '--rank-color': 'var(--accent)', '--aura-strength': '0.3' }
  ) as CSSProperties;
  const motes = visual ? visual.level : 0;
  const art = visual?.backdrop.image ?? null;

  return (
    <div
      className="rank-loader"
      role="status"
      aria-live="polite"
      data-tier={visual?.tier ?? 'none'}
      data-motif={visual?.loader.motif}
      style={style}
    >
      {art ? (
        <div className="rank-loader__art" style={{ backgroundImage: `url(${art})` }} />
      ) : null}
      <div className="rank-loader__wash" />
      {visual?.tier === 'God' ? <div className="rank-loader__spark" /> : null}

      <div className="rank-loader__crest" aria-hidden="true">
        <span>{visual?.glyph ?? '◈'}</span>
        {motes > 0 ? (
          <div className="rank-loader__orbit" data-motes={motes}>
            {Array.from({ length: motes }, (_, i) => (
              <span
                key={i}
                className="rank-loader__mote"
                style={{ transform: `rotate(${(360 / motes) * i}deg)` }}
              />
            ))}
          </div>
        ) : null}
      </div>

      <p className="rank-loader__title">{label}</p>
      <p className="rank-loader__tagline">
        {visual ? `${visual.loader.tagline}` : 'One moment…'}
      </p>
      <div className="rank-loader__bar" aria-hidden="true" />
    </div>
  );
}
