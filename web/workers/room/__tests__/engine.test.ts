import { beforeEach, describe, expect, it } from 'vitest';
import {
  abandonQuestion,
  applyJudgement,
  attachMatch,
  buzz,
  createRoom,
  elapsedAt,
  everyoneLockedOut,
  finishReading,
  isMatchOver,
  join,
  leave,
  nextQuestion,
  nextWake,
  revealedNow,
  snapshot,
  startQuestion,
  timeout,
  type RoomState,
} from '../engine';
import { ANSWER_WINDOW_MS } from '../protocol';
import { buildSchedule } from '../../../src/engine/pacing';

const WORDS =
  'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu'.split(
    ' ',
  );
const SCHEDULE = buildSchedule(WORDS, 150);
const LAST = SCHEDULE[SCHEDULE.length - 1] as number;

const T0 = 1_000_000;

function startRoom(): RoomState {
  const s = createRoom('7F2K');
  join(s, 'p1', 'Ahalya', T0);
  join(s, 'p2', 'Maya', T0);
  startQuestion(
    s,
    {
      question: {
        id: 'q1',
        words: WORDS,
        powerIndex: 4,
        category: 'Science',
        subcategory: 'Biology',
        difficulty: 4,
        setName: 'Test Set',
      },
      answerline: '<b><u>mitochondria</u></b>',
      answerSanitized: 'mitochondria',
      schedule: SCHEDULE,
    },
    T0,
  );
  return s;
}

describe('joining and leaving', () => {
  it('adds a player and marks them connected', () => {
    const s = createRoom('ABCD');
    join(s, 'p1', 'Ahalya', T0);
    expect(s.players.p1?.name).toBe('Ahalya');
    expect(s.players.p1?.connected).toBe(true);
    expect(s.players.p1?.score).toBe(0);
  });

  it('treats a rejoin as a reconnect, preserving score', () => {
    const s = createRoom('ABCD');
    join(s, 'p1', 'Ahalya', T0);
    const player = s.players.p1;
    if (player) player.score = 15;
    leave(s, 'p1', T0);
    expect(s.players.p1?.connected).toBe(false);
    join(s, 'p1', 'Ahalya', T0 + 1000);
    expect(s.players.p1?.connected).toBe(true);
    expect(s.players.p1?.score).toBe(15);
  });

  it('sorts the player list by score', () => {
    const s = createRoom('ABCD');
    join(s, 'p1', 'A', T0);
    join(s, 'p2', 'B', T0);
    const second = s.players.p2;
    if (second) second.score = 30;
    expect(snapshot(s, T0).players[0]?.id).toBe('p2');
  });
});

describe('the reading clock', () => {
  it('reveals nothing at the instant the question starts', () => {
    const s = startRoom();
    expect(revealedNow(s, T0)).toBe(1);
  });

  it('advances with the server clock', () => {
    const s = startRoom();
    const mid = revealedNow(s, T0 + LAST / 2);
    expect(mid).toBeGreaterThan(1);
    expect(mid).toBeLessThan(WORDS.length);
  });

  it('never exceeds the word count', () => {
    const s = startRoom();
    expect(revealedNow(s, T0 + LAST * 10)).toBe(WORDS.length);
  });

  it('does not leak the answer while reading', () => {
    const s = startRoom();
    const snap = snapshot(s, T0 + 100);
    expect(snap.reveal).toBeNull();
    expect(JSON.stringify(snap)).not.toContain('mitochondria');
  });
});

describe('buzz arbitration', () => {
  it('freezes the clock at the buzzing word', () => {
    const s = startRoom();
    const at = T0 + (SCHEDULE[3] as number) + 5;
    buzz(s, 'p1', at);
    expect(s.phase).toBe('buzzed');
    expect(s.buzzer).toBe('p1');
    expect(s.buzzWordIndex).toBe(3);
    // The clock is stopped: time passing no longer reveals words.
    expect(revealedNow(s, at + 5000)).toBe(4);
  });

  it('rejects a second buzz while someone holds the buzz', () => {
    const s = startRoom();
    buzz(s, 'p1', T0 + 100);
    const out = buzz(s, 'p2', T0 + 120);
    expect(out.messages[0]).toMatchObject({ t: 'error' });
    expect(s.buzzer).toBe('p1');
  });

  it('first arrival wins, because the DO handles messages one at a time', () => {
    const s = startRoom();
    const a = buzz(s, 'p2', T0 + 500);
    const b = buzz(s, 'p1', T0 + 501);
    expect(a.messages[0]).toMatchObject({ t: 'buzz', playerId: 'p2' });
    expect(b.messages[0]).toMatchObject({ t: 'error' });
  });

  it('rejects a buzz from someone not in the room', () => {
    const s = startRoom();
    const out = buzz(s, 'ghost', T0 + 100);
    expect(out.messages[0]).toMatchObject({ t: 'error' });
    expect(s.phase).toBe('reading');
  });

  it('rejects a buzz in the lobby', () => {
    const s = createRoom('ABCD');
    join(s, 'p1', 'A', T0);
    expect(buzz(s, 'p1', T0).messages[0]).toMatchObject({ t: 'error' });
  });

  it('sets a five second answer window', () => {
    const s = startRoom();
    buzz(s, 'p1', T0 + 100);
    expect(s.answerDeadline).toBe(T0 + 100 + ANSWER_WINDOW_MS);
  });
});

describe('judging', () => {
  it('awards 15 for a correct buzz inside power', () => {
    const s = startRoom();
    buzz(s, 'p1', T0 + (SCHEDULE[2] as number));
    applyJudgement(s, 'p1', 'mitochondria', { directive: 'accept' }, T0 + 2000);
    expect(s.players.p1?.score).toBe(15);
    expect(s.phase).toBe('resolved');
    expect(s.reveal?.powered).toBe(true);
    expect(s.reveal?.winner).toBe('p1');
  });

  it('awards 10 for a correct buzz after power', () => {
    const s = startRoom();
    buzz(s, 'p1', T0 + (SCHEDULE[8] as number));
    applyJudgement(s, 'p1', 'mitochondria', { directive: 'accept' }, T0 + 9000);
    expect(s.players.p1?.score).toBe(10);
    expect(s.reveal?.powered).toBe(false);
  });

  it('reveals the answer only once resolved', () => {
    const s = startRoom();
    buzz(s, 'p1', T0 + 100);
    applyJudgement(s, 'p1', 'mitochondria', { directive: 'accept' }, T0 + 500);
    expect(snapshot(s, T0 + 600).reveal?.answerSanitized).toBe('mitochondria');
  });

  it('negs a wrong answer and locks that player out', () => {
    const s = startRoom();
    buzz(s, 'p1', T0 + (SCHEDULE[2] as number));
    applyJudgement(s, 'p1', 'wrong', { directive: 'reject' }, T0 + 2000);
    expect(s.players.p1?.score).toBe(-5);
    expect(s.lockedOut).toContain('p1');
    expect(s.buzzer).toBeNull();
  });

  it('resumes the clock from exactly where it stopped after a neg', () => {
    const s = startRoom();
    const buzzAt = T0 + (SCHEDULE[3] as number) + 5;
    buzz(s, 'p1', buzzAt);
    const frozen = s.frozenElapsed;

    // Three seconds pass while the answer is given and judged.
    const judgedAt = buzzAt + 3000;
    applyJudgement(s, 'p1', 'wrong', { directive: 'reject' }, judgedAt);

    expect(s.phase).toBe('reading');
    // No words were skipped by the pause.
    expect(revealedNow(s, judgedAt)).toBe(4);
    expect(elapsedAt(s, judgedAt)).toBeCloseTo(frozen, 5);
    // And it keeps going from there.
    expect(revealedNow(s, judgedAt + LAST)).toBe(WORDS.length);
  });

  it('stops a locked-out player buzzing again on the same question', () => {
    const s = startRoom();
    buzz(s, 'p1', T0 + 100);
    applyJudgement(s, 'p1', 'wrong', { directive: 'reject' }, T0 + 500);
    const out = buzz(s, 'p1', T0 + 900);
    expect(out.messages[0]).toMatchObject({ t: 'error' });
    expect(s.buzzer).toBeNull();
  });

  it('lets the other player buzz after a neg', () => {
    const s = startRoom();
    buzz(s, 'p1', T0 + 100);
    applyJudgement(s, 'p1', 'wrong', { directive: 'reject' }, T0 + 500);
    const out = buzz(s, 'p2', T0 + 900);
    expect(out.messages[0]).toMatchObject({ t: 'buzz', playerId: 'p2' });
  });

  it('clears lockouts on the next question', () => {
    const s = startRoom();
    buzz(s, 'p1', T0 + 100);
    applyJudgement(s, 'p1', 'wrong', { directive: 'reject' }, T0 + 500);
    nextQuestion(s, T0 + 1000);
    expect(s.lockedOut).toEqual([]);
    expect(s.phase).toBe('lobby');
  });

  it('keeps the question open on a prompt and restarts the window', () => {
    const s = startRoom();
    buzz(s, 'p1', T0 + 100);
    const at = T0 + 2000;
    const out = applyJudgement(
      s,
      'p1',
      'partial',
      { directive: 'prompt', directedPrompt: 'what theorem?' },
      at,
    );
    expect(s.phase).toBe('buzzed');
    expect(s.buzzer).toBe('p1');
    expect(s.answerDeadline).toBe(at + ANSWER_WINDOW_MS);
    expect(s.players.p1?.score).toBe(0);
    expect(out.messages[0]).toMatchObject({
      t: 'judged',
      directive: 'prompt',
      resolved: false,
      directedPrompt: 'what theorem?',
    });
  });

  it('refuses a judgement from a player who does not hold the buzz', () => {
    const s = startRoom();
    buzz(s, 'p1', T0 + 100);
    const out = applyJudgement(s, 'p2', 'steal', { directive: 'accept' }, T0 + 200);
    expect(out.messages[0]).toMatchObject({ t: 'error' });
    expect(s.players.p2?.score).toBe(0);
  });
});

describe('timeouts and endings', () => {
  it('treats an expired answer window as an incorrect buzz', () => {
    const s = startRoom();
    buzz(s, 'p1', T0 + 100);
    timeout(s, T0 + 100 + ANSWER_WINDOW_MS);
    expect(s.players.p1?.score).toBe(-5);
    expect(s.lockedOut).toContain('p1');
  });

  it('resolves the question when a neg happens after the question finished reading', () => {
    const s = startRoom();
    buzz(s, 'p1', T0 + LAST + 10);
    applyJudgement(s, 'p1', 'wrong', { directive: 'reject' }, T0 + LAST + 500);
    expect(s.phase).toBe('resolved');
  });

  it('resolves with no winner when reading completes unbuzzed', () => {
    const s = startRoom();
    finishReading(s, T0 + LAST + 1);
    expect(s.phase).toBe('resolved');
    expect(s.reveal?.winner).toBeNull();
    expect(s.reveal?.answerSanitized).toBe('mitochondria');
  });

  it('does nothing if asked to finish before the question is read', () => {
    const s = startRoom();
    finishReading(s, T0 + 10);
    expect(s.phase).toBe('reading');
  });

  it('releases the buzz when the buzzer disconnects, instead of hanging', () => {
    const s = startRoom();
    buzz(s, 'p1', T0 + 100);
    leave(s, 'p1', T0 + 300);
    expect(s.players.p1?.connected).toBe(false);
    expect(s.buzzer).toBeNull();
    expect(s.players.p1?.score).toBe(-5);
  });

  it('knows when everyone has negged out', () => {
    const s = startRoom();
    expect(everyoneLockedOut(s)).toBe(false);
    buzz(s, 'p1', T0 + 100);
    applyJudgement(s, 'p1', 'x', { directive: 'reject' }, T0 + 200);
    buzz(s, 'p2', T0 + 300);
    applyJudgement(s, 'p2', 'x', { directive: 'reject' }, T0 + 400);
    expect(everyoneLockedOut(s)).toBe(true);
  });
});

describe('nextWake', () => {
  it('is null in the lobby and once resolved', () => {
    const s = createRoom('ABCD');
    expect(nextWake(s, T0)).toBeNull();
    const r = startRoom();
    finishReading(r, T0 + LAST + 1);
    expect(nextWake(r, T0 + LAST + 2)).toBeNull();
  });

  it('is the end of reading while reading', () => {
    const s = startRoom();
    const wake = nextWake(s, T0);
    expect(wake).toBeCloseTo(T0 + LAST, -1);
  });

  it('is the answer deadline while buzzed', () => {
    const s = startRoom();
    buzz(s, 'p1', T0 + 100);
    expect(nextWake(s, T0 + 200)).toBe(s.answerDeadline);
  });

  it('accounts for time already read after a resume', () => {
    const s = startRoom();
    const buzzAt = T0 + (SCHEDULE[5] as number);
    buzz(s, 'p1', buzzAt);
    const judgedAt = buzzAt + 3000;
    applyJudgement(s, 'p1', 'wrong', { directive: 'reject' }, judgedAt);
    // Only the unread remainder is left, not the full question again.
    const wake = nextWake(s, judgedAt) as number;
    expect(wake - judgedAt).toBeLessThan(LAST);
    expect(wake - judgedAt).toBeCloseTo(LAST - (SCHEDULE[5] as number), -2);
  });

  it('regression: a buzz after an older pending deadline still gets a wake', () => {
    // The bug this guards: an alarm armed only when sooner than a pending one
    // meant this second buzz never got its own deadline and the room hung.
    const s = startRoom();
    buzz(s, 'p1', T0 + 100);
    applyJudgement(s, 'p1', 'wrong', { directive: 'reject' }, T0 + 500);
    const secondBuzzAt = T0 + 1000;
    buzz(s, 'p2', secondBuzzAt);
    expect(nextWake(s, secondBuzzAt)).toBe(secondBuzzAt + ANSWER_WINDOW_MS);
  });
});

describe('abandonQuestion', () => {
  it('resolves mid-read when nobody can buzz any more', () => {
    const s = startRoom();
    abandonQuestion(s, T0 + 500);
    expect(s.phase).toBe('resolved');
    expect(s.reveal?.winner).toBeNull();
    expect(s.reveal?.answerSanitized).toBe('mitochondria');
  });

  it('does nothing once already resolved', () => {
    const s = startRoom();
    finishReading(s, T0 + LAST + 1);
    const out = abandonQuestion(s, T0 + LAST + 2);
    expect(out.messages).toHaveLength(0);
  });
});

describe('a whole question, end to end', () => {
  let s: RoomState;
  beforeEach(() => {
    s = startRoom();
  });

  it('p1 negs early, p2 takes it later for 10', () => {
    buzz(s, 'p1', T0 + (SCHEDULE[2] as number));
    applyJudgement(s, 'p1', 'nope', { directive: 'reject' }, T0 + 1500);

    const resumeBase = T0 + 1500;
    buzz(s, 'p2', resumeBase + (SCHEDULE[9] as number));
    applyJudgement(
      s,
      'p2',
      'mitochondria',
      { directive: 'accept' },
      resumeBase + 9000,
    );

    expect(s.players.p1?.score).toBe(-5);
    expect(s.players.p2?.score).toBe(10);
    expect(s.phase).toBe('resolved');
    expect(s.reveal?.winner).toBe('p2');

    const snap = snapshot(s, resumeBase + 9100);
    expect(snap.players[0]?.id).toBe('p2');
    expect(snap.revealed).toBe(WORDS.length);
  });
});

// ---------------------------------------------------------------------------
// Bracket H2H match attachment
// ---------------------------------------------------------------------------

function startMatchRoom(regulationTossups = 2): RoomState {
  const s = createRoom('7F2K');
  attachMatch(s, {
    tournamentId: 1,
    matchId: 1,
    entrantAKey: 'u:1',
    entrantBKey: 'u:2',
    regulationTossups,
  });
  join(s, 'p1', 'Ahalya', T0, 'a');
  join(s, 'p2', 'Maya', T0, 'b');
  startQuestion(
    s,
    {
      question: {
        id: 'q1',
        words: WORDS,
        powerIndex: 4,
        category: 'Science',
        subcategory: 'Biology',
        difficulty: 4,
        setName: 'Test Set',
      },
      answerline: '<b><u>mitochondria</u></b>',
      answerSanitized: 'mitochondria',
      schedule: SCHEDULE,
    },
    T0,
  );
  return s;
}

describe('bracket match attachment', () => {
  it('is a no-op for an ordinary room', () => {
    const s = startRoom();
    expect(s.match).toBeNull();
    expect(snapshot(s, T0).match).toBeNull();
    expect(isMatchOver(s)).toBe(false);
  });

  it('records each player\'s side and never overwrites it with a plain rejoin', () => {
    const s = startMatchRoom();
    expect(s.players.p1?.side).toBe('a');
    expect(s.players.p2?.side).toBe('b');
    join(s, 'p1', 'Ahalya', T0 + 1000); // rejoin without a side
    expect(s.players.p1?.side).toBe('a');
  });

  it('tallies a side win toward sideScores and tossupsPlayed', () => {
    const s = startMatchRoom();
    buzz(s, 'p1', T0 + (SCHEDULE[4] as number));
    applyJudgement(s, 'p1', 'mitochondria', { directive: 'accept' }, T0 + (SCHEDULE[4] as number) + 500);

    expect(s.match?.tossupsPlayed).toBe(1);
    expect(s.match?.sideScores.a).toBeGreaterThan(0);
    expect(s.match?.sideScores.b).toBe(0);
    expect(snapshot(s, T0).match?.sideScores).toEqual(s.match?.sideScores);
  });

  it('gives the other side credit after a neg, not the negging side', () => {
    const s = startMatchRoom();
    const buzzTime = T0 + (SCHEDULE[4] as number);
    buzz(s, 'p1', buzzTime);
    applyJudgement(s, 'p1', 'wrong', { directive: 'reject' }, buzzTime + 500);
    expect(s.phase).toBe('reading'); // p2 can still buzz

    buzz(s, 'p2', buzzTime + 1500);
    applyJudgement(s, 'p2', 'mitochondria', { directive: 'accept' }, buzzTime + 2000);

    expect(s.match?.tossupsPlayed).toBe(1);
    expect(s.match?.sideScores.a).toBe(0);
    expect(s.match?.sideScores.b).toBeGreaterThan(0);
  });

  it('counts a dead ball as a tossup played with no side score change', () => {
    const s = startMatchRoom();
    finishReading(s, T0 + LAST + 1);
    expect(s.phase).toBe('resolved');
    expect(s.match?.tossupsPlayed).toBe(1);
    expect(s.match?.sideScores).toEqual({ a: 0, b: 0 });
  });

  it('reports over once regulation is reached', () => {
    const s = startMatchRoom(1);
    expect(isMatchOver(s)).toBe(false);
    finishReading(s, T0 + LAST + 1);
    expect(isMatchOver(s)).toBe(true);
    expect(snapshot(s, T0 + LAST + 1).match?.over).toBe(true);
  });

  it('does not credit a score to a player with no side', () => {
    const s = createRoom('ABCD');
    attachMatch(s, { tournamentId: 1, matchId: 1, entrantAKey: 'u:1', entrantBKey: 'u:2', regulationTossups: 5 });
    join(s, 'spectator', 'Nobody', T0); // no side
    startQuestion(
      s,
      {
        question: { id: 'q1', words: WORDS, powerIndex: null, category: 'x', subcategory: 'x', difficulty: 1, setName: 'x' },
        answerline: 'answer',
        answerSanitized: 'answer',
        schedule: SCHEDULE,
      },
      T0,
    );
    buzz(s, 'spectator', T0 + (SCHEDULE[2] as number));
    applyJudgement(s, 'spectator', 'answer', { directive: 'accept' }, T0 + (SCHEDULE[2] as number) + 100);
    expect(s.match?.tossupsPlayed).toBe(1);
    expect(s.match?.sideScores).toEqual({ a: 0, b: 0 });
  });
});
