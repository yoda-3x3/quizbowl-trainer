/**
 * Streak + XP + daily-goal header for the Learn tab.
 *
 * The flame is a small inline SVG rather than a glyph character so it tints
 * with the theme's gold token and stays crisp at every pixel density. No
 * animation: the brief calls for calm feedback, not a party.
 */

import type { StreakSummary } from '../streak';

export interface StreakHeaderProps {
  summary: StreakSummary;
}

export default function StreakHeader({ summary }: StreakHeaderProps) {
  const { streak, atRisk, xp, lessonsToday, dailyGoal } = summary;

  const goal = Math.max(1, dailyGoal);
  const progressFraction = Math.min(1, lessonsToday / goal);
  const progressPercent = Math.round(progressFraction * 100);

  const flameState: 'live' | 'risk' | 'cold' =
    streak === 0 ? 'cold' : atRisk ? 'risk' : 'live';

  return (
    <section
      className="streak"
      aria-labelledby="learn-streak-label"
      aria-describedby="learn-streak-desc"
    >
      <div className={`streak__flame streak__flame--${flameState}`} aria-hidden="true">
        <svg
          className="streak__flame-svg"
          viewBox="0 0 48 48"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            className="streak__flame-fill"
            d="M24 4 C 20 11 14 14 14 22 C 14 29 18 32 18 36 C 18 40 20 44 24 44 C 28 44 30 40 30 36 C 30 32 34 29 34 22 C 34 16 29 12 24 4 Z"
          />
          <path
            d="M24 20 C 22 24 20 25 20 30 C 20 34 22 38 24 38 C 26 38 28 34 28 30 C 28 25 26 24 24 20 Z"
            fill="var(--bg)"
            opacity="0.35"
          />
        </svg>
      </div>

      <div className="streak__body">
        <div className="streak__count">
          <span id="learn-streak-label" aria-live="polite">
            {streak}
          </span>
          <span className="streak__count-label">
            {streak === 1 ? 'day streak' : 'day streak'}
          </span>
          <span className="sr-only" id="learn-streak-desc">
            {streak === 0
              ? 'No streak yet. A correct tossup today starts one.'
              : atRisk
                ? `Streak at risk. Finish a lesson today to keep your ${streak}-day streak alive.`
                : `Current streak of ${streak} ${streak === 1 ? 'day' : 'days'}.`}
          </span>
        </div>

        {atRisk ? (
          <div className="streak__risk" role="status">
            at risk — finish a lesson today
          </div>
        ) : null}

        <div className="streak__goal">
          <div className="streak__goal-label">
            today {lessonsToday}/{goal} lessons
          </div>
          <div
            className="streak__goal-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={goal}
            aria-valuenow={Math.min(goal, lessonsToday)}
            aria-label="Daily lesson goal progress"
          >
            <div
              className="streak__goal-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      <div className="streak__xp" aria-label={`Total XP ${xp}`}>
        <div className="streak__xp-value">{xp.toLocaleString('en-US')}</div>
        <div className="streak__xp-label">xp</div>
      </div>
    </section>
  );
}
