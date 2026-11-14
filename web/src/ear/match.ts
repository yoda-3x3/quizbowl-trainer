/**
 * Pitch-class matching for ear training.
 *
 * Ported from `notes_match` in ../main.py, which was the best piece of code in
 * the legacy app. Everything worth keeping is kept:
 *
 *  - tokens split on whitespace, commas and hyphens
 *  - `#`/`s` mean sharp, `b`/`f` mean flat
 *  - comparison is on mod-12 PITCH CLASSES, so enharmonics (A#/Bb) and octave
 *    displacement are equivalent, which is what you actually want when someone
 *    sings a theme back in whatever register they can reach
 *  - only the COMMON PREFIX is compared, so "G G G" counts against "G G G Eb"
 *  - the result is tri-state, where `null` means "there is nothing here to
 *    grade" and the caller must stay silent rather than show a verdict
 *
 * TWO CHANGES FROM THE PYTHON:
 *
 * 1. BUG FIX. The Python version bailed out with `if "(" in answer_notes:
 *    return None`, so every entry whose notes carry a parenthetical aside was
 *    silently ungraded, including ones with a perfectly good pitch sequence:
 *    "E D C B (descending, celesta)", "G G G Eb", "D C B Bb (dissonant chord)".
 *    Of the 32 parts in ear_training.json, 13 have real pitches followed by a
 *    parenthetical, so the bug disabled note grading on 40% of the set.
 *
 *    We extract pitches first and decide afterwards whether anything is
 *    gradeable. That requires the token scanner to be strict rather than
 *    lenient: the Python took the first letter of any token, so "and" in
 *    "(rippling flute and clarinet)" would have parsed as an A natural and
 *    "flute)" as an F. A token now has to look like a note and nothing else.
 *
 * 2. NEW FEATURE. `transpose: true` compares the INTERVAL sequence instead of
 *    absolute pitch classes. Singing a remembered theme in the wrong key is a
 *    normal thing to do and the shape is the part you were actually testing,
 *    so it should not be marked wrong. With fewer than two notes in the common
 *    prefix there is no interval to compare, so a single note falls back to
 *    absolute comparison.
 */

const PITCH_CLASS: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/**
 * A note and nothing else: letter, optional accidental, optional octave digit.
 * `s` is sharp and `f` is flat, as the legacy app accepted.
 */
const NOTE_RE = /^([A-Ga-g])([#s♯]|[bf♭])?(\d)?$/;

/** Words and symbols that sharpen or flatten the note before them. */
const MODIFIERS: Record<string, number> = {
  sharp: 1,
  sharps: 1,
  flat: -1,
  flats: -1,
  natural: 0,
  '#': 1,
  '♯': 1,
  '♭': -1,
};

export interface NotesMatchOptions {
  /**
   * Compare the interval sequence rather than absolute pitch classes, so an
   * answer in the wrong key still counts.
   */
  transpose?: boolean;
}

/**
 * Extract mod-12 pitch classes from free text.
 *
 * Non-note tokens are skipped, which is how a parenthetical aside such as
 * "(descending, celesta)" contributes nothing while the pitches before it
 * still parse. A trailing "sharp"/"flat" word modifies the preceding note, so
 * "E flat" and "Eb" agree.
 */
export function pitchClasses(text: string): number[] {
  const out: number[] = [];
  for (const raw of text.split(/[\s,\-–—]+/)) {
    const token = raw.trim();
    if (!token) continue;

    const mod = MODIFIERS[token.toLowerCase()];
    if (mod !== undefined) {
      const last = out[out.length - 1];
      if (last !== undefined) {
        out[out.length - 1] = (((last + mod) % 12) + 12) % 12;
      }
      continue;
    }

    const m = NOTE_RE.exec(token);
    if (!m) continue;

    const letter = PITCH_CLASS[(m[1] ?? '').toUpperCase()];
    if (letter === undefined) continue;
    const accidental = m[2];
    const acc = accidental ? (/[#s♯]/i.test(accidental) ? 1 : -1) : 0;
    out.push((((letter + acc) % 12) + 12) % 12);
  }
  return out;
}

/**
 * Ascending interval sequence in semitones, mod 12.
 *
 * Mod 12 keeps octave displacement irrelevant, matching the pitch-class rule:
 * a theme sung an octave lower than remembered is the same theme.
 */
export function intervals(pcs: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < pcs.length; i += 1) {
    const a = pcs[i - 1] ?? 0;
    const b = pcs[i] ?? 0;
    out.push((((b - a) % 12) + 12) % 12);
  }
  return out;
}

/**
 * Grade a typed note sequence against an entry's `notes` field.
 *
 * Returns `true` for a match, `false` for a miss, and `null` when there is
 * nothing to grade: either the entry has no literal pitch sequence (its notes
 * are a prose description such as "(pounding choral chords)"), or the player
 * left the optional notes field empty. A `null` must not be reported as wrong.
 */
export function notesMatch(
  userText: string,
  answerNotes: string,
  options: NotesMatchOptions = {},
): boolean | null {
  const answerPcs = pitchClasses(answerNotes);
  // No literal pitches in the source material: this entry is not gradeable,
  // whatever the player typed.
  if (answerPcs.length === 0) return null;

  // The notes field is optional. Skipping it is not a wrong answer.
  if (userText.trim().length === 0) return null;

  const userPcs = pitchClasses(userText);
  // They typed something, but none of it was a note.
  if (userPcs.length === 0) return false;

  const n = Math.min(userPcs.length, answerPcs.length);
  const userPrefix = userPcs.slice(0, n);
  const answerPrefix = answerPcs.slice(0, n);

  if (options.transpose && n >= 2) {
    const a = intervals(userPrefix);
    const b = intervals(answerPrefix);
    return a.every((v, i) => v === b[i]);
  }

  return userPrefix.every((v, i) => v === answerPrefix[i]);
}

/** True when an entry's notes field holds a pitch sequence worth grading. */
export function isGradeable(answerNotes: string): boolean {
  return pitchClasses(answerNotes).length > 0;
}
