/**
 * Ohio Academic Competition match screen.
 *
 * All timing, scoring and legality live in `oac/match.ts`; this file renders
 * state and dispatches actions. Two format details drive the layout:
 *
 *  - Conferral is legal before, during and after every question, so no input is
 *    ever disabled while a clock runs and the confer buttons are always live.
 *    An engine that refuses an out-of-turn answer is the enforcement; a
 *    disabled text box would just stop a team from typing what it agreed on.
 *  - There is no choose-a-category board. The ten categories are played in the
 *    fixed order, so the header states the position instead of offering a grid.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import type { OacPacket, OacTeam } from '../types';
import { rateForWpm, speak, spokenAnswer, stopSpeaking } from '../voice/speech';
import {
  VoiceAnswerStatus,
  VoiceHiddenText,
  useVoiceAnswer,
  useVoiceSettings,
} from '../voice/useVoice';
import { OAC_SCORING } from '../types';
import { append } from '../engine/log';
import {
  fetchServerPacket,
  listServerPackets,
  type ServerPacketEntry,
} from '../packets';
import {
  createMatch,
  currentCategory,
  onTheClock,
  reduce,
  remainingMs,
  revealedWordCount,
  secondsLeft,
  toAttemptEvent,
  TEAMS,
  type OacAction,
  type OacMatchConfig,
  type OacMatchState,
} from '../oac/match';

interface Dispatched {
  action: OacAction;
  now: number;
}

const TICK_MS = 100;

export default function OacMatch({
  packet,
  config,
  teamNames,
}: {
  packet?: OacPacket | null;
  config?: Partial<OacMatchConfig>;
  teamNames?: Record<OacTeam, string>;
}) {
  const [picked, setPicked] = useState<OacPacket | null>(null);
  useEffect(() => stopSpeaking, []);
  const resolved = packet ?? picked;
  if (!resolved) {
    return <ServerPacketPicker onPick={setPicked} />;
  }
  return <Match packet={resolved} config={config} teamNames={teamNames} />;
}

/**
 * Empty-state screen that lists the server packets a signed-in user has
 * shared, and loads the full OAC packet the user picks. Standard packets are
 * skipped — the OAC match engine needs an OacPacket.
 */
function ServerPacketPicker({
  onPick,
}: {
  onPick(p: OacPacket): void;
}) {
  const [entries, setEntries] = useState<ServerPacketEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      setEntries(await listServerPackets());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'failed to load');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const load = async (id: string) => {
    setBusyId(id);
    setLoadError(null);
    try {
      const packet = await fetchServerPacket(id);
      const oac = packet.data.oac;
      if (!oac) {
        setLoadError(
          'That packet is not an OAC packet. The OAC match needs an OAC-format round.',
        );
        return;
      }
      onPick(oac);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'failed to load');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={S.wrap}>
      <h2 style={S.h2}>Ohio Academic Competition</h2>
      <p style={S.hint}>
        No packet loaded. Import an OAC packet or pick one shared from another
        device below. The three rounds will play from it: ten categories, the
        alphabet worksheet, then twenty final tossups.
      </p>

      <section style={PICKER.panel}>
        <div style={PICKER.header}>
          <h3 style={PICKER.h3}>Server packets</h3>
          <button
            style={PICKER.buttonSmall}
            onClick={() => void refresh()}
            disabled={busyId !== null}
          >
            Refresh
          </button>
        </div>
        {loadError && <p style={PICKER.error}>{loadError}</p>}
        {entries === null ? (
          <p style={S.hint}>Loading...</p>
        ) : entries.length === 0 ? (
          <p style={S.hint}>No packets have been uploaded yet.</p>
        ) : (
          <ul style={PICKER.list}>
            {entries.map((e) => (
              <li key={e.id} style={PICKER.listItem}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong>{e.name}</strong>
                  <div style={PICKER.sub}>
                    {e.tossup_count} tossups, {e.bonus_count} bonuses
                    {e.uploader_name ? ` — ${e.uploader_name}` : ''}
                  </div>
                </div>
                <button
                  style={PICKER.buttonSmall}
                  disabled={busyId !== null}
                  onClick={() => void load(e.id)}
                >
                  {busyId === e.id ? 'Loading' : 'Load'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Match({
  packet,
  config,
  teamNames,
}: {
  packet: OacPacket;
  config?: Partial<OacMatchConfig>;
  teamNames?: Record<OacTeam, string>;
}) {
  const initial = useMemo(() => createMatch(packet, config ?? {}), [packet, config]);
  const [state, raw] = useReducer(
    (s: OacMatchState, d: Dispatched) => reduce(s, d.action, d.now),
    initial,
  );
  const [now, setNow] = useState(() => Date.now());

  const dispatch = useCallback(
    (action: OacAction) => {
      const at = Date.now();
      setNow(at);
      raw({ action, now: at });
    },
    [raw],
  );

  // One interval drives every clock and the word reveal. The engine is pure,
  // so a dropped frame cannot desynchronise anything: both the reveal and the
  // clocks are computed from absolute times.
  useEffect(() => {
    const live =
      state.stage !== 'idle' &&
      state.stage !== 'complete' &&
      (state.directed !== null ||
        state.tossup !== null ||
        state.alphabet.phase === 'running');
    if (!live) return;
    const id = setInterval(() => {
      const at = Date.now();
      setNow(at);
      raw({ action: { type: 'tick' }, now: at });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [raw, state.stage, state.directed, state.tossup, state.alphabet.phase]);

  // Everything derives from the attempt log, so each attempt is appended once.
  const logged = useRef(0);
  useEffect(() => {
    const fresh = state.attempts.slice(logged.current);
    logged.current = state.attempts.length;
    for (const attempt of fresh) {
      void append(toAttemptEvent(attempt, state.packet.setName));
    }
  }, [state.attempts, state.packet.setName]);

  const name = (team: OacTeam): string => teamNames?.[team] ?? `Team ${team}`;
  const left = secondsLeft(state, now);
  const clockFraction = clockProgress(state, now);
  const live = onTheClock(state, now);

  return (
    <div style={S.wrap}>
      <div style={S.scoreboard}>
        {TEAMS.map((team) => (
          <div
            key={team}
            style={{
              ...S.scoreCard,
              borderColor: live === team ? 'var(--accent)' : 'var(--line)',
            }}
          >
            <span style={S.teamName}>{name(team)}</span>
            <span style={S.scoreValue}>{state.scores[team]}</span>
            <button
              style={S.confer}
              onClick={() => dispatch({ type: 'confer', team })}
              title="Conferral is legal at any time in this format"
            >
              confer{state.conferrals[team] > 0 ? ` (${state.conferrals[team]})` : ''}
            </button>
          </div>
        ))}
      </div>

      <div style={S.statusRow}>
        <span style={S.position}>{positionLabel(state)}</span>
        <span style={S.clock}>{left === null ? 'no clock' : `${left}s`}</span>
      </div>
      <div style={S.clockTrack} aria-hidden="true">
        <div
          style={{
            ...S.clockFill,
            transform: `scaleX(${clockFraction})`,
            background: clockFraction < 0.25 ? 'var(--bad)' : 'var(--accent)',
          }}
        />
      </div>

      {state.stage === 'idle' ? (
        <Idle state={state} onStart={() => dispatch({ type: 'next' })} />
      ) : null}

      {state.directed !== null ? (
        <Directed
          state={state}
          now={now}
          name={name}
          dispatch={dispatch}
        />
      ) : null}

      {state.tossup !== null ? (
        <TossupPanel state={state} now={now} name={name} dispatch={dispatch} />
      ) : null}

      {state.stage === 'alphabet' ? (
        <Alphabet state={state} name={name} dispatch={dispatch} />
      ) : null}

      {state.stage === 'complete' ? <Complete state={state} name={name} /> : null}

      {state.stage !== 'idle' && state.stage !== 'complete' ? (
        <div style={S.row}>
          <button style={S.btn} onClick={() => dispatch({ type: 'next' })}>
            Next question
          </button>
        </div>
      ) : null}

      <p style={S.footnote}>
        No negative points in this format, and no bonuses. Conferral is legal
        before, during and after every question.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

function Idle({ state, onStart }: { state: OacMatchState; onStart(): void }) {
  const { packet } = state;
  return (
    <div style={S.card}>
      <h3 style={S.h3}>{packet.setName}</h3>
      <ul style={S.list}>
        <li>
          Round 1: {packet.categoryRound.length} categories, two directed
          questions and a tossup each.
        </li>
        <li>
          Round 2: the alphabet worksheet, letter{' '}
          {packet.alphabet.letter || 'unset'}, {packet.alphabet.items.length}{' '}
          items in {OAC_SCORING.alphabetSeconds / 60} minutes.
        </li>
        <li>Round 3: {packet.finalRound.length} tossups, two points each.</li>
      </ul>
      <button style={S.btnPrimary} onClick={onStart}>
        Start match
      </button>
    </div>
  );
}

function Directed({
  state,
  now,
  name,
  dispatch,
}: {
  state: OacMatchState;
  now: number;
  name(team: OacTeam): string;
  dispatch(a: OacAction): void;
}) {
  const d = state.directed;
  const [given, setGiven] = useState('');
  useEffect(() => setGiven(''), [d?.questionId, d?.phase]);

  // Voice: read the question when it comes up, then listen once the clock runs.
  const voice = useVoiceSettings();
  const [talking, setTalking] = useState(false);
  useEffect(() => {
    if (!voice.read || !d || d.phase === 'done') return;
    setTalking(true);
    const stop = speak(d.question.prompt, {
      rate: rateForWpm(state.config.wpm),
      onEnd: () => setTalking(false),
    });
    return () => {
      stop();
      setTalking(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.read, d?.questionId]);
  useEffect(() => {
    if (!voice.read || !d || d.phase !== 'done') return;
    speak(d.award === null ? `No score. The answer was ${spokenAnswer(d.question.answer)}.` : `${name(d.award.team)} scores ${d.award.points}.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.read, d?.phase === 'done', d?.questionId]);
  const clockLive = d !== null && d.phase !== 'ready' && d.phase !== 'done';
  const voiceAnswer = useVoiceAnswer(
    voice.answer && clockLive && !talking,
    (text) => {
      if (!d || !text.trim()) return;
      dispatch({ type: 'answer', team: onTheClock(state, Date.now()) ?? d.team, given: text });
      setGiven('');
    },
    `${d?.questionId}#${d?.phase}#${d?.attempts}#${d?.pendingPrompt ?? ''}`,
  );

  if (d === null) return null;

  const live = onTheClock(state, now);
  const attemptLabel =
    d.phase === 'steal'
      ? `${name(d.opponent)} may steal for ${OAC_SCORING.steal}`
      : `${name(d.team)}, attempt ${Math.min(2, d.attempts + 1)} of 2`;

  return (
    <div style={S.card}>
      <div style={S.badgeRow}>
        <span style={S.badge}>directed to {name(d.team)}</span>
        <span style={S.badge}>{d.seconds}s clock</span>
        <span style={S.badge}>no buzzing</span>
      </div>

      {voice.read && d.phase !== 'done' ? (
        <VoiceHiddenText className="" style={S.question} />
      ) : (
        <p style={S.question}>{d.question.prompt}</p>
      )}

      {d.phase === 'ready' ? (
        <button style={S.btnPrimary} onClick={() => dispatch({ type: 'start' })}>
          Start the clock
        </button>
      ) : (
        <>
          <p style={S.attempt}>{attemptLabel}</p>
          {d.pendingPrompt !== null ? (
            <p style={S.prompt}>{d.pendingPrompt}</p>
          ) : null}
          {/* Never disabled while the clock runs: a conferring team has to be
              able to type what it agreed on. The engine decides what counts. */}
          <form
            style={S.row}
            onSubmit={(e) => {
              e.preventDefault();
              const team = live ?? d.team;
              dispatch({ type: 'answer', team, given });
              setGiven('');
            }}
          >
            <input
              style={S.input}
              value={given}
              autoFocus
              placeholder={live === null ? 'clock stopped' : `answer for ${name(live)}`}
              onChange={(e) => setGiven(e.target.value)}
            />
            <button style={S.btnPrimary} type="submit">
              Submit
            </button>
          </form>
          <VoiceAnswerStatus voice={voiceAnswer} />
        </>
      )}

      {d.phase === 'done' ? (
        <p style={d.award === null ? S.missed : S.scored}>
          {d.award === null
            ? `No score. The answer was ${d.question.answer}.`
            : `${name(d.award.team)} scores ${d.award.points}.`}
        </p>
      ) : null}
    </div>
  );
}

function TossupPanel({
  state,
  now,
  name,
  dispatch,
}: {
  state: OacMatchState;
  now: number;
  name(team: OacTeam): string;
  dispatch(a: OacAction): void;
}) {
  const t = state.tossup;
  const [given, setGiven] = useState('');
  useEffect(() => setGiven(''), [t?.questionId, t?.buzz?.team]);

  // Voice: read while the tossup is being read (resuming where the text is
  // after a wrong buzz), listen for the team that buzzed, announce the result.
  const voice = useVoiceSettings();
  const reading = t !== null && t.phase === 'reading';
  useEffect(() => {
    if (!voice.read || !t || !reading) return;
    const from = revealedWordCount(t, Date.now());
    return speak(t.words.slice(from).join(' '), { rate: rateForWpm(state.config.wpm) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.read, reading, t?.questionId]);
  useEffect(() => {
    if (!voice.read || !t || t.phase !== 'done') return;
    speak(t.award === null ? `No score. The answer was ${spokenAnswer(t.question.answer)}.` : `${name(t.award.team)} scores ${t.award.points}.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.read, t?.phase === 'done', t?.questionId]);
  const buzzedTeam = t?.phase === 'buzzed' ? (t.buzz?.team ?? null) : null;
  const voiceAnswer = useVoiceAnswer(
    voice.answer && buzzedTeam !== null,
    (text) => {
      if (buzzedTeam === null || !text.trim()) return;
      dispatch({ type: 'answer', team: buzzedTeam, given: text });
      setGiven('');
    },
    `${t?.questionId}#${buzzedTeam}#${t?.pendingPrompt ?? ''}`,
  );

  if (t === null) return null;

  const revealed = revealedWordCount(t, now);
  const holder = t.buzz?.team ?? null;

  return (
    <div style={S.card}>
      <div style={S.badgeRow}>
        <span style={S.badge}>
          {t.round === 'final' ? 'final round tossup' : 'category tossup'}
        </span>
        <span style={S.badge}>{t.value} points</span>
        <span style={S.badge}>one answer each</span>
      </div>

      {voice.read && t.phase !== 'done' ? (
        <VoiceHiddenText className="" style={S.question} />
      ) : (
        <p style={S.question}>
          {t.words.slice(0, revealed).join(' ')}
          {revealed < t.words.length ? <span style={S.caret} /> : null}
        </p>
      )}

      {t.phase === 'ready' ? (
        <button style={S.btnPrimary} onClick={() => dispatch({ type: 'start' })}>
          Start reading
        </button>
      ) : null}

      {t.phase === 'reading' ? (
        <div style={S.row}>
          {TEAMS.map((team) => (
            <button
              key={team}
              style={t.used.includes(team) ? S.btn : S.buzz}
              disabled={t.used.includes(team)}
              onClick={() => dispatch({ type: 'buzz', team })}
            >
              {t.used.includes(team) ? `${name(team)} used` : `Buzz ${name(team)}`}
            </button>
          ))}
        </div>
      ) : null}

      {t.phase === 'buzzed' && holder !== null ? (
        <>
          <p style={S.attempt}>{name(holder)} buzzed</p>
          {t.pendingPrompt !== null ? <p style={S.prompt}>{t.pendingPrompt}</p> : null}
          <form
            style={S.row}
            onSubmit={(e) => {
              e.preventDefault();
              dispatch({ type: 'answer', team: holder, given });
              setGiven('');
            }}
          >
            <input
              style={S.input}
              value={given}
              autoFocus
              placeholder={`answer for ${name(holder)}`}
              onChange={(e) => setGiven(e.target.value)}
            />
            <button style={S.btnPrimary} type="submit">
              Submit
            </button>
          </form>
          <VoiceAnswerStatus voice={voiceAnswer} />
        </>
      ) : null}

      {t.phase === 'done' ? (
        <p style={t.award === null ? S.missed : S.scored}>
          {t.award === null
            ? `No score. The answer was ${t.question.answer}.`
            : `${name(t.award.team)} scores ${t.award.points}.`}
        </p>
      ) : null}
    </div>
  );
}

function Alphabet({
  state,
  name,
  dispatch,
}: {
  state: OacMatchState;
  name(team: OacTeam): string;
  dispatch(a: OacAction): void;
}) {
  const a = state.alphabet;
  const graded = a.graded;

  return (
    <div style={S.card}>
      <div style={S.badgeRow}>
        <span style={S.badge}>alphabet round</span>
        <span style={S.badge}>every answer starts with {a.letter}</span>
        <span style={S.badge}>
          {a.items.length} items, {a.seconds / 60} minutes
        </span>
        <span style={S.badge}>{OAC_SCORING.alphabetItem} points each</span>
      </div>

      {a.phase === 'ready' ? (
        <button style={S.btnPrimary} onClick={() => dispatch({ type: 'start' })}>
          Hand out the worksheet
        </button>
      ) : null}

      <ol style={S.sheet}>
        {a.items.map((item, i) => (
          <li key={item.index} style={S.sheetRow}>
            <span style={S.sheetPrompt}>
              {item.prompt}
              {item.twoWord ? <span style={S.twoWord}>two words</span> : null}
            </span>
            <div style={S.row}>
              {TEAMS.map((team) => (
                <label key={team} style={S.sheetLabel}>
                  {name(team)}
                  <input
                    style={{
                      ...S.input,
                      borderColor: gradedColor(graded?.[team]?.[i] ?? null),
                    }}
                    value={a.sheets[team][i] ?? ''}
                    readOnly={a.phase === 'graded'}
                    onChange={(e) =>
                      dispatch({
                        type: 'write',
                        team,
                        index: i,
                        text: e.target.value,
                      })
                    }
                  />
                </label>
              ))}
            </div>
            {a.phase === 'graded' ? (
              <span style={S.answerLine}>{item.answer}</span>
            ) : null}
          </li>
        ))}
      </ol>

      {a.phase === 'running' ? (
        <button
          style={S.btnPrimary}
          onClick={() => dispatch({ type: 'grade-alphabet' })}
        >
          Score the worksheets
        </button>
      ) : null}
    </div>
  );
}

function Complete({
  state,
  name,
}: {
  state: OacMatchState;
  name(team: OacTeam): string;
}) {
  const byRound = useMemo(() => {
    const rows: Record<OacTeam, Record<string, number>> = {
      A: { 'Category round': 0, 'Alphabet round': 0, 'Final round': 0 },
      B: { 'Category round': 0, 'Alphabet round': 0, 'Final round': 0 },
    };
    for (const award of state.awards) {
      const round =
        award.reason === 'final-tossup'
          ? 'Final round'
          : award.reason === 'alphabet' || award.reason === 'alphabet-perfect'
            ? 'Alphabet round'
            : 'Category round';
      const row = rows[award.team];
      row[round] = (row[round] ?? 0) + award.points;
    }
    return rows;
  }, [state.awards]);

  const winner =
    state.scores.A === state.scores.B ? null : state.scores.A > state.scores.B ? 'A' : 'B';

  return (
    <div style={S.card}>
      <h3 style={S.h3}>
        {winner === null
          ? `Tied at ${state.scores.A}`
          : `${name(winner)} wins, ${state.scores[winner]} to ${
              state.scores[winner === 'A' ? 'B' : 'A']
            }`}
      </h3>
      <table style={S.table}>
        <thead>
          <tr>
            <th style={S.th}>round</th>
            {TEAMS.map((team) => (
              <th key={team} style={S.thNum}>
                {name(team)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {['Category round', 'Alphabet round', 'Final round'].map((round) => (
            <tr key={round}>
              <td style={S.td}>{round}</td>
              {TEAMS.map((team) => (
                <td key={team} style={S.tdNum}>
                  {byRound[team][round] ?? 0}
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <td style={S.tdTotal}>total</td>
            {TEAMS.map((team) => (
              <td key={team} style={S.tdTotalNum}>
                {state.scores[team]}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small derivations
// ---------------------------------------------------------------------------

function positionLabel(state: OacMatchState): string {
  switch (state.stage) {
    case 'idle':
      return 'not started';
    case 'category': {
      const category = currentCategory(state) ?? '';
      const slot =
        state.slot === 2 ? 'tossup' : `directed question ${state.slot + 1}`;
      return `Round 1, category ${state.categoryIndex + 1} of ${
        state.packet.categoryRound.length
      }: ${category}, ${slot}`;
    }
    case 'alphabet':
      return `Round 2, alphabet round, letter ${state.alphabet.letter}`;
    case 'final':
      return `Round 3, tossup ${state.finalIndex + 1} of ${
        state.packet.finalRound.length
      }`;
    case 'complete':
      return 'match complete';
    default:
      return '';
  }
}

/** 1 at the top of the clock, 0 when it is gone. */
function clockProgress(state: OacMatchState, now: number): number {
  const left = remainingMs(state, now);
  if (left === null) return 0;
  const total =
    state.directed !== null
      ? state.directed.seconds * 1000
      : state.tossup !== null
        ? state.config.tossupAnswerSeconds * 1000
        : state.alphabet.seconds * 1000;
  if (total <= 0) return 0;
  return Math.max(0, Math.min(1, left / total));
}

function gradedColor(directive: string | null): string {
  if (directive === 'accept') return 'var(--good)';
  if (directive === 'reject') return 'var(--bad)';
  return 'var(--line)';
}

// ---------------------------------------------------------------------------
// Styles. Dark, dense, phone first. No transition: all, no animated geometry.
// ---------------------------------------------------------------------------

const S = {
  wrap: {
    maxWidth: 760,
    margin: '0 auto',
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  } as CSSProperties,
  h2: { margin: 0, fontSize: 18 } as CSSProperties,
  h3: { margin: 0, fontSize: 15 } as CSSProperties,
  hint: {
    margin: 0,
    fontSize: 12,
    color: 'var(--ink-soft)',
    lineHeight: 1.5,
  } as CSSProperties,
  scoreboard: { display: 'flex', gap: 8 } as CSSProperties,
  scoreCard: {
    flex: 1,
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    background: 'var(--panel)',
    border: '1px solid var(--line)',
    borderRadius: 8,
    padding: '8px 12px',
    transition: 'border-color var(--dur-fast) var(--ease-standard)',
  } as CSSProperties,
  teamName: { fontSize: 12, color: 'var(--ink-soft)', flex: 1 } as CSSProperties,
  scoreValue: {
    fontSize: 24,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  } as CSSProperties,
  confer: {
    background: 'transparent',
    border: '1px solid var(--line)',
    borderRadius: 5,
    color: 'var(--ink-soft)',
    fontSize: 10,
    padding: '4px 8px',
  } as CSSProperties,
  statusRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 8,
    fontSize: 11,
    color: 'var(--ink-soft)',
  } as CSSProperties,
  position: { letterSpacing: 0.3 } as CSSProperties,
  clock: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--ink)',
    fontVariantNumeric: 'tabular-nums',
  } as CSSProperties,
  clockTrack: {
    height: 3,
    background: 'var(--panel-2)',
    borderRadius: 2,
    overflow: 'hidden',
  } as CSSProperties,
  clockFill: {
    height: '100%',
    transformOrigin: 'left center',
    willChange: 'transform',
  } as CSSProperties,
  card: {
    background: 'var(--panel)',
    border: '1px solid var(--line)',
    borderRadius: 8,
    padding: '16px 18px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  } as CSSProperties,
  badgeRow: { display: 'flex', gap: 6, flexWrap: 'wrap' } as CSSProperties,
  badge: {
    fontSize: 10,
    letterSpacing: 0.4,
    color: 'var(--ink-soft)',
    border: '1px solid var(--line)',
    borderRadius: 3,
    padding: '2px 6px',
  } as CSSProperties,
  question: {
    margin: 0,
    fontFamily: 'var(--font-read)',
    fontSize: 17,
    lineHeight: 1.62,
  } as CSSProperties,
  caret: {
    display: 'inline-block',
    width: 2,
    height: '1em',
    marginLeft: 3,
    background: 'var(--accent)',
    verticalAlign: 'text-bottom',
    opacity: 0.8,
  } as CSSProperties,
  attempt: { margin: 0, fontSize: 12, color: 'var(--accent)' } as CSSProperties,
  prompt: { margin: 0, fontSize: 12, color: 'var(--gold)' } as CSSProperties,
  scored: { margin: 0, fontSize: 13, color: 'var(--good)' } as CSSProperties,
  missed: { margin: 0, fontSize: 13, color: 'var(--ink-soft)' } as CSSProperties,
  row: { display: 'flex', gap: 8, flexWrap: 'wrap' } as CSSProperties,
  list: {
    margin: 0,
    paddingLeft: 18,
    fontSize: 12,
    color: 'var(--ink-soft)',
    lineHeight: 1.7,
  } as CSSProperties,
  input: {
    flex: 1,
    minWidth: 120,
    background: 'var(--panel-2)',
    border: '1px solid var(--line)',
    borderRadius: 6,
    color: 'var(--ink)',
    padding: '0 12px',
    minHeight: 44,
  } as CSSProperties,
  btn: {
    background: 'transparent',
    color: 'var(--ink)',
    border: '1px solid var(--line)',
    borderRadius: 6,
    padding: '0 16px',
    minHeight: 44,
  } as CSSProperties,
  btnPrimary: {
    background: 'var(--accent)',
    color: '#0b1016',
    border: 0,
    borderRadius: 6,
    padding: '0 16px',
    minHeight: 44,
    fontWeight: 600,
  } as CSSProperties,
  buzz: {
    flex: 1,
    background: 'var(--bad)',
    color: '#fff',
    border: 0,
    borderRadius: 6,
    padding: '0 18px',
    minHeight: 48,
    fontWeight: 700,
    letterSpacing: 0.6,
  } as CSSProperties,
  sheet: {
    margin: 0,
    padding: 0,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  } as CSSProperties,
  sheetRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    borderTop: '1px solid var(--line)',
    paddingTop: 8,
  } as CSSProperties,
  sheetPrompt: { fontSize: 13, lineHeight: 1.5 } as CSSProperties,
  twoWord: {
    marginLeft: 6,
    fontSize: 10,
    color: 'var(--ink-soft)',
    border: '1px solid var(--line)',
    borderRadius: 3,
    padding: '1px 5px',
  } as CSSProperties,
  sheetLabel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    fontSize: 10,
    color: 'var(--ink-soft)',
  } as CSSProperties,
  answerLine: { fontSize: 11, color: 'var(--good)' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 } as CSSProperties,
  th: {
    textAlign: 'left',
    color: 'var(--ink-soft)',
    fontWeight: 400,
    padding: '4px 0',
  } as CSSProperties,
  thNum: {
    textAlign: 'right',
    color: 'var(--ink-soft)',
    fontWeight: 400,
    padding: '4px 0',
  } as CSSProperties,
  td: { padding: '4px 0', borderTop: '1px solid var(--line)' } as CSSProperties,
  tdNum: {
    padding: '4px 0',
    borderTop: '1px solid var(--line)',
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
  } as CSSProperties,
  tdTotal: {
    padding: '6px 0',
    borderTop: '1px solid var(--line)',
    fontWeight: 600,
  } as CSSProperties,
  tdTotalNum: {
    padding: '6px 0',
    borderTop: '1px solid var(--line)',
    textAlign: 'right',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  } as CSSProperties,
  footnote: {
    margin: 0,
    fontSize: 10,
    color: 'var(--ink-soft)',
    lineHeight: 1.6,
  } as CSSProperties,
};

const PICKER: Record<string, CSSProperties> = {
  panel: {
    background: 'var(--panel)',
    border: '1px solid var(--line)',
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  h3: { margin: 0, fontSize: 15, color: 'var(--ink)' },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  listItem: {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    padding: '8px 10px',
    border: '1px solid var(--line)',
    borderRadius: 6,
    background: 'var(--panel-2)',
    fontSize: 13,
  },
  sub: { fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 },
  buttonSmall: {
    background: 'var(--panel-2)',
    color: 'var(--ink)',
    border: '1px solid var(--line)',
    borderRadius: 6,
    padding: '5px 10px',
    fontSize: 12,
  },
  error: { color: 'var(--bad)', fontSize: 13, margin: '0 0 8px' },
};
