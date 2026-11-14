## YOUR TASK — Card E: ear training port

Suggested worker tier: **savvy-medium**
This card is independent of the UI work and can run immediately.

### Source material, in the parent directory

```
../ear_training.json      20 works, 32 parts
../audio/*.wav            27 clips, 22050 Hz mono, about 16s each, 19 MB total
../main.py                the legacy implementation to port from
```

Five of the 32 parts have no local clip (Swan Lake Waltz, the three Peter and
the Wolf themes, Carmina Burana's O Fortuna) and fall back to a YouTube search
built from the entry's `search` field.

### Create

```
web/src/ear/match.ts            pitch-class matching
web/src/ear/__tests__/
web/src/screens/EarTraining.tsx
web/public/audio/*.opus         transcoded
web/scripts/transcode-audio.sh
```

### Audio

ffmpeg is installed (full build, 588 filters). Transcode the WAVs to Opus,
targeting **1-2 MB total** so the set ships inside the app and works offline.
**Keep the filename stems** so the existing `id` fields still resolve.

Check whether Opus plays on iOS Safari before assuming; ship an AAC fallback
only if you confirm it does not. Say which you verified.

Playback is a plain `<audio>` element, which gives replay, scrub and volume for
free. The legacy app used Windows-only `winsound` with fire-and-forget playback
and no controls at all.

### Pitch matching — port the good parts

`notes_match` in `../main.py` is genuinely good code. Keep all of this:

- split on spaces, commas and hyphens
- accept `#` or `s` for sharp, `b` or `f` for flat
- compare **mod-12 pitch classes**, so enharmonics and octaves are equivalent
- compare only the **common prefix**, so a partial answer still counts
- return a **tri-state**, where `null` means "this entry has no literal pitch
  sequence, do not grade it"

**Fix one bug while porting.** The Python version opts out of grading whenever
the notes field contains `(`, which wrongly skips entries like
`"E D C B (descending, celesta)"` that do contain real pitches. Extract the
pitches first, then decide whether there is anything gradeable.

**Add one feature.** An optional transposition-tolerant mode that compares the
interval sequence rather than absolute pitch classes. Answering in the wrong key
is a common and defensible response, and the current code marks it wrong.

### Screen behaviour

- Naming **either** the piece or the composer counts as correct.
- `accept` on the work holds alternate titles ("Beethoven's Fifth", "Ode to Joy").
- `parts[].name` is the movement label, revealed only after answering.
- `parts[].hint` is a teaching note, **shown only after submitting**, never
  requestable. Several hints deliberately say what the clip is *not* yet
  ("this comes well before the famous Ode to Joy tune arrives") so they do not
  spoil what is coming. Preserve that behaviour.
- Keep the legacy UI's honest distinction: a local clip is a blind clip with no
  spoilers, a YouTube fallback warns that search results may show the title.
- Two chained fields: piece/composer, then optional notes. Enter moves from the
  first to the second, Enter on the second submits.

### Logging

Write an `AttemptEvent` with `mode: 'ear'` on each answer so the Learn tab can
see ear training. Use the work's title as `questionId`, `'Fine Arts'` as
category and `'Auditory Fine Arts'` as subcategory.

### Done when

Transcoded audio is **under 2 MB total**, and tests cover mod-12 matching
including an enharmonic case, a partial-prefix case, the transposition mode, and
a regression for the `(`-bug. The screen plays a clip and grades both fields.
Report the actual byte total you achieved.
