## YOUR TASK — Card A: app shell, routing, practice screens

Suggested worker tier: **savvy-medium**

### QB Reader facts you need

The data layer is already written and owned, but you should understand what it
returns.

- Base URL is **exactly** `https://www.qbreader.org/api`. The bare host 301s
  without CORS headers. No proxy is needed; no key, no auth.
- Rate limit 20 req/sec. The queue already prefetches 20 at a time.
- **Category capitalization is load-bearing**: `Science`, not `science`. A
  mis-cased filter is silently ignored and returns unfiltered results.
- Difficulty 0-10: 0 Pop Culture, 1 Middle School, 2 Easy HS, 3 Regular HS,
  4 Hard HS, 5 National HS, 6-9 college tiers, 10 Open. **Default to 3-5.**
- Power is the literal `(*)`. `parseQuestion()` handles it; never parse it
  yourself and never key off `<b>`, which is overloaded with moderator
  instructions like `(read slowly)`.

Categories and their subcategories are exported from `src/types.ts` as
`CATEGORIES` and `SUBCATEGORIES`. Use those, do not retype them.

### Create

```
web/src/ui/           shared primitives: Button, Field, Sheet, TabBar, StatPill
web/src/screens/Home.tsx
web/src/screens/Tossup.tsx
web/src/screens/Bonus.tsx
web/src/screens/Settings.tsx
web/src/data/cache.ts
```

The build config, `index.html`, `main.tsx` and `theme.css` already exist and
work. **Extend `theme.css`, do not replace it.**

### Contract

- Bottom tab bar: Practice / Learn / Rooms / Settings. Learn and Rooms may be
  placeholders; other cards fill them.
- `Tossup.tsx` consumes `useReader()`. Render `reader.words.slice(0, reader.revealed)`
  and nothing else. **Do not implement reveal timing** — the engine owns it.
  Highlight the power word using `reader.powerIndex`.
- Handle every phase: `idle`, `reading`, `buzzed` (show `secondsLeft`), `done`
  ("end of question, answer anyway"), `resolved` (show result, reveal the rest
  of the question greyed out, reveal `answerSanitized`).
- **Handle `pendingPrompt`.** When a submit returns a prompt, the question is
  not over: show the directed prompt text (e.g. `what theorem?`) and let them
  answer again on the remaining clock. This path exists in the engine and is
  unit-tested but has never been exercised in a real UI, so build it carefully.
- Question text in a serif face. The legacy app used Georgia 17 and it reads
  well; `--font-read` is already defined.
- Buzz is spacebar on desktop and a large thumb-reachable button on phone.
  Spacebar must not buzz while focus is in a text field. Enter submits.
- `Settings.tsx` persists words-per-minute, post-buzz seconds (default 5),
  difficulty range (default 3-5), category and subcategory multi-select, and
  judge strictness. Persist to `localStorage` **wrapped in try/catch** — it
  throws in private mode and the app must still render.
- `Bonus.tsx`: leadin, then parts one at a time, 10 points per part unless
  `values` says otherwise. **Guard `answers.length !== parts.length`.**

### Still to do on data

`src/data/qbreader.ts` falls back to the bundled offline pack when the network
fails, but does not cache *fetched* questions. Add IndexedDB caching in your new
`src/data/cache.ts` and call it from the screens. **Do not edit `qbreader.ts`.**

### Done when

`npm run dev` serves a working tossup loop: question reveals, space buzzes,
Enter submits, prompt retry works, result shows, next question loads. No console
errors. Works at 390px wide with no horizontal scroll. Verify by loading it in a
browser and screenshotting both widths, and say what you actually clicked.
