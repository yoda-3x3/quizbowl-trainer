/**
 * Pitch tokens to staff positions.
 *
 * Deliberately separate from `match.ts`, which compares what you typed against
 * an answer. This module is about drawing: where on five lines does a note
 * sit. Pure, so the geometry is unit-testable without a DOM.
 *
 * Positions are in diatonic steps, because a staff is a diatonic grid: C and
 * C sharp occupy the same line, and the accidental is drawn beside the head.
 * That is why this does not reuse the mod-12 pitch classes used for grading.
 */

const STEP_INDEX: Record<string, number> = {
  C: 0,
  D: 1,
  E: 2,
  F: 3,
  G: 4,
  A: 5,
  B: 6,
};

export interface StaffNote {
  /** Letter name, uppercase. */
  step: string;
  /** -1 flat, 0 natural, +1 sharp. */
  accidental: number;
  octave: number;
  /**
   * Diatonic index: octave * 7 + step. Monotonic in pitch, so it orders and
   * positions notes directly.
   */
  diatonic: number;
}

/** Bottom line of a treble staff is E4. */
export const TREBLE_BOTTOM = 4 * 7 + STEP_INDEX.E!;

const TOKEN = /^([A-Ga-g])(#|s|b|f|natural)?(\d)?$/;

/**
 * Parses "G G G Eb" or "C#5 D5" into notes.
 *
 * Tokens that are not pitches are skipped rather than throwing: the source
 * data mixes real sequences with prose such as "(descending, celesta)", and a
 * parenthetical must not take the staff down with it.
 */
export function parseNotes(text: string, defaultOctave = 4): StaffNote[] {
  const out: StaffNote[] = [];
  for (const raw of text.split(/[\s,\-]+/)) {
    const token = raw.trim();
    if (!token) continue;
    const m = TOKEN.exec(token);
    if (!m) continue;

    const step = (m[1] ?? 'C').toUpperCase();
    const mark = m[2];
    const accidental =
      mark === '#' || mark === 's' ? 1 : mark === 'b' || mark === 'f' ? -1 : 0;
    const octave = m[3] ? Number(m[3]) : defaultOctave;
    const idx = STEP_INDEX[step];
    if (idx === undefined) continue;

    out.push({ step, accidental, octave, diatonic: octave * 7 + idx });
  }
  return out;
}

export interface StaffGeometry {
  /** Vertical centre of each note head, in the SVG's own units. */
  y: number;
  x: number;
  note: StaffNote;
  /** Ledger line offsets to draw, as y values. Empty for notes on the staff. */
  ledgers: number[];
}

export interface StaffLayout {
  width: number;
  height: number;
  /** y of each of the five staff lines, top to bottom. */
  lines: number[];
  notes: StaffGeometry[];
}

export interface StaffOptions {
  lineGap?: number;
  leftPad?: number;
  noteGap?: number;
  topPad?: number;
}

/**
 * Lays out a run of notes on a treble staff.
 *
 * One diatonic step is half a line gap, which is what makes consecutive
 * letters alternate line, space, line.
 */
export function layoutStaff(
  notes: StaffNote[],
  opts: StaffOptions = {},
): StaffLayout {
  const lineGap = opts.lineGap ?? 12;
  const leftPad = opts.leftPad ?? 34;
  const noteGap = opts.noteGap ?? 26;
  const topPad = opts.topPad ?? 34;

  const halfStep = lineGap / 2;
  // Top line is F5, four line-gaps above the bottom line.
  const bottomLineY = topPad + lineGap * 4;
  const lines = [0, 1, 2, 3, 4].map((i) => topPad + i * lineGap);

  const yFor = (diatonic: number) =>
    bottomLineY - (diatonic - TREBLE_BOTTOM) * halfStep;

  const geo: StaffGeometry[] = notes.map((note, i) => {
    const y = yFor(note.diatonic);
    const ledgers: number[] = [];

    // Below the staff: ledger lines at every whole line below the bottom.
    for (let ly = bottomLineY + lineGap; ly <= y + 0.01; ly += lineGap) {
      ledgers.push(ly);
    }
    // Above the staff.
    for (let ly = topPad - lineGap; ly >= y - 0.01; ly -= lineGap) {
      ledgers.push(ly);
    }

    return { x: leftPad + i * noteGap, y, note, ledgers };
  });

  const lowest = geo.reduce((m, g) => Math.max(m, g.y), bottomLineY);
  const highest = geo.reduce((m, g) => Math.min(m, g.y), topPad);

  return {
    width: leftPad + Math.max(1, notes.length) * noteGap + 12,
    height: Math.max(lowest + lineGap * 1.5, topPad + lineGap * 4 + lineGap * 1.5)
      + Math.max(0, topPad - highest),
    lines,
    notes: geo,
  };
}

/** True when the sequence contains at least one real pitch to draw. */
export function hasPitches(text: string): boolean {
  return parseNotes(text).length > 0;
}
