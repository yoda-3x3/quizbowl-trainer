/**
 * Public player profile, routed at `#/u/<id>` (see App.tsx / src/profile.ts).
 *
 * Shows only what GET /api/profile/:userId returns: nickname, rank/ELO, earned
 * tags, per-category accuracy / power rate / buzz point, and recent activity.
 * The URL is deliberately stable and self-contained so a future forum (see
 * NOTES.md) can link a post author straight here.
 */

import { useCallback, useEffect, useState } from 'react';
import { Button, PillRow, Sheet, StatPill, pct } from '../ui';
import { useAuth } from '../auth';
import RankBadge from '../RankBadge';
import { PlayerName, TagChips } from '../TagChips';
import { fetchProfile, profileUrl, syncAttempts, type PublicProfile } from '../profile';
import './Profile.css';

function ago(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

const MODE_LABEL: Record<string, string> = {
  tossup: 'Tossup',
  bonus: 'Bonus',
  oac: 'OAC',
  ear: 'Ear',
};

export default function Profile({ userId, onExit }: { userId: number; onExit(): void }) {
  const auth = useAuth();
  const isMe = auth.user?.id === userId;
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      setProfile(await fetchProfile(userId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to load');
    }
  }, [userId]);

  useEffect(() => {
    setProfile(null);
    void load();
  }, [load]);

  const syncNow = async () => {
    if (!isMe) return;
    setBusy(true);
    try {
      await syncAttempts(userId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'sync failed');
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(new URL(profileUrl(userId), window.location.origin).toString());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked; nothing to do.
    }
  };

  const now = Date.now();

  return (
    <>
      <header className="topbar">
        <h1 className="topbar__title">{isMe ? 'Your profile' : 'Profile'}</h1>
        <div className="topbar__right">
          <Button variant="ghost" small onClick={() => void copyLink()}>
            {copied ? 'Copied' : 'Copy link'}
          </Button>
          <Button variant="ghost" small onClick={onExit}>
            Done
          </Button>
        </div>
      </header>

      <div className="app__body profile">
        {error ? (
          <Sheet>
            <p className="banner banner--warn">{error}</p>
          </Sheet>
        ) : !profile ? (
          <Sheet>
            <p className="tiny muted">loading</p>
          </Sheet>
        ) : (
          <>
            <Sheet className="profile__head">
              <div className="profile__identity">
                <h2 className="profile__name">{profile.username}</h2>
                <TagChips tags={profile.tags} />
                <p className="tiny muted">
                  Joined {new Date(profile.joined_at).toLocaleDateString()} ·{' '}
                  {profile.rating.wins}W {profile.rating.losses}L rated
                </p>
              </div>
              <RankBadge
                rating={{
                  user_id: profile.user_id,
                  username: profile.username,
                  elo: profile.rating.elo,
                  wins: profile.rating.wins,
                  losses: profile.rating.losses,
                  rank: profile.rating.rank,
                }}
              />
            </Sheet>

            <Sheet
              title="By category"
              aside={
                isMe ? (
                  <Button variant="ghost" small disabled={busy} onClick={() => void syncNow()}>
                    {busy ? 'Syncing' : 'Sync now'}
                  </Button>
                ) : undefined
              }
            >
              <PillRow>
                <StatPill label="Heard" value={profile.totals.heard} />
                <StatPill label="Accuracy" value={pct(profile.totals.accuracy)} tone="good" />
                <StatPill
                  label="Power rate"
                  value={pct(profile.totals.power_rate)}
                  tone="gold"
                  title="Powers per tossup heard"
                />
              </PillRow>
              {profile.categories.length === 0 ? (
                <p className="tiny muted">
                  {isMe
                    ? 'No synced practice yet. Play some tossups while signed in and your stats appear here.'
                    : 'No category stats yet.'}
                </p>
              ) : (
                <table className="profile__table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th title="Questions heard (tossups + bonus parts)">Heard</th>
                      <th>Accuracy</th>
                      <th title="Powers per tossup heard">Power</th>
                      <th title="Average share of the question read at a correct buzz; lower is earlier">Buzz</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.categories.map((c) => (
                      <tr key={c.category}>
                        <td className="profile__cat">{c.category}</td>
                        <td>{c.heard}</td>
                        <td>
                          <span className="profile__bar" style={{ '--v': c.accuracy } as React.CSSProperties}>
                            {pct(c.accuracy)}
                          </span>
                        </td>
                        <td>{c.tossups > 0 ? pct(c.power_rate) : '–'}</td>
                        <td>{c.avg_buzz === null ? '–' : pct(c.avg_buzz)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="tiny muted profile__rule">
                Tags need 20+ questions in a category and 60% accuracy or a 20% power rate.
                Philosopher needs both Fine Arts and Philosophy. #1 goes to the single best
                accuracy + power rate in each category.
              </p>
            </Sheet>

            <Sheet title="Recent activity">
              {profile.recent_matches.length > 0 ? (
                <ul className="profile__list">
                  {profile.recent_matches.map((m) => (
                    <li key={`m${m.id}`}>
                      <span className={m.won ? 'profile__won' : 'profile__lost'}>{m.won ? 'Won' : 'Lost'}</span>{' '}
                      {m.rated ? 'rated' : 'private'} match vs{' '}
                      <PlayerName name={m.opponent || 'unknown'} userId={m.opponent_id} />
                      <span className="tiny muted"> · {ago(m.finished_at, now)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {profile.recent_attempts.length === 0 ? (
                <p className="tiny muted">Nothing yet.</p>
              ) : (
                <ul className="profile__list profile__list--attempts">
                  {profile.recent_attempts.map((a, i) => (
                    <li key={`a${a.at}-${i}`}>
                      <span
                        className={
                          a.powered ? 'profile__power' : a.correct ? 'profile__won' : a.neg ? 'profile__lost' : 'muted'
                        }
                      >
                        {a.powered ? 'Power' : a.correct ? 'Correct' : a.neg ? 'Neg' : 'Missed'}
                      </span>{' '}
                      {MODE_LABEL[a.mode] ?? a.mode} · {a.category}
                      <span className="tiny muted"> · {ago(a.at, now)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Sheet>
          </>
        )}
      </div>
    </>
  );
}
