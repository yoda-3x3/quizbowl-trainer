## YOUR TASK — Card D: Ohio Academic Competition match mode

Suggested worker tier: **savvy-careful**
**Depends on Card C** for the packet shape, but you can build against the
`OacPacket` type in `src/types.ts` before the parser lands.

### Which "Academic Challenge" this is

The name covers three different things. We are implementing **Ohio Academic
Competition (OAC)**, the league and tournament format. The Cleveland WEWS TV
show and the YSU WYTV show are separate, publish no rules and no questions.

**The choose-a-category board belongs to the YSU TV show. OAC has no category
board. Do not build one.**

### The rules (verified against real packets)

A match is **three rounds**. Substitutions allowed between rounds. Sides are
Team A (moderator's left) and Team B. **Conferral is permitted before, during
and after questions** — this is the format's signature feature, so the UI must
offer a team confer affordance and must **not** lock input during the clock.

**Round 1 — Category Round.** Ten categories in this fixed order (exported as
`OAC_CATEGORY_ORDER` in `src/types.ts`): American Literature, Mathematics,
World History, Fine Arts, Life Science, English/World Literature,
U.S. Government/Economics, Physical Science, World Geography, U.S. History.

Each category holds exactly three questions:

1. A **directed** question to one team. **No buzzing.** Two attempts within one
   **10-second** clock. First attempt correct = **2 points**, second = **1**.
   If both are wrong or time expires, the other team may **steal for 1 point**,
   and if the directed team used both attempts early the opponent gets the
   *remaining* clock, not a fresh one.
2. A directed question to the other team, same rules.
3. A **pyramidal tossup** read to both teams, one answer opportunity each,
   worth **2 points**. Buzzing applies here only.

Order alternates: Team A takes the first directed question in category 1, Team B
in category 2, and so on. Math questions declare a longer clock in their own
prompt text ("This is a 20-second calculation question") — honour it.

**Round 2 — Alphabet Round.** A written worksheet, not a buzzer round. Both
teams get identical questions. **Every answer begins with the same letter**,
announced up front. **4 minutes, 20 questions, 2 points each.**

**Round 3 — Final Round.** **20 pyramidal tossups, 2 points each**, read to both
teams.

**Scoring invariants.** There are **no negative points anywhere** and **no bonus
structure at all** — no tossup/bonus pairing, no 30-point bonuses, no power.
Maximum match score is **140**. Constants are exported as `OAC_SCORING` in
`src/types.ts`; use them rather than inlining numbers.

A perfect alphabet round carries a 5-point bonus in some rulebooks. We could not
verify it, so it is a config flag **defaulting to off** (`perfectAlphabetBonus: 0`).

### Create

```
web/src/oac/match.ts          state machine + scoring
web/src/oac/convert.ts        pyramidal tossup -> OAC tossup
web/src/oac/alphabet.ts       generate an alphabet round from a bank
web/src/oac/__tests__/
web/src/screens/OacMatch.tsx
```

### Where the questions come from

Only ~1,260 authentic OAC questions exist (18 packets, one 2014 set). That is
about 18 matches, so the mode also needs generated material.

**The conversion is sanctioned and verified.** HSAPQ built their OAC rounds by
mechanically stripping `For 10 points,` out of their pyramidal bank — the same
Truman question appears in both their VHSL set and their OAC set differing only
in that clause. `toOacPhrasing()` in `src/engine/power.ts` already does this
correctly, including re-capitalising the word left stranded at a sentence start
and removing `(*)`. **Use it; do not write your own.**

`convert.ts` wraps it: take a `Tossup`, produce an `OacTossupQ`, drop power
scoring.

`alphabet.ts` takes a letter and a question bank and produces 20 items whose
answers all start with that letter, using each source question's giveaway clause
as the clue. Reject items where the answer's first letter is ambiguous after
stripping a leading article.

### Done when

Tests drive a **full simulated match** and assert the final score against a
hand-computed expected value. Cover specifically:

- first-attempt correct scores 2, second-attempt correct scores 1
- both attempts wrong, opponent steals for 1 **on the remaining clock**
- both attempts wrong and clock expired, nobody scores
- a full 140-point perfect match
- **no code path can produce a negative score** — assert this explicitly
- the alphabet round is 20 items and 4 minutes, identical for both teams
