/**
 * Integration smoke test against a running room Worker.
 *
 *   npx wrangler dev --port 8787 --local      (in one terminal)
 *   node scripts/room-smoke.mjs               (in another)
 *
 * Unit tests cover the state machine in isolation. This checks the parts they
 * cannot: that the Durable Object actually serializes two simultaneous buzzes,
 * that the answer never crosses the wire before the question resolves, and
 * that websocket plumbing and alarms work in the real runtime.
 *
 * Uses Node's built-in WebSocket and fetch, so it needs no dependencies.
 */

const BASE = process.env.ROOM_BASE ?? 'http://127.0.0.1:8787';
const WS_BASE = BASE.replace('http', 'ws');

let failures = 0;
function check(label, ok, detail = '') {
  const mark = ok ? 'PASS' : 'FAIL';
  if (!ok) failures += 1;
  console.log(`  [${mark}] ${label}${detail ? ` — ${detail}` : ''}`);
}

function openClient(code, name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_BASE}/api/room/${code}/ws`);
    const received = [];
    const waiters = [];

    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      received.push(msg);
      for (let i = waiters.length - 1; i >= 0; i--) {
        const w = waiters[i];
        if (w.match(msg)) {
          waiters.splice(i, 1);
          w.resolve(msg);
        }
      }
    });

    ws.addEventListener('error', reject);

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ t: 'join', name }));
      resolve({
        ws,
        name,
        received,
        send: (m) => ws.send(JSON.stringify(m)),
        waitFor: (match, ms = 8000) =>
          new Promise((res, rej) => {
            const hit = received.find(match);
            if (hit) return res(hit);
            const w = { match, resolve: res };
            waiters.push(w);
            setTimeout(() => {
              const idx = waiters.indexOf(w);
              if (idx >= 0) waiters.splice(idx, 1);
              rej(new Error(`timeout waiting in ${name}`));
            }, ms);
          }),
        close: () => ws.close(),
      });
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('room smoke test\n');

  const res = await fetch(`${BASE}/api/room`, { method: 'POST' });
  const { code } = await res.json();
  check('created a room', typeof code === 'string' && code.length === 4, code);

  const a = await openClient(code, 'Ahalya');
  const b = await openClient(code, 'Maya');

  const welcomeA = await a.waitFor((m) => m.t === 'welcome');
  const welcomeB = await b.waitFor((m) => m.t === 'welcome');
  check('both players got a welcome', Boolean(welcomeA.playerId && welcomeB.playerId));
  check(
    'players got distinct ids',
    welcomeA.playerId !== welcomeB.playerId,
  );

  const bothSeen = await a.waitFor(
    (m) => m.t === 'state' && m.snapshot.players.length === 2,
  );
  check('room shows both players', bothSeen.snapshot.players.length === 2);

  // Start a question.
  a.send({ t: 'start' });
  const reading = await a.waitFor(
    (m) => m.t === 'state' && m.snapshot.phase === 'reading',
    15000,
  );
  const q = reading.snapshot.question;
  check('question started', Boolean(q && q.words.length > 0), `${q?.words.length} words`);
  check('schedule accompanies the question', reading.snapshot.schedule.length === q.words.length);

  // The answer must not be on the wire yet.
  const wireSoFar = JSON.stringify(a.received);
  check(
    'no reveal before resolution',
    reading.snapshot.reveal === null && !wireSoFar.includes('"answerSanitized":"'),
  );

  await sleep(600);

  // THE RACE: both buzz in the same tick.
  a.send({ t: 'buzz' });
  b.send({ t: 'buzz' });

  await sleep(500);

  const buzzMsgs = a.received.filter((m) => m.t === 'buzz');
  const errorsA = a.received.filter((m) => m.t === 'error');
  const errorsB = b.received.filter((m) => m.t === 'error');

  check(
    'exactly one buzz was accepted',
    buzzMsgs.length === 1,
    `${buzzMsgs.length} accepted`,
  );
  check(
    'the loser got an error, not a second buzz',
    errorsA.length + errorsB.length === 1,
    `${errorsA.length + errorsB.length} errors`,
  );

  const winnerId = buzzMsgs[0]?.playerId;
  const winner = winnerId === welcomeA.playerId ? a : b;
  const loser = winnerId === welcomeA.playerId ? b : a;
  console.log(`       winner: ${winner.name}`);

  check(
    'buzz carries a word index and a deadline',
    typeof buzzMsgs[0]?.wordIndex === 'number' &&
      typeof buzzMsgs[0]?.answerDeadline === 'number',
  );

  // Wrong answer from the winner.
  winner.send({ t: 'answer', given: 'definitely not the answer at all' });
  const judged = await a.waitFor((m) => m.t === 'judged');
  check('wrong answer was rejected', judged.directive === 'reject', judged.directive);
  check('neg is minus five', judged.points === -5, String(judged.points));

  const afterNeg = await a.waitFor(
    (m) =>
      m.t === 'state' &&
      m.snapshot.players.some((p) => p.id === winnerId && p.lockedOut),
  );
  check(
    'negged player is locked out',
    afterNeg.snapshot.players.find((p) => p.id === winnerId)?.lockedOut === true,
  );
  check(
    'negged player score is -5',
    afterNeg.snapshot.players.find((p) => p.id === winnerId)?.score === -5,
  );

  // The locked-out player cannot buzz again.
  const errorsBefore = (winner === a ? errorsA : errorsB).length;
  winner.send({ t: 'buzz' });
  await sleep(300);
  const errorsAfter = winner.received.filter((m) => m.t === 'error').length;
  check('locked-out player cannot re-buzz', errorsAfter > errorsBefore);

  // The other player can still buzz, then let the clock run out on them.
  loser.send({ t: 'buzz' });
  const secondBuzz = await loser.waitFor(
    (m) => m.t === 'buzz' && m.playerId !== winnerId,
  );
  check('the other player can still buzz', Boolean(secondBuzz));

  console.log('       waiting out the 5s answer window…');
  const timedOut = await loser.waitFor(
    (m) => m.t === 'judged' && m.playerId !== winnerId,
    12000,
  );
  check('answer window expiry negs automatically', timedOut.points === -5);

  const resolved = await a.waitFor(
    (m) => m.t === 'state' && m.snapshot.phase === 'resolved',
    12000,
  );
  check('question resolved once everyone is locked out', resolved.snapshot.phase === 'resolved');
  check(
    'answer revealed only now',
    typeof resolved.snapshot.reveal?.answerSanitized === 'string' &&
      resolved.snapshot.reveal.answerSanitized.length > 0,
    resolved.snapshot.reveal?.answerSanitized?.slice(0, 40),
  );

  a.close();
  b.close();

  console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nsmoke test crashed:', err.message);
  process.exit(1);
});
