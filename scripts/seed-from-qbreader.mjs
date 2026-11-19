#!/usr/bin/env node
/**
 * One-off seeder: pulls packets from qbreader.org and uploads them to this
 * app's server packet store. NOT bundled; run manually.
 *
 * Usage:
 *   node scripts/seed-from-qbreader.mjs \
 *     --base https://qb-trainer.pages.dev \
 *     --username admin --password <pw> \
 *     [--sets "2024 ACF Fall,2024 ACF Regionals"] \
 *     [--since-year 2024] [--max-sets 20] [--limit 500]
 *
 * Without --sets it pulls the qbreader set-list and picks every set whose
 * year is >= --since-year (default: 2022), capped by --max-sets (default: 25)
 * and --limit total packets (default: 500).
 *
 * Skips a packet when the server already has one with the same name.
 */

const QBR = 'https://www.qbreader.org';
const SLEEP_MS = 400;

function parseArgs(argv) {
  const out = {
    base: 'https://qb-trainer.pages.dev',
    username: '',
    password: '',
    sets: null,
    sinceYear: 2022,
    maxSets: 25,
    limit: 500,
  };
  for (let i = 2; i < argv.length; i++) {
    const [k, ...rest] = argv[i].replace(/^--/, '').split('=');
    const v = rest.length ? rest.join('=') : argv[++i];
    switch (k) {
      case 'base': out.base = v; break;
      case 'username': out.username = v; break;
      case 'password': out.password = v; break;
      case 'sets': out.sets = v.split(',').map((s) => s.trim()).filter(Boolean); break;
      case 'since-year': out.sinceYear = parseInt(v, 10); break;
      case 'max-sets': out.maxSets = parseInt(v, 10); break;
      case 'limit': out.limit = parseInt(v, 10); break;
      case 'help': printHelp(); process.exit(0);
      default: throw new Error(`unknown flag: --${k}`);
    }
  }
  if (!out.username || !out.password) {
    throw new Error('--username and --password are required');
  }
  return out;
}

function printHelp() {
  console.log(
    'See file header for usage. The server endpoints are POST /api/auth/signin',
    'and POST /api/packets (requires the session cookie).',
  );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function signIn(base, username, password) {
  const res = await fetch(`${base}/api/auth/signin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`signin failed: ${res.status} ${await res.text()}`);
  const cookie = res.headers.get('set-cookie');
  if (!cookie) throw new Error('signin returned no cookie');
  const sessionCookie = cookie.split(';')[0];
  return sessionCookie;
}

async function listExistingNames(base, cookie) {
  const res = await fetch(`${base}/api/packets`, { headers: { cookie } });
  if (!res.ok) throw new Error(`list failed: ${res.status}`);
  const body = await res.json();
  return new Set((body.packets ?? []).map((p) => p.name));
}

async function qbFetch(path) {
  const res = await fetch(`${QBR}${path}`);
  if (!res.ok) throw new Error(`qbreader ${path} -> ${res.status}`);
  return res.json();
}

const VALID_CATEGORIES = new Set([
  'Literature', 'History', 'Science', 'Fine Arts', 'Religion', 'Mythology',
  'Philosophy', 'Social Science', 'Current Events', 'Geography',
  'Other Academic', 'Pop Culture',
]);

function pickCategory(raw) {
  if (typeof raw === 'string' && VALID_CATEGORIES.has(raw)) return raw;
  return 'Other Academic';
}

function yearOf(setName) {
  const m = /^(\d{4})\b/.exec(setName);
  return m ? parseInt(m[1], 10) : null;
}

function convertTossup(t, setName, setYear, packetNumber) {
  return {
    id: String(t._id ?? crypto.randomUUID()),
    question: String(t.question ?? ''),
    questionSanitized: String(t.question_sanitized ?? t.question ?? ''),
    answer: String(t.answer ?? ''),
    answerSanitized: String(t.answer_sanitized ?? t.answer ?? ''),
    category: pickCategory(t.category),
    subcategory: String(t.subcategory ?? ''),
    difficulty: Number(t.difficulty ?? 3),
    setName,
    setYear: setYear ?? 0,
    packetNumber,
    questionNumber: Number(t.number ?? 0),
    source: 'import',
  };
}

function convertBonus(b, setName, _setYear, _packetNumber) {
  const parts = Array.isArray(b.parts) ? b.parts.map(String) : [];
  const partsSan = Array.isArray(b.parts_sanitized) ? b.parts_sanitized.map(String) : parts;
  const answers = Array.isArray(b.answers) ? b.answers.map(String) : [];
  const answersSan = Array.isArray(b.answers_sanitized) ? b.answers_sanitized.map(String) : answers;
  const values = Array.isArray(b.values) ? b.values.map(Number) : undefined;
  return {
    id: String(b._id ?? crypto.randomUUID()),
    leadin: String(b.leadin ?? ''),
    leadinSanitized: String(b.leadin_sanitized ?? b.leadin ?? ''),
    parts,
    partsSanitized: partsSan,
    answers,
    answersSanitized: answersSan,
    ...(values ? { values } : {}),
    category: pickCategory(b.category),
    subcategory: String(b.subcategory ?? ''),
    difficulty: Number(b.difficulty ?? 3),
    setName,
    source: 'import',
  };
}

async function upload(base, cookie, name, data) {
  const res = await fetch(`${base}/api/packets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ name, data }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`upload ${name}: ${res.status} ${err}`);
  }
  const body = await res.json();
  return body.id;
}

async function main() {
  const args = parseArgs(process.argv);
  console.log(`[seed] base=${args.base} since=${args.sinceYear} maxSets=${args.maxSets} limit=${args.limit}`);
  const cookie = await signIn(args.base, args.username, args.password);
  console.log('[seed] signed in');
  const existing = await listExistingNames(args.base, cookie);
  console.log(`[seed] server already has ${existing.size} packets`);

  let setList;
  if (args.sets) {
    setList = args.sets;
  } else {
    const { setList: all } = await qbFetch('/api/set-list');
    setList = all
      .filter((name) => {
        const y = yearOf(name);
        return y !== null && y >= args.sinceYear;
      })
      .slice(0, args.maxSets);
  }
  console.log(`[seed] ${setList.length} sets to walk`);

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const setName of setList) {
    if (uploaded >= args.limit) break;
    let numPackets;
    try {
      ({ numPackets } = await qbFetch(`/api/num-packets?setName=${encodeURIComponent(setName)}`));
    } catch (e) {
      console.warn(`[skip] ${setName}: ${e.message}`);
      continue;
    }
    const year = yearOf(setName) ?? 0;
    console.log(`\n[set] ${setName}  (${numPackets} packets)`);

    for (let n = 1; n <= numPackets; n++) {
      if (uploaded >= args.limit) break;
      const name = `${setName} — Packet ${n}`;
      if (existing.has(name)) {
        process.stdout.write('·');
        skipped++;
        continue;
      }
      try {
        const packet = await qbFetch(
          `/api/packet?setName=${encodeURIComponent(setName)}&packetNumber=${n}`,
        );
        const tossups = (packet.tossups ?? []).map((t) => convertTossup(t, setName, year, n));
        const bonuses = (packet.bonuses ?? []).map((b) => convertBonus(b, setName, year, n));
        if (tossups.length === 0 && bonuses.length === 0) {
          process.stdout.write('_');
          skipped++;
          continue;
        }
        await upload(args.base, cookie, name, {
          tossups, bonuses, kind: 'standard',
          filename: `qbreader:${setName}:${n}`,
        });
        existing.add(name);
        uploaded++;
        process.stdout.write('✓');
      } catch (e) {
        failed++;
        process.stdout.write('x');
        console.error(`\n[fail] ${name}: ${e.message}`);
      }
      await sleep(SLEEP_MS);
    }
  }

  console.log(`\n[done] uploaded=${uploaded} skipped=${skipped} failed=${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
