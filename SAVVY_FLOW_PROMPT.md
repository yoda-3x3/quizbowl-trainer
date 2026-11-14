# /savvy-flow brief — Quizbowl + Academic Challenge trainer (BULK WORK ONLY)

Paste everything below the line into the CLI after `/savvy-flow`.

---

## Context you need (you have no prior conversation; this is complete)

We are building a quizbowl + Ohio Academic Competition practice app as an
installable PWA. Stack is **React + Vite + TypeScript** (SPA, no SSR), hosted on
**Cloudflare Pages**, realtime rooms on **Cloudflare Durable Objects**, native
shell via **Capacitor**. Dark theme. Phone is a first-class target.

Project root: `C:\Users\reach\Dance\quizbowl_trainer\web\`
Legacy Python app lives in the parent folder. **Do not modify anything outside `web/`.**

### Division of labour — READ THIS FIRST

The timing-sensitive core is being written separately by another agent. You are
doing the bulk. **These paths are owned by someone else. Do not create, edit, or
rename them:**

```
web/src/types.ts              <- shared types (contracts below)
web/src/engine/reader.ts      <- word reveal + buzz timing + pacing
web/src/engine/judge.ts       <- answer checking
web/src/engine/power.ts       <- "(*)" parsing, OAC phrasing conversion
web/src/engine/scoring.ts     <- pyramidal scoring
web/src/engine/log.ts         <- event log read/write
web/src/data/qbreader.ts      <- API normalization + prefetch queue
web/src/data/bundled.ts       <- GENERATED, see scripts/gen-bundled.mjs
web/src/learn/derive.ts       <- Learn tab data derivations
web/src/learn/chapters/Misses.tsx  <- the signature move
web/workers/room/**           <- Durable Object room server
```

**These already exist and are done.** The project is scaffolded, dependencies
are installed, `npm run dev`, `npm run typecheck` and `npm test` all pass, and
71 engine tests are green. Run `npm test` before and after your changes; if a
test you did not touch starts failing, you broke a contract.

`src/App.tsx` is a temporary harness proving the engine works end to end. Card A
replaces it. You may delete it when Card A lands.

If you need something from those files, **import from them and assume the
contracts below are exact**. If a contract looks wrong or insufficient, write
your assumption in a `NOTES.md` at repo root and continue. Do not stub out a
competing version of an owned file.

---

## Contracts (exact — code against these)

```ts
// web/src/types.ts  (owned by core agent, reproduced here verbatim)

export type Category =
  | 'Literature' | 'History' | 'Science' | 'Fine Arts' | 'Religion'
  | 'Mythology' | 'Philosophy' | 'Social Science' | 'Current Events'
  | 'Geography' | 'Other Academic' | 'Pop Culture';

export interface Tossup {
  id: string;
  question: string;             // HTML; may contain <b> and <u>
  questionSanitized: string;    // plain text; RETAINS the literal "(*)"
  answer: string;               // HTML answerline with <b><u>required</u></b>
  answerSanitized: string;
  category: Category;
  subcategory: string;
  alternateSubcategory?: string;
  difficulty: number;           // 0-10
  setName: string;
  setYear: number;
  packetNumber: number;
  questionNumber: number;
  source: 'qbreader' | 'bundled' | 'import';
}

export interface Bonus {
  id: string;
  leadin: string;
  leadinSanitized: string;
  parts: string[];
  partsSanitized: string[];
  answers: string[];            // MAY differ in length from parts - guard it
  answersSanitized: string[];
  values?: number[];            // often absent; default 10 per part
  category: Category;
  subcategory: string;
  difficulty: number;
  setName: string;
  source: 'qbreader' | 'bundled' | 'import';
}

export type Directive = 'accept' | 'prompt' | 'reject';

export interface AttemptEvent {
  id: string;
  at: number;                   // epoch ms
  mode: 'tossup' | 'bonus' | 'oac' | 'ear';
  questionId: string;
  category: Category;
  subcategory: string;
  difficulty: number;
  buzzWordIndex: number | null; // null = never buzzed, answered at end
  totalWords: number;
  powerWordIndex: number | null;
  givenAnswer: string;
  directive: Directive | null;
  points: number;
  msToAnswer: number | null;
}
```

```ts
// web/src/engine/judge.ts  (owned)
export function judge(
  answerline: string,
  given: string,
  strictness?: number          // default 7
): { directive: Directive; directedPrompt?: string };
```

```ts
// web/src/engine/reader.ts  (owned)
export interface ReaderHandle {
  words: string[];
  revealed: number;             // count of words shown
  powerIndex: number | null;    // index of last in-power word
  phase: 'idle' | 'reading' | 'buzzed' | 'done';
  start(): void;
  buzz(): void;
  submit(given: string): void;
  reset(t: Tossup): void;
}
export function useReader(opts: {
  wpm: number;
  postBuzzSeconds: number;      // default 5
  onResolved(e: AttemptEvent): void;
}): ReaderHandle;
```

```ts
// web/src/engine/log.ts  (owned)
export function append(e: AttemptEvent): Promise<void>;
export function all(): Promise<AttemptEvent[]>;
export function clear(): Promise<void>;
```

---

## Verified external facts (do not re-research these)

### QB Reader API — questions come from here, no backend needed

- Base URL is **exactly** `https://www.qbreader.org/api` — the `www.` is required.
  The bare `qbreader.org` host 301-redirects **without** CORS headers.
- Every endpoint returns `Access-Control-Allow-Origin: *`. Call it straight from
  the browser. No key, no auth, no proxy.
- Rate limit is **20 requests/second**. Prefetch with `number=20` in one call
  rather than 20 calls. A 429 returns **plain text, not JSON** — do not blindly
  call `.json()` on a failed response.
- `GET /random-tossup` params: `difficulties` (comma list), `categories`,
  `subcategories`, `alternateSubcategories`, `number`, `minYear`, `maxYear`,
  `powermarkOnly`, `standardOnly`. Returns `{ tossups: [...] }`.
- `GET /random-bonus` — same, but `threePartBonuses` instead of `powermarkOnly`.
  Returns `{ bonuses: [...] }`.
- `GET /set-list?expand=true` lists all sets. `GET /packet?setName=X&packetNumber=N`
  fetches one packet.
- `GET /frequency-list?subcategory=X` returns most-frequent answers. **This powers
  the Learn tab's lessons chapter.**
- **Category capitalization is load-bearing.** `categories=science` is silently
  ignored and returns unfiltered results. It must be `Science`.
- Difficulty scale: 0 Pop Culture, 1 Middle School, 2 Easy HS, 3 Regular HS,
  4 Hard HS, 5 National HS, 6-9 College tiers, 10 Open. **Default the app to 3-5.**
- Power mark is the **literal string `(*)`** in `question` and `questionSanitized`.
  Split on it. Do NOT key off `<b>` — it is overloaded with moderator
  instructions like `(read slowly)`.
- Answerline format: `<b><u>required part</u></b> [prompt on <u>X</u>]`, with
  directives `accept`, `prompt`, `reject`, `anti-prompt`, plus specials
  `accept either` and `prompt on partial`.
- Licence MIT, no attribution legally required. Credit QB Reader anyway in the
  About screen.

### Answer checking — already solved, use the package

`npm i qb-answer-checker` (ISC licence). It is the same logic as QB Reader's own
`/check-answer` endpoint, which is a one-line wrapper around it. Runs
client-side, so judging is instant and works offline. Handles accept / prompt /
reject, directed prompts, Damerau-Levenshtein typo tolerance and stemming. The
core agent wraps it in `judge()`. **Do not write your own answer matcher.**

### quizbowlpackets.com — the import source

- Four sibling archives, same app: `www.` (610 HS sets), `collegiate.`,
  `popculture.`, `ms.` — about 2,341 sets total.
- Set page: `https://www.quizbowlpackets.com/<integer_id>/`
- Files: `https://files.quizbowlpackets.com/<set_id>/<urlencoded filename>` —
  separate host, no auth, no referer check.
- **No JSON API**, but the homepage HTML embeds the full catalogue in the Next.js
  RSC payload (`self.__next_f.push([1, "..."])`). Each record has `set_id`,
  `set_name`, `difficulty` (1-4 = Novice/Regular/Regular-Plus/Nationals), `year`,
  `subjects`. One GET per archive homepage enumerates everything.
- Per-set file list is plain server-rendered `<a href="https://files...">`.
  No JS execution needed.
- **Prefer `.docx` over `.pdf`.** Modern sets have both. In docx, the power span
  and the required answer are explicit `<w:b>` / `<w:u>` runs. `pdftotext` loses
  them and introduces a spurious space after the first underlined letter, e.g.
  `ANSWER: A ristotle`, `ANSWER: i nvasion of Earth`. If parsing PDF you must
  repair `^(\w) (\w+)` in answer lines.
- A `.docx` is an ordinary zip: unzip and read `word/document.xml`.

#### LEGAL CONSTRAINT — this is not optional

`robots.txt` explicitly disallows `ClaudeBot`, `anthropic-ai`, `Claude-Web`,
`GPTBot`, `CCBot` and about twenty other agents with `Disallow: /`, and asserts
`Content-Signal: ai-train=no, use=reference`. The site states packets are
released "for study and practice use" and "may not be used for tournaments or
anything that involves the exchange of money".

Therefore the importer must be:
- **user-initiated only** — the human taps a specific packet, their device fetches it
- **on demand** — nothing prefetched, crawled, or mirrored in bulk
- **cached locally only** — never redistributed, never bundled into the repo

Do **not** write a crawler, a bulk downloader, or a scheduled sync, and do not
commit any downloaded packet file. Do not spoof a browser User-Agent; identify
the client honestly.

### Ohio Academic Competition (OAC) rules — needed for the AC mode

"Academic Challenge" names three different things. We are implementing **Ohio
Academic Competition**, the league/tournament format. (The Cleveland WEWS TV show
and the YSU WYTV show are different and publish nothing. The choose-a-category
board belongs to the YSU show — **OAC has no category board**, do not build one.)

A match is **three rounds**. Substitutions allowed between rounds. Sides are
Team A (moderator's left) and Team B. **Conferral is permitted before, during and
after questions** — this is the format's signature, and the UI must support a
team confer affordance.

**Round 1 — Category Round.** Ten categories in fixed order: American Literature,
Mathematics, World History, Fine Arts, Life Science, English/World Literature,
U.S. Government/Economics, Physical Science, World Geography, U.S. History.
Each category has exactly three questions:

1. A **directed** question to one team. **No buzzing.** Two attempts within
   **10 seconds**. First attempt correct = **2 points**, second = **1 point**.
   If both wrong or time expires, the other team may **steal for 1 point**, and
   if the directed team missed twice early the opponent gets the *remaining*
   clock.
2. A directed question to the other team, same rules.
3. A **pyramidal tossup** read to both teams, one answer opportunity each,
   worth **2 points**. Buzzing applies here only.

Order alternates: Team A takes the first directed question in category 1,
Team B in category 2, and so on. Math questions self-declare a longer clock,
e.g. "This is a 20-second calculation question."

**Round 2 — Alphabet Round.** A written worksheet, not a buzzer round. Both
teams get identical questions. **Every answer begins with the same letter**,
announced up front. **4 minutes, 20 questions, 2 points each.** Short one-liners.
Some are flagged `(TWO WORD ANSWER)`.

**Round 3 — Final Round.** **20 pyramidal tossups, 2 points each**, read to both
teams. Drawn from the ten category subjects plus Mythology, Religion, Philosophy
and Social Science.

**Scoring invariants:** there are **no negative points anywhere**, and **no bonus
structure at all** — no tossup/bonus pairing, no 30-point bonuses, no power
marks. Maximum match score is 140. A perfect alphabet round may carry a 5-point
bonus in some rulebooks; make it a config flag defaulting to off.

**Authentic question source:** 18 real OAC packets exist at
`https://www.quizbowlpackets.com/1591/` as `oac-01.pdf` through `oac-18.pdf`
(PDF only, about 70 questions each, roughly 1,260 total, about 18 full matches).
It is the only OAC set in the entire archive — nothing else exists anywhere.

**Unlimited question source:** HSAPQ built the OAC final round by mechanically
stripping `For 10 points,` out of its pyramidal tossups. This is verified — the
same Truman question appears in both their VHSL pyramidal set and their OAC set,
differing only in that clause. So: take any QB Reader tossup and rewrite
`For 10 points, name this X` to `Name this X`, and strip any `(*)`. That is the
sanctioned conversion. The alphabet round is likewise generatable — pick a
letter, pull answers starting with it, use each question's giveaway clause as
the clue.

---

## TASK CARDS

Each card is self-contained. Respect the file boundaries so cards do not collide.
Work the cards in the order given where dependencies exist.

---

### CARD A — App shell, routing, and the practice screens
**Suggested worker: savvy-medium**

**Create:**
```
web/src/ui/           (shared primitives: Button, Field, Sheet, TabBar, StatPill)
web/src/screens/Home.tsx
web/src/screens/Tossup.tsx
web/src/screens/Bonus.tsx
web/src/screens/Settings.tsx
```
The build config, `index.html`, `main.tsx` and `theme.css` already exist and
work. Extend `theme.css`; do not replace it.

**Do NOT create `src/data/qbreader.ts`** — it is already written and owned. It
exports `fetchTossups(filters, n)`, `fetchBonuses(filters, n)`,
`fetchFrequencyList(subcategory, limit)`, a `TossupQueue` class with prefetching
and a shuffled-deck drain, and `defaultFilters()`. Import and use them.

**Contract:**
- Vite + React + TS, SPA. Bottom tab bar: Practice / Learn / Rooms / Settings.
- `Tossup.tsx` consumes `useReader()` from the owned engine. It renders
  `reader.words.slice(0, reader.revealed)` and nothing else — **do not implement
  reveal timing yourself**, the engine owns it. Highlight the power word using
  `reader.powerIndex`.
- Question text in a serif face (Georgia or similar) on a dark card. The legacy
  app used Georgia 17 and it reads well — keep that.
- Buzz is spacebar on desktop and a large thumb-reachable button on phone.
  Enter submits.
- `Settings.tsx` persists words-per-minute, post-buzz seconds (default 5),
  difficulty range (default 3-5), category and subcategory multi-select, and
  judge strictness. Persist to `localStorage` wrapped in try/catch — it throws
  in private mode.
- Dark theme via CSS custom properties on `:root`. Dense, data-forward
  aesthetic: small type, numbers visible, minimal chrome.

**Still to do on data:** the queue currently falls back to the bundled offline
pack when the network fails, but does not yet cache *fetched* questions to
IndexedDB. Add that caching in a new file `src/data/cache.ts` and call it from
your screens. Do not edit `qbreader.ts` to do it.

**Done when:** `npm run dev` serves a working tossup loop — question reveals,
space buzzes, Enter submits, result shows, next question loads. No console
errors. Works at 390px wide. Verify by loading it in a browser and screenshotting.

---

### CARD B — PWA install + Capacitor shells
**Suggested worker: savvy-light**
**Depends on: Card A**

**Create:**
```
web/public/manifest.webmanifest
web/public/icons/        (192, 512, maskable)
web/src/sw.ts            (or vite-plugin-pwa config)
web/capacitor.config.ts
web/android/             (via npx cap add android)
web/ios/                 (via npx cap add ios)
```

**Contract:**
- Installable on iOS Safari and Android Chrome: correct manifest, `display:
  standalone`, theme colour matching the dark theme, apple-touch-icon.
- Service worker precaches the app shell and the bundled offline question pack.
  Network-first for QB Reader calls, cache-first for the shell.
- Capacitor wraps the same `dist/` output. Do not fork the codebase.
- **The web build is deliberately solo-practice-only.** Gate Rooms and Import
  behind an `isNativeOrInstalled()` check and show a "get the app" affordance in
  the browser.

**Done when:** a production build passes Lighthouse's installability check and
`npx cap sync` completes for both platforms without error. Report whether you
could run an emulator; do not claim a device test you did not perform.

---

### CARD C — Packet importer, two parsers
**Suggested worker: savvy-heavy**

**Create:**
```
web/src/import/catalogue.ts     (enumerate sets from the RSC payload)
web/src/import/fetchPacket.ts   (user-initiated single-file fetch)
web/src/import/parseStandard.ts
web/src/import/parseOac.ts
web/src/import/docx.ts          (unzip + read word/document.xml)
web/src/import/__tests__/
web/src/screens/Import.tsx
```

**Re-read the LEGAL CONSTRAINT section above before writing any fetch code.**
User-initiated, on demand, cached locally, nothing committed, honest User-Agent.

**Parser 1 — standard pyramidal grammar:**
- Tossup delimiter: `^\d+\. ` at paragraph start, within the `- Tossups` section.
- Answer line: literal `ANSWER:` at line start. Directives inside `[ ... ]`,
  semicolon-separated: `accept`, `prompt on`, `do not accept or prompt on`.
- Power mark: literal `(*)` inline.
- Category tag on its own line after the answer: `<Author, Category - Subcategory>`.
- Bonuses live in a `- Bonuses` section: leadin, then three `[10]` parts each
  followed by its own `ANSWER:`, then one category tag.

**Parser 2 — OAC grammar (genuinely different, needs its own code path):**
- Section headers are **centred**, so they carry leading whitespace — do not
  anchor on column 0: `CATEGORY ROUND`, `Alphabet Round - Letter <X>`,
  `Alphabet Round - Letter <X> ANSWERS`, `FINAL ROUND`.
- Category header: `^<Category>: <Theme>` e.g. `Fine Arts: American Landmarks`.
- Question markers: `^Team A:`, `^Team B:`, `^Tossup:` — the A/B assignment is
  baked into the file and alternates by category.
- Answers are indented roughly 32 spaces and start `ANSWER:`. Alternates use
  `[or ...]`, **not** `[accept ...]`.
- Calculation questions declare their own clock in the prompt text.
- Alphabet round: 20 lines `^\d+\. `, inline `(TWO WORD ANSWER)` flag, and the
  answers sit on a **separate page later in the same PDF** — join them by index.
- Final round: 20 tossups with `ANSWER:` at column 0, each followed by a
  right-aligned HSAPQ id like `019-14-103-01101`. No `(*)`, no `[10]`.
- Strip page footers matching `20\d\d OAC \d+ Page \d+ of \d+`.
- **The alphabet worksheet is repeated six more times at the end of the PDF** as
  printable team copies. Dedupe or you will import it seven times.

**Done when:** unit tests parse fixture files to the exact expected
`Tossup[]` / `Bonus[]` / `OacPacket` shapes. Reference at least one real packet
of each grammar as a test fixture **by URL, not committed**. Assert the OAC
packet yields 20 directed questions, 10 category tossups, 20 alphabet items (not
140), and 20 final tossups.

---

### CARD D — OAC match mode
**Suggested worker: savvy-careful**
**Depends on: Card C for the packet shape**

**Create:**
```
web/src/oac/match.ts          (state machine + scoring)
web/src/oac/convert.ts        (pyramidal tossup -> OAC tossup)
web/src/oac/alphabet.ts       (generate an alphabet round from a bank)
web/src/oac/__tests__/
web/src/screens/OacMatch.tsx
```

**Contract:** implement the three rounds exactly as specified in the rules
section above. The scoring invariants are the thing to get right:

- directed: 2 points first attempt, 1 point second, within one 10s clock
- steal: 1 point, on the *remaining* clock
- category tossup: 2 points, one opportunity per team
- alphabet: 2 points each, 20 items, 4 minutes, both teams identical
- final: 2 points each, 20 tossups
- **no negatives anywhere, no bonuses, max 140**
- perfect-alphabet bonus: config flag, default off
- conferral is allowed — provide a confer affordance, do not lock input during
  the clock

`convert.ts` turns a QB Reader tossup into an OAC one: rewrite
`For 10 points, name this X` to `Name this X` (handle the `For 10 points each`
and `For ten points` variants too), strip `(*)`, drop power scoring.

`alphabet.ts` takes a letter and a question bank and produces 20 items whose
answers all start with that letter, using each source question's giveaway clause
as the clue. Reject items where the answer's first letter is ambiguous after
article stripping.

**Done when:** tests drive a full simulated match and assert the final score
matches a hand-computed expected value, including a steal-with-remaining-clock
case and a both-attempts-wrong case. Assert no code path can produce a negative
score.

---

### CARD E — Ear training port
**Suggested worker: savvy-medium**

**Source material to port, in the parent directory:**
```
../ear_training.json      20 works, 32 parts
../audio/*.wav            27 clips, 22050 Hz mono, about 16s each, 19 MB total
```

**Create:**
```
web/src/ear/match.ts            (pitch-class matching)
web/src/ear/__tests__/
web/src/screens/EarTraining.tsx
web/public/audio/*.opus         (transcoded)
web/scripts/transcode-audio.sh
```

**Contract:**
- Transcode the WAVs to Opus with ffmpeg (already installed). Target roughly
  1-2 MB total so it ships in the app and works offline. Keep the filename stems
  so the existing `id` fields still resolve. Ship an AAC fallback only if you
  confirm Opus fails on iOS Safari — check, do not assume.
- Port the pitch matching from `../main.py`. **Keep its good behaviour:** split
  on spaces/commas/hyphens, accept `#`/`s` for sharp and `b`/`f` for flat,
  compare **mod-12 pitch classes** so enharmonics and octaves are equivalent,
  compare only the common prefix so a partial answer counts, and return a
  **tri-state** where `null` means "this entry has no literal pitch sequence,
  do not grade it".
- **Fix one bug while porting:** the Python version opts out of grading whenever
  the notes field contains `(`, which wrongly skips entries like
  `"E D C B (descending, celesta)"` that do have real pitches. Extract pitches
  first, then decide.
- **Add:** an optional transposition-tolerant mode comparing interval sequences
  rather than absolute pitch classes, since answering in the wrong key is a
  common and defensible response.
- Audio playback via a normal `<audio>` element — you get replay, scrub and
  volume for free. Five of the 32 parts have no local clip and fall back to a
  YouTube search from the `search` field; keep the legacy UI's honest warning
  that a search result may spoil the title.
- Hints stay **post-answer only**, as in the original. They are teaching notes,
  not requestable hints.
- Naming either the piece or the composer counts as correct.

**Done when:** total transcoded audio is under 2 MB, tests cover the mod-12
matching including enharmonic and partial-prefix cases plus the `(`-bug
regression, and the screen plays a clip and grades both fields.

---

### CARD F — Learn tab chapter markup
**Suggested worker: savvy-medium**
**Depends on: `web/src/learn/derive.ts` (owned by core agent)**

The Learn tab is a **scroll-driven study surface**, four hard-cut chapters,
dense and data-forward. You build the chapter markup and the three
non-signature devices. **The core agent owns `derive.ts` and `Misses.tsx` (the
buzz-point replay rail) — do not build those.**

**Create:**
```
web/src/screens/Learn.tsx
web/src/learn/chapters/WeakSpots.tsx
web/src/learn/chapters/Lessons.tsx
web/src/learn/chapters/Progress.tsx
web/src/learn/learn.css
```

Leave a placeholder import for `Misses.tsx` and do not implement it.

**Chapter 1 — Weak spots. Device: counting numbers.**
Subcategories sorted worst-first. Real accuracy and real sample sizes, from
`derive.weakSpots()`. Numbers count up to their true values on entry. Ends held
and still — that quiet is deliberate, it is the silence before the peak. Do not
add motion here.

**Chapter 3 — Lessons. Device: lateral pan.**
The most-frequently-asked answers for the user's weak subcategories, from QB
Reader's `/frequency-list`. Travels horizontally as the page scrolls vertically.
Lateral movement reads as breadth; vertical would read as another argument.

**Chapter 4 — Progress. Device: reveal/wipe.**
Buzz-point distribution over time, with the curve sliding earlier across weeks.
A wipe between past and present, because this beat is a change of state.

**Hard rules for this tab:**
- **Four distinct device families, never the same one twice in a row.**
- No video, no scrubbing, no large display type, no marketing chrome. This is a
  live app surface, and copy lives in the surface's own idiom: labels, status
  lines, empty states.
- **Real empty states, not zeroed charts.** On first run there is no event log.
  Chapter 2 with no misses says go drill something, and means it.
- No `transition: all`. No animating `width` / `height` / `top` / `left`. Use
  `transform`, `opacity`, and `clip-path` for wipes.
- No gradient text, no neon glow, no zero-offset coloured shadows.
- No section counters like `01 / 04`, and no "scroll to explore" cue.
- No em dashes in visible copy.
- Respect `prefers-reduced-motion`: keep the composition, drop the motion.

**Done when:** the tab scrolls cleanly at 390px wide, every chapter reads
correctly both with an empty log and with a seeded log, and you have
screenshotted each chapter at several scroll positions to prove the intermediate
states hold up.

---

## Global rules

- **TypeScript strict mode on.** No `any` in exported signatures.
- **Do not reimplement the answer checker.** Use `judge()`.
- **Do not reimplement reveal timing.** Use `useReader()`.
- **Do not write to the flat-counter stats shape** from the legacy app.
  Everything derives from the `AttemptEvent` log. If you need an aggregate,
  derive it.
- Port the legacy app's **shuffled-deck drain** for question selection — no
  repeats until the pool is exhausted.
- Tests with Vitest, colocated in `__tests__`.
- Commit in small, working increments. Do not commit downloaded packet files,
  source WAVs, or `node_modules`.
- When you finish a card, state plainly what you verified by running it and what
  you did not. Do not report a passing test you did not execute.
