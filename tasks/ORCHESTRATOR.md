# The one prompt

Paste everything below the line into the CLI after `/savvy-flow`. It is the
only thing you need to paste; the orchestrator reads the rest off disk.

---

Build out the quizbowl + Ohio Academic Competition trainer in
`C:\Users\reach\Dance\quizbowl_trainer\web\`.

**Read these files before dispatching anything:**

- `tasks/_shared.md` — project context, the owned-file list, and every type
  contract. Every worker you spawn must receive this file's contents verbatim
  in its brief, because workers start cold and cannot see this conversation.
- `tasks/cards/*.md` — one card per unit of work. Each card already states its
  own files, contract, facts and acceptance criteria.

Then dispatch the cards below. **Give each worker the full text of
`tasks/_shared.md` followed by the full text of its own card.** Do not
paraphrase or summarise either one; weak models fail on summarised contracts,
and the facts in them were expensive to establish.

## The work

| Card | File | Tier | Depends on |
| --- | --- | --- | --- |
| A | `cards/a-app-shell.md` | savvy-medium | nothing |
| B | `cards/b-pwa-capacitor.md` | savvy-light | A |
| C | `cards/c-packet-importer.md` | savvy-heavy | nothing |
| D | `cards/d-oac-mode.md` | savvy-careful | C (type only, can start now) |
| E | `cards/e-ear-training.md` | savvy-medium | nothing |
| F | `cards/f-learn-tab.md` | savvy-medium | A |

## How to schedule it

**Wave 1 — run these four in parallel.** They touch disjoint files, so they
cannot collide:

- A (`src/ui/`, `src/screens/Home|Tossup|Bonus|Settings`, `src/data/cache.ts`)
- C (`src/import/`, `src/screens/Import.tsx`)
- D (`src/oac/`, `src/screens/OacMatch.tsx`)
- E (`src/ear/`, `src/screens/EarTraining.tsx`, `public/audio/`)

D builds against the `OacPacket` type in `src/types.ts`, which already exists,
so it does not have to wait for C's parser. If D needs a real packet to test
against before C lands, it should use a hand-written fixture.

**Wave 2 — after A reports done:**

- B (`public/`, `src/sw.ts`, `capacitor.config.ts`)
- F (`src/screens/Learn.tsx`, `src/learn/chapters/` except `Misses.tsx`)

## Hard constraints for every worker

1. **The owned-file list in `_shared.md` is absolute.** Those files already
   exist and belong to another agent. Import from them, never edit them, never
   create a competing version. The list includes everything under
   `src/engine/`, `src/data/qbreader.ts`, `src/data/bundled.ts`, `src/types.ts`,
   `src/learn/derive.ts`, `src/learn/chapters/Misses.tsx`, `src/room/`,
   `src/screens/Rooms.tsx`, and `workers/room/`. Multiplayer is already built
   and working; Card A leaves a Rooms tab stub and touches none of it.
2. **Two workers must never write the same file.** The waves above are built to
   guarantee that. If a worker finds it needs a file outside its card's list,
   it writes the need into `NOTES.md` and works around it rather than reaching
   across a boundary.
3. **`npm test` must pass before and after every card.** There are 108 tests
   today. A worker that breaks a test it did not write has broken a contract and
   must fix its own code, not the test.
4. **`npm run typecheck` must stay clean.** Strict mode is on.
5. Do not commit `node_modules`, downloaded packet files, or source WAVs.
   `.gitignore` already covers them.

## What I want back

For each card, a short report saying what was built, what was **actually run**
to verify it, and what was not verified. Screenshots where a card asks for them.

Do not report a passing test that was not executed, and do not report a device
or emulator test that did not happen. An honest "typechecks and unit tests pass,
never opened on a phone" is worth more than a confident claim I have to go and
disprove.

If a card turns out to be wrong about a fact, say so explicitly in the report
rather than silently working around it.
