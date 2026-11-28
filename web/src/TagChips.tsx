/**
 * Earned category tags as small chips, plus a player name that opens that
 * player's profile. Used on the leaderboard, in rooms, in H2H matches and on
 * the profile page itself. Tags come from the server (see src/profile.ts).
 */

import type { Tag } from './profile';
import { openProfile } from './profile';
import './TagChips.css';

export function TagChips({ tags, max }: { tags: Tag[] | undefined; max?: number }) {
  if (!tags || tags.length === 0) return null;
  const shown = max !== undefined ? tags.slice(0, max) : tags;
  const hidden = tags.length - shown.length;
  return (
    <span className="tag-chips">
      {shown.map((t) => (
        <span key={t.id} className={`tag-chip tag-chip--${t.kind}`} title={t.description}>
          {t.label}
        </span>
      ))}
      {hidden > 0 ? (
        <span className="tag-chip tag-chip--more" title={tags.slice(shown.length).map((t) => t.label).join(', ')}>
          +{hidden}
        </span>
      ) : null}
    </span>
  );
}

/**
 * A name that links to `/#/u/<id>` when the player has an account. Guests (no
 * userId) render as plain text.
 */
export function PlayerName({
  name,
  userId,
  className,
}: {
  name: string;
  userId?: number | null;
  className?: string;
}) {
  if (!userId) return <span className={className}>{name}</span>;
  return (
    <a
      href={`#/u/${userId}`}
      className={['player-link', className ?? ''].filter(Boolean).join(' ')}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openProfile(userId);
      }}
    >
      {name}
    </a>
  );
}
