# Quizbowl Trainer — UX Audit

**Method:** Live-clicked the production site (`https://qb-trainer.pages.dev`) at desktop
width (~800–1400px) and emulated mobile width (375px), through Practice/Tossups, Learn,
Rooms, Tourneys, and Settings. Did not create a test account on production (test
credentials belong on a staging/dev environment, not prod) — sign-up flow was opened but
not submitted. The Admin dashboard requires an admin-role account I don't have, so it was
reviewed from source (`web/src/screens/Admin.tsx` and `web/src/screens/admin/*.tsx`)
instead of live-clicked; re-verify its findings in the browser once you can sign in as an
admin.

Two passes are folded into each finding: **Founder** (the ruthless conversion read) and
**User** (what a first-time visitor actually hit). Sorted by impact. File:line references
are given wherever I traced the bug to its cause, so this can be handed straight to an
implementing session.

---

## CRITICAL

### 1. The question card grows without limit and pushes the Buzz button down mid-read
**Founder:** This is the core loop of the entire product, and it visibly breaks while
you're using it.
**User:** I'm reading a tossup, my thumb is positioned on Buzz, and the button keeps
sliding down the screen as more of the question reveals. On mobile, a long tossup can push
Buzz toward or past the bottom of the viewport, forcing a scroll *during* a speed game.

**Cause:** `.read--card` in [`web/src/theme.css:535-541`](web/src/theme.css#L535) sets
`min-height: 210px` (180px on the `max-width: 460px` breakpoint) and nothing else — no
`max-height`, no `overflow`. The card's real height is "however tall the revealed text
currently is," so every newly-revealed word that wraps a line grows the card and shoves
`.controls` (Buzz/Submit/status) further down the page.

**Fix:** Give `.read--card` a height that's a function of the viewport, not the content —
e.g. `height: clamp(180px, 32dvh, 340px)` with `overflow-y: auto` and auto-scroll-to-bottom
as words reveal (so the newest word is always in view, like a teleprompter). That also
directly answers "auto-adjust UI size to screen" — right now nothing in the reading screen
responds to viewport height at all, only width.

### 2. The "PRE-ALPHA" badge overlaps real header content on multiple screens
**Founder:** A build badge visually corrupting the product's own UI is the fastest way to
make a visitor assume the whole thing is broken, not just unfinished.
**User:** On Learn, "PRE-ALPHA" is printed directly on top of the "ACC 0%" stat pill. On
Tournaments, it overlaps the "Refresh" button's top edge. Looks like a rendering bug, not
a badge.

**Cause:** [`web/src/App.tsx:132`](web/src/App.tsx#L132) renders the badge once, globally,
and [`web/src/theme.css:769-784`](web/src/theme.css#L769) pins it with
`position: fixed; top: 6px; right: 8px; z-index: 50`. It reserves no space in any screen's
header, so any screen whose own header has top-right content (a stat pill row, an action
button) collides with it. This isn't a one-screen bug — it'll recur on any new screen that
puts something in the top-right.

**Fix:** Stop floating it. Either (a) put it in the shared `topbar` component as a normal
inline element so layout reserves space for it, or (b) move it somewhere nothing else ever
occupies (e.g. a small corner ribbon clipped to the viewport corner, or fold it into the
app's title/wordmark area instead of the opposite corner from content).

### 3. A leftover test tournament is live on production
**Founder:** First-touch trust is everything for a trial, and a real visitor's first look
at Tourneys has a tournament called "E2E Verify 2026-11-19," hosted by "admin," marked LIVE.
**User:** This looks like the developers forgot to clean up after themselves. Is this app
actually finished?

**Fix:** Delete/hide it from the production `qb-trainer-auth` D1, and add "no test data on
prod" to the deploy checklist in `ENVIRONMENTS.md`.

### 4. ~~Correction~~ — production is running a stale build; prod users don't see the
guided lesson UI that already exists on `main`
**What I originally wrote here:** "Learn lessons are just the raw Practice screen with
full settings exposed" — on the live site, tapping a unit lesson node landed on a screen
titled "Tossups" with the full WPM/difficulty/category/judging sidebar, no progress bar,
no lesson framing.
**What's actually true:** `main` already has a complete, properly-wired guided-lesson
component — [`web/src/learn/components/LessonSession.tsx`](web/src/learn/components/LessonSession.tsx)
— that wraps `Tossup` in a lesson overlay with a `n/5` progress bar, per-answer feedback
banners, and a completion screen with XP/correct/powered stats
([`Learn.tsx:95-126`](web/src/screens/Learn.tsx#L95) calls it unconditionally when a unit
node is tapped, no auth gate). It is NOT dead code — it's real, tested, and exactly the
fix I was about to recommend. The qb-trainer Pages project is direct-upload, not
git-connected (confirmed in a prior session's handoff), so nothing on `main` ships to
prod automatically — prod is currently serving whatever build was last manually uploaded,
which predates this feature and is likely missing other recent work too (Quick Play, ELO
ranks, H2H rooms — unverified against the live site, but `main` has them).

**Founder:** This isn't a design problem, it's a release-pipeline gap — the team built the
right thing and it isn't live. Every day it stays undeployed is a day real visitors see a
worse product than the one that already exists in the repo.
**Fix:** No code to write here. Once qa has soaked (a separate deploy is in flight —
session `deploy-qa-dev-workers-pa`), promote `main` to prod with
`cd web && npm run build && npx wrangler pages deploy dist --project-name qb-trainer --branch main`
(and `npx wrangler deploy` for the prod worker if it's also behind). Worth adding a
"how stale is prod vs. main" check to the deploy checklist so this doesn't silently
recur.

---

## HIGH IMPACT

### 5. No onboarding or primary call-to-action on the home screen
**Founder:** The Practice home is six equally-weighted cards (Tossups, Bonuses, Ear
training, Vision trainer, OAC match, Import a packet). Nothing says "start here." For a
product whose whole job is converting a first-time visitor into a repeat player, that's a
missed close.
**User:** I don't know quizbowl. Which of these six things do I click first?

**Fix:** One clearly primary action (e.g., "Start practicing" leading into Tossups, sized
and colored to stand out) with the other five demoted to a secondary row or behind "more
modes."

### 6. Every section wears the identical visual register
**Founder:** Practice, Learn, Rooms, Tourneys, Settings, and Admin all use the same dark
navy cards, the same pill shapes, the same type scale. Nothing differentiates the
*gamified* section (Learn, which already has streaks/XP/a unit path and should feel like
Duolingo — color, motion, reward) from the *focused* section (Practice/Tossups, which
should feel calm and distraction-free) from the *social* one (Rooms). It all reads as one
generic internal dashboard.
**User:** Nothing in the app's visual language is telling me which mode I'm in beyond the
page title.

**Fix:** Give Learn its own accent/warmth (it already half-commits to this with the streak
flame icon and XP counter — lean into it), keep Practice minimal, and reserve Admin for the
"basic, 2000s, internal tool" treatment called out below.

### 7. Desktop width is wasted on every screen except Practice
**Founder:** `web/src/theme.css:136` gives `.practice-shell` a real desktop layout
(two-column with a sticky sidebar) at `min-width: 900px`. No other screen has *any* desktop
breakpoint — Learn, Rooms, Tourneys, Settings, and Admin all stay pinned to mobile-width
single-column layout with the bottom tab bar, even on a 1400px monitor.
**User:** On a laptop, most of the app looks like a phone screen stretched into a dark void
with huge empty margins.

**Fix:** At minimum, cap content width and center it with sensible padding on desktop for
every non-Practice screen (cheap), and consider a real desktop nav (left rail or top bar
instead of bottom tabs) above 900px — the bottom tab bar is a mobile pattern that doesn't
belong on desktop.

### 8. Sign-up has no validation feedback
**Founder:** Account creation is the moment a visitor becomes a retained user. The form
("Create an account": username, password, confirm password) gives zero live feedback —
no password strength indicator, no inline "passwords match" check, nothing until submit.
**User:** I can't tell if my password is good enough or if I mistyped the confirmation
until after I hit Create account.

**Fix:** Inline validation on blur/keystroke for both fields before enabling the submit
button.

### 9. "Your numbers" first-run state undersells the product
**Founder:** The empty state on Practice home just says "no attempts yet" in small gray
text with four 0% pills. That's the first thing a brand-new visitor who hasn't played yet
sees, and it sells nothing.
**User:** This looks like a dashboard with no data, not an invitation to try something.

**Fix:** Replace with a short, specific value-prop line ("Every rep you play here builds
real tournament stats — not just a score") plus a direct CTA into Practice.

---

## NICE TO HAVE

### 10. ~~Correction~~ — locked/available/completed lesson nodes are already visually
distinct (filled accent circle, dimmed hollow circle, green check) — see
`lesson-node--*` in `learn.css:847-869`. No action needed; struck from this list.

### 11. Rooms nickname field has no personality — DONE
Added a small colored avatar circle (deterministic hue from the nickname, initial letter)
next to the nickname field — low-risk, no backend changes, gives the one social surface a
touch of identity.

### 12. Stat pills (WPM/CLOCK on Practice, HEARD/ACC/POWER/NEG/POINTS/WEEKS on Learn) —
NOT implemented. On closer look the pill label/value contrast is an intentional, fairly
standard de-emphasis pattern (small caps label, full-contrast value), not a clear bug — a
"bigger today summary" redesign is a real design call rather than a mechanical fix, and I
didn't want to guess at it without your input. Left for a follow-up if you still want it
after seeing the rest of this pass live.

---

## Admin panel: deliberately plain, "2000s internal tool" restyle — DONE

Implemented: `web/src/admin.css` scopes a `.admin-plain` override (white background, black
text, Tahoma/Verdana/Arial, square corners, no accent color, native-ish bordered buttons
and table borders) applied to `Admin.tsx`'s topbar and body once signed in as admin, and
the tab switcher is now a row of plain underlined links instead of accent-colored pill
buttons. Visually verified via a static render of the admin markup against the real
stylesheets. This also resolves part of Finding #6 by giving Admin a visual identity
that's *intentionally* different rather than just under-designed.

---

## Not yet audited live
- Bonuses, Ear training, Vision trainer, OAC match, Import-a-packet screens (reached from
  Practice home but not individually opened this pass).
- Rooms live gameplay (joining/playing a room), H2H match rooms, Quick Play, Leaderboard,
  Tournament detail/bracket screens.
- Admin dashboard live (reviewed from source only — see note at top).
- Sign-up/sign-in submitted end-to-end (opened but not submitted, to avoid writing test
  credentials to production).

Worth a follow-up pass once there's a safe environment (qa/dev/preview) to click through
these without touching prod data.
