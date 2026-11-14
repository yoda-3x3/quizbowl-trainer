import { describe, expect, it } from 'vitest';
import { intervals, isGradeable, notesMatch, pitchClasses } from '../match';
import { EAR_WORKS, clipUrl, earParts, hasLocalClip } from '../works';

describe('pitchClasses', () => {
  it('maps the natural letters to mod-12 classes', () => {
    expect(pitchClasses('C D E F G A B')).toEqual([0, 2, 4, 5, 7, 9, 11]);
  });

  it('accepts # or s for sharp and b or f for flat', () => {
    expect(pitchClasses('C# Cs Db Df')).toEqual([1, 1, 1, 1]);
  });

  it('splits on spaces, commas and hyphens alike', () => {
    expect(pitchClasses('G,G-G G')).toEqual([7, 7, 7, 7]);
  });

  it('wraps accidentals that cross the octave boundary', () => {
    expect(pitchClasses('Cb B#')).toEqual([11, 0]);
  });

  it('ignores an octave digit, since octaves are equivalent', () => {
    expect(pitchClasses('G3 G5')).toEqual([7, 7]);
  });

  it('applies a trailing "flat" or "sharp" word to the note before it', () => {
    expect(pitchClasses('E flat')).toEqual(pitchClasses('Eb'));
    expect(pitchClasses('F sharp')).toEqual(pitchClasses('F#'));
  });

  it('skips prose words that merely start with a note letter', () => {
    // The Python version read "and" as A and "flute)" as F.
    expect(pitchClasses('(rippling flute and clarinet)')).toEqual([]);
    expect(pitchClasses('(bold march, brass and drums)')).toEqual([]);
  });
});

describe('notesMatch — mod-12 comparison', () => {
  it('accepts an exact sequence', () => {
    expect(notesMatch('G G G Eb', 'G G G Eb')).toBe(true);
  });

  it('accepts an enharmonic spelling', () => {
    // Eb and D# are the same pitch class, so the Beethoven 5 motto matches.
    expect(notesMatch('G G G D#', 'G G G Eb')).toBe(true);
  });

  it('accepts the same theme written an octave away', () => {
    expect(notesMatch('G2 G3 G4 Eb5', 'G G G Eb')).toBe(true);
  });

  it('rejects a wrong pitch', () => {
    expect(notesMatch('G G G E', 'G G G Eb')).toBe(false);
  });
});

describe('notesMatch — common prefix', () => {
  it('accepts a partial answer that is right so far', () => {
    expect(notesMatch('G G G', 'G G G Eb')).toBe(true);
    expect(notesMatch('G', 'G G G Eb')).toBe(true);
  });

  it('accepts an over-long answer whose prefix is right', () => {
    expect(notesMatch('G G G Eb F F F D', 'G G G Eb')).toBe(true);
  });

  it('still rejects a partial answer that is wrong inside the prefix', () => {
    expect(notesMatch('G A', 'G G G Eb')).toBe(false);
  });
});

describe('notesMatch — transposition tolerance', () => {
  it('rejects a transposed answer by default', () => {
    // The Beethoven 5 motto up a fourth: same shape, wrong key.
    expect(notesMatch('C C C Ab', 'G G G Eb')).toBe(false);
  });

  it('accepts a transposed answer when the mode is on', () => {
    expect(notesMatch('C C C Ab', 'G G G Eb', { transpose: true })).toBe(true);
  });

  it('accepts a transposed partial answer', () => {
    expect(notesMatch('A C B', 'B D C# B', { transpose: true })).toBe(true);
  });

  it('still rejects a wrong contour in transposed mode', () => {
    // Right starting interval, wrong second one.
    expect(notesMatch('C C C A', 'G G G Eb', { transpose: true })).toBe(false);
  });

  it('falls back to absolute comparison for a single note', () => {
    // One note carries no interval, so it has to be the right pitch class.
    expect(notesMatch('C', 'G G G Eb', { transpose: true })).toBe(false);
    expect(notesMatch('G', 'G G G Eb', { transpose: true })).toBe(true);
  });

  it('treats octave displacement inside a contour as equivalent', () => {
    expect(notesMatch('C5 C4 C5 Ab4', 'G G G Eb', { transpose: true })).toBe(true);
  });
});

describe('notesMatch — tri-state', () => {
  it('returns null when the entry has no literal pitches', () => {
    expect(notesMatch('C D E', '(pounding choral chords)')).toBeNull();
    expect(notesMatch('C D E', '(slow, wandering strings)')).toBeNull();
  });

  it('returns null when the optional notes field was left empty', () => {
    expect(notesMatch('', 'G G G Eb')).toBeNull();
    expect(notesMatch('   ', 'G G G Eb')).toBeNull();
  });

  it('returns false when something was typed but held no notes', () => {
    expect(notesMatch('I have no idea', 'G G G Eb')).toBe(false);
  });
});

describe('notesMatch — regression: the "(" bug', () => {
  // The Python version did `if "(" in answer_notes: return None`, which
  // skipped grading for every entry with a parenthetical aside even when the
  // pitches in front of it were perfectly gradeable.
  it('grades pitches that are followed by a parenthetical', () => {
    expect(notesMatch('E D C B', 'E D C B (descending, celesta)')).toBe(true);
    expect(notesMatch('E D C A', 'E D C B (descending, celesta)')).toBe(false);
  });

  it('grades the other real cases from the data set', () => {
    expect(notesMatch('D C B Bb', 'D C B Bb (dissonant chord)')).toBe(true);
    expect(notesMatch('G# C# E', 'G# C# E (repeating triplet)')).toBe(true);
    expect(notesMatch('G G G', 'G G G (repeated, col legno)')).toBe(true);
  });

  it('is unmoved by a leading parenthetical with no pitches at all', () => {
    expect(notesMatch('C D E', '(high trilling flute)')).toBeNull();
  });

  it('leaves most of the data set gradeable', () => {
    const parts = earParts(EAR_WORKS);
    const gradeable = parts.filter((p) => isGradeable(p.part.notes));
    expect(parts).toHaveLength(32);
    // 23 of the 32 parts carry real pitches; the other 9 are prose only.
    // The Python bug graded just 3 of them, the ones with no parenthetical.
    expect(gradeable.length).toBe(23);
    const pythonWouldGrade = parts.filter(
      (p) => isGradeable(p.part.notes) && !p.part.notes.includes('('),
    );
    expect(pythonWouldGrade).toHaveLength(3);
  });
});

describe('intervals', () => {
  it('returns ascending semitone steps mod 12', () => {
    expect(intervals([7, 7, 7, 3])).toEqual([0, 0, 8]);
  });

  it('returns nothing for fewer than two notes', () => {
    expect(intervals([])).toEqual([]);
    expect(intervals([5])).toEqual([]);
  });
});

describe('works data', () => {
  it('holds 20 works and 32 parts', () => {
    expect(EAR_WORKS).toHaveLength(20);
    expect(earParts(EAR_WORKS)).toHaveLength(32);
  });

  it('has a local clip for 27 parts and a search fallback for 5', () => {
    const parts = earParts(EAR_WORKS);
    const local = parts.filter((p) => hasLocalClip(p.part));
    expect(local).toHaveLength(27);
    expect(parts.length - local.length).toBe(5);
    for (const p of parts) {
      expect(p.part.search.length).toBeGreaterThan(0);
    }
  });

  it('builds a clip url from the part id, keeping the stem', () => {
    expect(clipUrl({ id: 'moldau' })).toBe('/audio/moldau.opus');
    expect(clipUrl({})).toBeNull();
  });

  it('gives every work a non-empty accept list including alternates', () => {
    for (const w of EAR_WORKS) {
      expect(w.accept.length).toBeGreaterThan(0);
    }
    const ninth = EAR_WORKS.find((w) => w.piece.startsWith('Symphony No. 9'));
    expect(ninth?.accept).toContain('Ode to Joy');
  });
});
