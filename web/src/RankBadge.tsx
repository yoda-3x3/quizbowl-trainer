/**
 * The feudal rank crest: a wreath-framed badge colored per tier, inspired by
 * wikiracing.org's league card (circular crest + name + rank/points row +
 * a thin progress bar toward the next band). Every badge sits inside a
 * glowing, slowly breathing aura whose colour and intensity scale with the
 * tier (see rankVisuals.ts); Duke and up add a rotating halo, and God — the
 * one player at #1 — gets light rays on top.
 *
 * The tier/subrank/label themselves come from the server (see ../workers/room
 * /ratings.ts); SUBRANK_WIDTH and TIER_WIDTH below are duplicated here only to
 * draw the progress bar, since the client and worker are separate TS projects
 * with no shared-module boundary. If the server's bands ever change, this
 * progress bar is cosmetic only — it never decides a tier, so it can drift at
 * worst into a slightly wrong fill percentage, not a wrong rank.
 *
 * `plain` drops the aura and colour entirely, for the black-and-white admin
 * dashboard.
 */

import type { CSSProperties, ReactNode } from 'react';
import type { RatingPublic } from './rank';
import { auraStyle, visualForRank, type TierVisual } from './rankVisuals';

const TIER_WIDTH = 500;
const SUBRANK_WIDTH = 100;
const ELO_FLOOR = 100;

/** Fraction (0-1) of the way through the current 100-ELO sub-rank band. */
function progressWithinSubrank(elo: number): number {
  const clamped = Math.max(ELO_FLOOR, Math.floor(elo));
  const offset = (clamped - ELO_FLOOR) % TIER_WIDTH;
  const withinSubrank = offset % SUBRANK_WIDTH;
  return withinSubrank / SUBRANK_WIDTH;
}

export type RankBadgeVariant = 'card' | 'compact' | 'topbar' | 'mini';

export interface RankBadgeProps {
  rating: RatingPublic;
  /** 'card' is the full profile crest; 'compact' is an inline chip for
   *  lists/lobbies; 'topbar' adds the ELO to the chip; 'mini' is glyph-only
   *  for tight spots like player chips. */
  variant?: RankBadgeVariant;
  /** No aura, no colour: for the admin dashboard. */
  plain?: boolean;
}

/** The glow wrapper. Kept separate so the aura never inherits the badge's
 *  own background, and so `plain` can skip it in one place. */
export function RankAura({
  visual,
  block = false,
  children,
}: {
  visual: TierVisual;
  block?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`rank-aura${block ? ' rank-aura--block' : ''}`}
      data-tier={visual.tier}
      data-halo={visual.auraHalo ? '' : undefined}
      style={auraStyle(visual) as CSSProperties}
    >
      {visual.tier === 'God' ? <span className="rank-aura__rays" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export default function RankBadge({ rating, variant = 'card', plain = false }: RankBadgeProps) {
  const visual = visualForRank(rating.rank);
  const isGod = visual.tier === 'God';
  const progress = isGod ? 1 : progressWithinSubrank(rating.elo);
  const godClass = isGod && !plain ? ' rank-badge--god' : '';
  const plainClass = plain ? ' rank-badge--plain' : '';
  const style = (plain ? {} : { '--rank-color': visual.color }) as CSSProperties;
  const title = `${rating.rank.label} • ${rating.elo} ELO`;

  let badge: ReactNode;
  if (variant === 'mini') {
    badge = (
      <span
        className={`rank-badge rank-badge--mini${godClass}${plainClass}`}
        style={style}
        title={title}
        aria-label={title}
        role="img"
      >
        <span className="rank-badge__glyph" aria-hidden="true">
          {visual.glyph}
        </span>
      </span>
    );
  } else if (variant === 'compact' || variant === 'topbar') {
    badge = (
      <span
        className={`rank-badge rank-badge--compact${
          variant === 'topbar' ? ' rank-badge--topbar' : ''
        }${godClass}${plainClass}`}
        style={style}
        title={title}
      >
        <span className="rank-badge__glyph" aria-hidden="true">
          {visual.glyph}
        </span>
        <span className="rank-badge__label">{rating.rank.label}</span>
        {variant === 'topbar' ? (
          <span className="rank-badge__elo">{rating.elo}</span>
        ) : null}
      </span>
    );
  } else {
    badge = (
      <div className={`rank-badge rank-badge--card${godClass}${plainClass}`} style={style}>
        <div className="rank-badge__crest" aria-hidden="true">
          <span className="rank-badge__glyph rank-badge__glyph--lg">{visual.glyph}</span>
        </div>
        <div className="rank-badge__body">
          <div className="rank-badge__name">{rating.rank.label}</div>
          <div className="rank-badge__stats">
            <span>{rating.elo} ELO</span>
            <span className="tiny muted">
              {rating.wins}W&ndash;{rating.losses}L
            </span>
          </div>
          {!isGod ? (
            <div className="rank-badge__progress" aria-hidden="true">
              <div
                className="rank-badge__progress-fill"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          ) : (
            <div className="tiny muted">Rank #1 &mdash; called by god</div>
          )}
        </div>
      </div>
    );
  }

  if (plain) return <>{badge}</>;
  return (
    <RankAura visual={visual} block={variant === 'card'}>
      {badge}
    </RankAura>
  );
}
