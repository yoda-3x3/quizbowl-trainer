/**
 * Public ELO leaderboard. #1 wears the God rank; everyone else shows their
 * feudal tier. Reachable from the Tournaments tab since rank is primarily
 * earned through Quick Play and tournament play.
 *
 * Lists every player (`?all=1`), not just the rated ones: anyone without a
 * rated match yet sits at the start ELO, marked "unrated". The ELO chart
 * above the list plots all of them on one axis over the tier bands; the
 * list is the chart's table view.
 */

import { Button, Sheet } from "../ui";
import { useLeaderboard } from "../rank";
import RankBadge, { RankTitle } from "../RankBadge";
import { PlayerName, TagChips } from "../TagChips";
import { useTags } from "../profile";
import { useAuth } from "../auth";
import EloChart from "../EloChart";
import "./Tournaments.css";
import "../EloChart.css";

export default function Leaderboard({ onExit }: { onExit(): void }) {
  const board = useLeaderboard(2000, true);
  const auth = useAuth();
  const meId = auth.user?.id ?? null;
  const rated = board.entries.filter((e) => e.rated !== false).length;
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
            <p className="tiny muted">No players yet.</p>
          </Sheet>
        ) : (
          <>
            <Sheet title="ELO chart">
              <EloChart entries={board.entries} meId={meId} />
            </Sheet>
            <Sheet
              title="All players"
              aside={
                <span className="tiny muted leaderboard__count">
                  {board.entries.length} players · {rated} rated
                </span>
              }
            >
              <div className="leaderboard">
                {board.entries.map((e) => (
                  <div
                    key={e.user_id}
                    className={`leaderboard__row${e.rank.is_god ? " leaderboard__row--god" : ""}${
                      e.user_id === meId ? " leaderboard__row--me" : ""
                    }`}
                  >
                    <span className="leaderboard__position">#{e.position}</span>
                    <span className="leaderboard__name">
                      <PlayerName name={e.username} userId={e.user_id} />{" "}
                      <TagChips tags={tags[e.user_id]} max={3} />
                      {e.rank.is_god ? <RankTitle /> : null}
                    </span>
                    <RankBadge rating={e} variant="compact" />
                    {e.rated === false ? (
                      <span className="leaderboard__unrated">unrated</span>
                    ) : null}
                    <span className="leaderboard__elo tiny muted">
                      {e.elo} ELO
                    </span>
                  </div>
                ))}
              </div>
            </Sheet>
          </>
        )}
      </div>
    </>
  );
}
