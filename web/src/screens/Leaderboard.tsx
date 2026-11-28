/**
 * Public ELO leaderboard. #1 wears the God rank; everyone else shows their
 * feudal tier. Reachable from the Tournaments tab since rank is primarily
 * earned through Quick Play and tournament play.
 */

import { Button, Sheet } from '../ui';
import { useLeaderboard } from '../rank';
import RankBadge from '../RankBadge';
import { PlayerName, TagChips } from '../TagChips';
import { useTags } from '../profile';
import './Tournaments.css';

export default function Leaderboard({ onExit }: { onExit(): void }) {
  const board = useLeaderboard(100);
  const tags = useTags(board.entries.map((e) => e.user_id));

  return (
    <>
      <header className="topbar">
        <h1 className="topbar__title">Leaderboard</h1>
        <div className="topbar__right">
          <Button variant="ghost" small onClick={() => void board.refresh()}>
            Refresh
          </Button>
          <Button variant="ghost" small onClick={onExit}>
            Done
          </Button>
        </div>
      </header>

      <div className="app__body">
        {board.loading && board.entries.length === 0 ? (
          <Sheet>
            <p className="tiny muted">loading</p>
          </Sheet>
        ) : board.error ? (
          <Sheet>
            <p className="banner banner--warn">{board.error}</p>
          </Sheet>
        ) : board.entries.length === 0 ? (
          <Sheet>
            <p className="tiny muted">No rated matches have finished yet.</p>
          </Sheet>
        ) : (
          <Sheet>
            <div className="leaderboard">
              {board.entries.map((e) => (
                <div key={e.user_id} className="leaderboard__row">
                  <span className="leaderboard__position">#{e.position}</span>
                  <span className="leaderboard__name">
                    <PlayerName name={e.username} userId={e.user_id} />{' '}
                    <TagChips tags={tags[e.user_id]} max={3} />
                  </span>
                  <RankBadge rating={e} variant="compact" />
                  <span className="leaderboard__elo tiny muted">{e.elo} ELO</span>
                </div>
              ))}
            </div>
          </Sheet>
        )}
      </div>
    </>
  );
}
