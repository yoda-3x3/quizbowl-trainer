/**
 * The feudal rank crest: a wreath-framed badge colored per tier, inspired by
 * wikiracing.org's league card (circular crest + name + rank/points row +
 * a thin progress bar toward the next band). God is a distinct gold glow
 * with a slow pulse, reserved for whoever currently holds #1.
 *
 * The tier/subrank/label themselves come from the server (see ../workers/room
 * /ratings.ts); SUBRANK_WIDTH and TIER_WIDTH below are duplicated here only to
 * draw the progress bar, since the client and worker are separate TS projects
 * with no shared-module boundary. If the server's bands ever change, this
 * progress bar is cosmetic only — it never decides a tier, so it can drift at
 * worst into a slightly wrong fill percentage, not a wrong rank.
 */

import type { RatingPublic } from './rank';

const TIER_WIDTH = 500;
const SUBRANK_WIDTH = 100;
const ELO_FLOOR = 100;

const TIER_STYLE: Record<string, { color: string; glyph: string }> = {
  Serf: { color: '#6b6459', glyph: '♙' }, // ♙
  Peasant: { color: '#8a7256', glyph: '♘' }, // ♘ (outline)
  Squire: { color: '#9aa0a6', glyph: '♝' }, // ♝
  Knight: { color: '#5b8dd9', glyph: '♞' }, // ♞
  Baron: { color: '#7c5cbf', glyph: '♜' }, // ♜
  Duke: { color: '#c9427a', glyph: '♛' }, // ♛
  King: { color: '#d4af37', glyph: '♚' }, // ♚
  God: { color: '#fff4cf', glyph: '✡' }, // ✡-ish star burst stand-in
};

const DEFAULT_STYLE = { color: '#6b6459', glyph: '♙' };

/** Fraction (0-1) of the way through the current 100-ELO sub-rank band. */
function progressWithinSubrank(elo: number): number {
  const clamped = Math.max(ELO_FLOOR, Math.floor(elo));
  const offset = (clamped - ELO_FLOOR) % TIER_WIDTH;
  const withinSubrank = offset % SUBRANK_WIDTH;
  return withinSubrank / SUBRANK_WIDTH;
}

export interface RankBadgeProps {
  rating: RatingPublic;
  /** 'card' is the full profile crest; 'compact' is an inline chip for lists/lobbies. */
  variant?: 'card' | 'compact';
}

export default function RankBadge({ rating, variant = 'card' }: RankBadgeProps) {
  const isGod = rating.rank.is_god;
  const style = TIER_STYLE[rating.rank.tier] ?? DEFAULT_STYLE;
  const progress = isGod ? 1 : progressWithinSubrank(rating.elo);

  if (variant === 'compact') {
    return (
      <span
        className={`rank-badge rank-badge--compact${isGod ? ' rank-badge--god' : ''}`}
        style={{ '--rank-color': style.color } as React.CSSProperties}
        title={`${rating.rank.label} • ${rating.elo} ELO`}
      >
        <span className="rank-badge__glyph" aria-hidden="true">
          {style.glyph}
        </span>
        <span className="rank-badge__label">{rating.rank.label}</span>
      </span>
    );
  }

  return (
    <div
      className={`rank-badge rank-badge--card${isGod ? ' rank-badge--god' : ''}`}
      style={{ '--rank-color': style.color } as React.CSSProperties}
    >
      <div className="rank-badge__crest" aria-hidden="true">
        <span className="rank-badge__glyph rank-badge__glyph--lg">{style.glyph}</span>
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
