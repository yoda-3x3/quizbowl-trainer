## YOUR TASK — Card F: Learn tab chapter markup

Suggested worker tier: **savvy-medium**
**Depends on `src/learn/derive.ts`**, which already exists and is owned.

The Learn tab is a **scroll-driven study surface**: four hard-cut chapters,
dense and data-forward. You build three of the four chapters plus the container.

**`src/learn/chapters/Misses.tsx` is owned by another agent.** It is the
signature interaction. Import it, leave a placeholder if it is absent, and do
not implement it.

### What derive.ts gives you

```ts
weakSpots(events, minAttempts?): WeakSpot[]        // worst accuracy first
missedQuestions(events, {wpm, limit?}): MissedQuestion[]
buzzDistribution(events): BuzzBucket[]             // 10 deciles
progressOverTime(events): ProgressPoint[]          // grouped by week
summary(events): { heard, accuracy, powerRate, negRate, meanBuzzFraction, points, ... }
knownTerms(events): Set<string>
findKnowableIndex(words, known): number | null
```

`WeakSpot` carries `subcategory`, `category`, `attempts`, `correct`,
`accuracy`, `meanBuzzFraction`, and `trend` (positive means improving, `null`
when there is too little history). Read `src/types.ts` for the exact shapes.

Get events from `all()` in `src/engine/log.ts`.

### Create

```
web/src/screens/Learn.tsx
web/src/learn/chapters/WeakSpots.tsx
web/src/learn/chapters/Lessons.tsx
web/src/learn/chapters/Progress.tsx
web/src/learn/learn.css
```

### The design is already decided — follow it

The grammar is a **live surface**: the page behaves like the product, operating
on real data, not a marketing page about it. That means **no marketing chrome**:
no hero claim, no large display type, no full-bleed imagery, no "scroll to
explore" cue, no `01 / 04` section counters. Copy lives in the surface's own
idiom: labels, status lines, empty states.

The emotional arc is confront, then redeem:

| Chapter | Feeling | Device |
|---|---|---|
| 1 Weak spots | exposed | counting numbers |
| 2 Misses (owned) | sting, then clarity | **the peak** |
| 3 Lessons | equipped | lateral pan |
| 4 Progress | earned lift | reveal / wipe |

**Four distinct device families, and never the same one twice in a row.** That
variety is the point; five sections behaving identically is one section shown
five times.

**Chapter 1 — Weak spots.** Subcategories sorted worst-first from
`weakSpots()`. Real accuracy, real sample sizes. Numbers count up to their true
values on entry. Then it **ends held and still** — that quiet is deliberate, it
is the silence before the peak. Do not add motion here.

**Chapter 3 — Lessons.** The most-asked answers for the user's weakest
subcategories, from `fetchFrequencyList(subcategory, 40)` in
`src/data/qbreader.ts`. Travels **horizontally** as the page scrolls vertically.
Lateral movement reads as breadth; vertical would read as another argument.

**Chapter 4 — Progress.** Buzz distribution over time from
`buzzDistribution()` and `progressOverTime()`, with the curve sliding earlier
across weeks. Use a **wipe** between past and present, because this beat is a
change of state. The close must resolve, not fade out.

### Empty states are a real requirement

On first run the event log is empty. Every chapter needs a written empty state,
**not a zeroed chart**. Chapter 2 with no misses says go drill something, and
means it. Build and screenshot both the empty and the seeded case.

### Motion rules

- No `transition: all`. No animating `width`, `height`, `top`, `left`. Use
  `transform`, `opacity`, and `clip-path` for wipes.
- No gradient text, no neon glow, no zero-offset coloured shadows.
- No em dashes in visible copy.
- `prefers-reduced-motion`: keep the composition, drop the motion. The page must
  still read correctly as a static document.

### Done when

The tab scrolls cleanly at 390px wide, every chapter reads correctly with an
empty log and with a seeded log, and you have screenshotted each chapter at
several scroll positions. Intermediate scroll positions are where this kind of
page breaks, so a screenshot of only the top and bottom is not evidence.
