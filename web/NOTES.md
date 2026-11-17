# NOTES

Assumptions and open questions recorded by delegated cards, per
`SAVVY_FLOW_PROMPT.md`. Append; do not rewrite someone else's section.

## Card C — packet importer (`src/import/`, `src/screens/Import.tsx`)

### No real packet was fetched, and why

The card said to cache one file of each grammar locally while working. I did
not do that, and the deviation was deliberate.

I read `robots.txt` on both hosts before writing any fetch code. The card's
claim is accurate, and it is broader than the card states: the **file host**
carries the same policy as the site host.

- `https://www.quizbowlpackets.com/robots.txt`
- `https://files.quizbowlpackets.com/robots.txt`

Both serve `Disallow: /` for roughly 32-40 named agents including `ClaudeBot`,
`anthropic-ai` and `Claude-Web`, and both assert
`Content-Signal: search=yes, ai-train=no, use=reference` as an express
reservation of rights under Article 4 of EU Directive 2019/790.

That leaves no compliant way for the *toolchain* to pull a packet: fetching
with an honest Claude-identifying agent is exactly what `Disallow: /` refuses,
and fetching with a disguised User-Agent was forbidden outright. The carve-out
the card describes is real but it applies to the **end user's own device**
making the request, which is what the shipped importer does. It does not
extend to the build agent.

So the committed tests run on synthetic fixtures. This is also the only option
that keeps the test suite reproducible, since a real packet can never be
committed.

### Fixtures

- `src/import/__fixtures__/make-fixtures.mjs` generates both fixtures.
  Re-run with `node src/import/__fixtures__/make-fixtures.mjs`.
- `oac-synthetic.txt` and `standard-synthetic.txt` are written from scratch to
  reproduce the **structure** of each grammar, including every trap the card
  documented: centred headers with leading whitespace, 32-column answers,
  interleaved `20\d\d OAC \d+ Page \d+ of \d+` footers, prompts wrapped by PDF
  column width, a self-declared 20-second calculation clock, `[or ...]`
  alternates, a `(TWO WORD ANSWER)` flag, alphabet answers on a separate page,
  right-aligned HSAPQ ids, the `pdftotext` `A ristotle` damage, and the
  **alphabet worksheet repeated seven times in total**.
- `.gitignore` now also excludes `src/import/__fixtures__/real-*`. A text
  extraction of a real packet is still the packet, and the previous rules only
  covered `.pdf` and `.docx`.

### To validate against a real file (a human action, not an automated one)

`src/import/__tests__/realFile.test.ts` is skipped unless the files are
present. Download one round yourself from the set page in your own browser:

```
src/import/__fixtures__/real-standard.docx   any round of /2316/ (2019 PACE NSC)
src/import/__fixtures__/real-oac.txt         pdftotext -layout oac-01.pdf
```

`-layout` is required: the OAC grammar reads column positions, and without it
the centred headers and 32-column answers collapse.

### Unverified assumptions

1. **No PDF text layer extractor.** The OAC set is PDF only and nothing in the
   project can read a PDF. The importer therefore accepts pasted text for PDF
   sources and reads `.docx` natively. Adding `pdf.js` would close this, but it
   is a new dependency and outside this card.
2. **Cross-origin reads are untested.** The card verified "no auth, no referer
   check" on the file host but says nothing about CORS. If
   `files.quizbowlpackets.com` sends no `Access-Control-Allow-Origin`, the
   browser fetch route cannot work from a web origin, and only the local-file
   route and the Capacitor native shell will. `fetchPacket.ts` treats a network
   failure as expected and the error message points the user at "Choose a
   file". This needs checking from a real browser.
3. **Archive difficulty mapping is a judgement call.** The archive's 1-4
   Novice/Regular/Regular-Plus/Nationals enum is relative to its own archive,
   so `toQbDifficulty` maps it per archive onto the 0-10 scale (HS 2-5,
   collegiate 6-9, MS 1, pop culture 0). Nothing upstream defines this.
4. **`guessGrammar` is name-based.** Set 1591 is the only OAC set in the
   archive, so routing on `oac` in the filename or "Ohio Academic" in the set
   name is sufficient today but is a heuristic.

### Interop

`parseOac.ts` emits the `OacPacket` from `src/types.ts` unchanged, so an
imported round feeds the OAC match engine in `src/oac/` directly;
`parseOac.test.ts` asserts that `createMatch()` accepts a parsed packet and
that `maxAvailableScore()` returns the documented 140. I deleted my own
`oacMaxScore` helper once I found `maxAvailableScore` in `src/oac/match.ts`
rather than keep two copies of that arithmetic.

`Import.tsx` hands results to an optional `onImported(result: ImportResult)`
prop. `App.tsx` currently renders `<PacketImport />` with no handler, so
imports are parsed and summarised but not yet added to a question bank. Wiring
that is the natural next step and belongs to whoever owns the bank.

## Card D, Ohio Academic Competition match mode (`src/oac/`, `src/screens/OacMatch.tsx`)

1. **140 is the packet's printed value, not one team's ceiling.** Ten
   categories of two directed questions at 2 plus a tossup at 2 is 60, the
   twenty alphabet items at 2 are 40, the twenty final tossups at 2 are 40:
   140, which is what `OAC_SCORING.maxScore` says. A single team cannot reach
   it, because the alternation rule reads each side only ten of the twenty
   directed questions. One side's ceiling is 130: ten own directed at 2, ten
   steals at 1, ten category tossups at 2, a perfect worksheet at 40 and every
   final tossup at 40. Both are exported and tested: `maxAvailableScore()` is
   140 and `maxReachableScore()` is 130.
2. **A steal rides the remaining clock, so an expired clock means no steal.**
   The rules say the opponent may steal "if both are wrong or time expires",
   and also that a steal gets the remaining clock rather than a fresh one.
   Taken together the second clause consumes the first: once the clock has run
   out there is no window left, so nobody scores. That matches the stated
   acceptance criterion, and it means the "or time expires" branch is
   unreachable in practice rather than mis-implemented.
3. **A prompt costs neither an attempt nor points.** The ruleset says nothing
   about directed prompts, so they follow the reader engine: the team keeps the
   rest of the same clock and the attempt counter does not move.
4. **A steal is one attempt, not two.** Two attempts belong to the directed
   question, not to the clock.
5. **The post-buzz answer clock on a pyramidal tossup is 5 seconds.** OAC
   publishes no figure. It follows `useReader`'s default and is configurable as
   `tossupAnswerSeconds`.
6. **Which side a directed question is read to comes from the match position,
   not from `OacDirected.team`.** That field records which side of the
   moderator a printed packet addressed; the same packet has to alternate
   correctly whichever team sits on the left today. See `directedTeamFor()`.
7. **A declared clock is read from the whole question, not from the clause we
   keep.** "This is a 20-second calculation question" opens the question, so
   `toOacDirected` trims to the giveaway but still reads the clock off the full
   text, and keeps the declaring sentence in the prompt because the moderator
   reads it aloud. At match time `seconds` wins when it is sane and the prompt
   text is the backstop, so a packet that loses the field still gets 20.
8. **OAC categories are mapped onto the app taxonomy for the attempt log**
   (`OAC_CATEGORY_TO_QB`), so OAC play reaches the Learn tab like every other
   mode. Mathematics has no home category upstream and falls to Other Academic
   rather than being dropped.
9. **`OacAlphabetItem.index` is 1-based for display, while the `write` action
   takes the 0-based sheet position.** The screen passes the array index.
10. **`src/import/__tests__/parseOac.test.ts` line 61 calls `oacMaxScore(...)`,
    which no longer exists** (Card C's note above says that helper was deleted
    in favour of `maxAvailableScore`, which the same file already imports), so
    that one test throws. Checked locally against the real parser output:
    `maxAvailableScore(parsed.packet)` is 140 and `maxReachableScore` is 130,
    so renaming the call is all it needs. Not changed here, because
    `src/import/` belongs to another card.
11. **The screen is unverified in a browser.** It is not wired into `App.tsx`
    (Card A owns that) and there is no jsdom in the project, so it is covered
    by a server-render smoke test only: no typing, no clocks, no buzzes
    exercised through the DOM.

## Card F (Learn tab chapters)

12. **`fetchFrequencyList()` in the owned `src/data/qbreader.ts` returns nothing
    against the live API.** Measured from the running app on 2026-11-14:
    `GET https://www.qbreader.org/api/frequency-list?subcategory=American%20Literature&limit=5`
    returns HTTP 200 with `{"frequencyList":[{"answer_normalized":"emily
    dickinson","count":169,"answer":"Emily Dickinson"}, ...]}`. The helper does
    `if (!Array.isArray(data)) return []`, so the wrapper object always falls
    through to the empty list and the Lessons chapter renders its written
    "no frequency list came back" state instead of cards. A subcategory the
    bank has no data for (for example `Painting`) answers HTTP 404 with
    `{"frequencyList":[]}`, which `getJson` throws on, so both outcomes are
    handled in the chapter. Unwrapping `data.frequencyList` would fix it, but
    `src/data/qbreader.ts` is owned and was not touched. The Lessons chapter
    was verified against a browser-side fetch stub that unwraps that field.
13. **Chapter 2 (`src/learn/chapters/Misses.tsx`) is not on disk.** `Learn.tsx`
    carries a clearly marked `MissesPlaceholder` in its slot, with the exact
    import line to restore in a comment above it. The placeholder uses the
    owned `missedQuestions()` for its counts and its empty state only; it does
    not attempt the replay interaction.

## Tournaments tab (Task 2 of the auth/tournaments flow)

14. **The bottom bar grew from four tabs to five.** The earlier card said the
    bar stays at Practice / Learn / Rooms / Settings, but the tournaments brief
    asked for Tournaments as a top-level destination and explicitly overruled
    the four-tab constraint. The new order is Practice / Learn / Rooms /
    Tourneys / Settings (label truncated so the row still fits at 390px). The
    `?` help card and the number shortcuts (1-5 now) were updated in lockstep.
15. **The persisted question sequence does not drive the Tossup reader.** The
    worker stores the pinned `tournament_questions(seq, question_id)` rows at
    `/start`, but the running-state view embeds the existing Tossup as-is,
    which pulls questions from the live `TossupQueue` under the player's own
    filters. The pinned ids exist so a protest refers to a concrete question,
    not a guess, but every player can still see a different sequence. A proper
    sequencer that fetches each pinned id in order and feeds it to the reader
    is called out here as the next unit of work; it was deferred so Tossup did
    not need a disruptive refactor for this task.
16. **The `tossups_bonuses` format picks tossup ids for the bonus slots.**
    `pickQuestionIds` in `TournamentDetail.tsx` only talks to `TossupQueue`, so
    the slots after `n_tossups` are flagged `question_kind: 'bonus'` but hold a
    tossup id. A real bonus picker belongs with the client, and the server
    endpoint already accepts the kind field, so this is a one-screen fix when
    the bonus flow is designed.
