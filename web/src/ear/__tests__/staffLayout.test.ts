import { describe, expect, it } from 'vitest';
import { hasPitches, layoutStaff, parseNotes, TREBLE_BOTTOM } from '../staffLayout';
import {
  findMotifWork,
  heardSeconds,
  motifRevealsFor,
  motifStudyOrder,
  playableSegments,
} from '../motifMatch';
import { MOTIF_WORKS, MOTIF_WORK_BY_ID } from '../motifs';

describe('parseNotes', () => {
  it('reads a plain sequence', () => {
    const n = parseNotes('G G G Eb');
    expect(n).toHaveLength(4);
    expect(n[0]?.step).toBe('G');
    expect(n[3]?.step).toBe('E');
    expect(n[3]?.accidental).toBe(-1);
  });

  it('accepts both spellings of sharp and flat', () => {
    expect(parseNotes('F#')[0]?.accidental).toBe(1);
    expect(parseNotes('Fs')[0]?.accidental).toBe(1);
    expect(parseNotes('Bb')[0]?.accidental).toBe(-1);
    expect(parseNotes('Bf')[0]?.accidental).toBe(-1);
  });

  it('splits on commas and hyphens as well as spaces', () => {
    expect(parseNotes('C,D-E F')).toHaveLength(4);
  });

  it('takes an explicit octave', () => {
    const [a, b] = parseNotes('C4 C5');
    expect(a?.octave).toBe(4);
    expect(b?.octave).toBe(5);
    expect(b!.diatonic - a!.diatonic).toBe(7);
  });

  it('skips prose instead of throwing', () => {
    // The source data mixes pitches with parentheticals, and one stray word
    // must not take the whole staff down.
    const n = parseNotes('E D C B (descending, celesta)');
    expect(n.map((x) => x.step)).toEqual(['E', 'D', 'C', 'B']);
  });

  it('returns nothing for pure prose', () => {
    expect(parseNotes('(low chromatic horns)')).toHaveLength(0);
    expect(hasPitches('(low chromatic horns)')).toBe(false);
    expect(hasPitches('G G G Eb')).toBe(true);
  });

  it('orders diatonic index by pitch', () => {
    const [c, d, e] = parseNotes('C D E');
    expect(c!.diatonic).toBeLessThan(d!.diatonic);
    expect(d!.diatonic).toBeLessThan(e!.diatonic);
  });
});

describe('layoutStaff', () => {
  it('puts E4 on the bottom line', () => {
    const layout = layoutStaff(parseNotes('E4'));
    const bottomLine = layout.lines[4];
    expect(layout.notes[0]?.y).toBeCloseTo(bottomLine!, 5);
  });

  it('puts F5 on the top line', () => {
    const layout = layoutStaff(parseNotes('F5'));
    expect(layout.notes[0]?.y).toBeCloseTo(layout.lines[0]!, 5);
  });

  it('steps up the staff by half a line gap per diatonic step', () => {
    const layout = layoutStaff(parseNotes('E4 F4 G4'), { lineGap: 12 });
    const ys = layout.notes.map((n) => n.y);
    expect(ys[0]! - ys[1]!).toBeCloseTo(6, 5);
    expect(ys[1]! - ys[2]!).toBeCloseTo(6, 5);
  });

  it('draws higher notes further up the page', () => {
    const layout = layoutStaff(parseNotes('C4 C5'));
    expect(layout.notes[1]!.y).toBeLessThan(layout.notes[0]!.y);
  });

  it('adds ledger lines below the staff but not on it', () => {
    const onStaff = layoutStaff(parseNotes('G4'));
    expect(onStaff.notes[0]?.ledgers).toHaveLength(0);
    const belowStaff = layoutStaff(parseNotes('C4'));
    expect(belowStaff.notes[0]!.ledgers.length).toBeGreaterThan(0);
  });

  it('spaces notes evenly left to right', () => {
    const layout = layoutStaff(parseNotes('C D E F'), { noteGap: 26 });
    const xs = layout.notes.map((n) => n.x);
    expect(xs[1]! - xs[0]!).toBe(26);
    expect(xs[3]! - xs[2]!).toBe(26);
  });

  it('survives an empty sequence', () => {
    const layout = layoutStaff([]);
    expect(layout.notes).toHaveLength(0);
    expect(layout.lines).toHaveLength(5);
    expect(layout.width).toBeGreaterThan(0);
  });

  it('exposes the treble bottom as E4', () => {
    expect(TREBLE_BOTTOM).toBe(parseNotes('E4')[0]!.diatonic);
  });
});

describe('findMotifWork', () => {
  it('matches a piece from its answer line', () => {
    expect(findMotifWork('<b><u>Symphony No. 5</u></b>')?.id).toBe(
      'beethoven5_mvt1',
    );
    expect(findMotifWork('Ride of the Valkyries')?.id).toBe('valkyries');
  });

  it('matches the alternate titles quizbowl actually uses', () => {
    expect(findMotifWork("Beethoven's Fifth")?.id).toBe('beethoven5_mvt1');
    expect(findMotifWork('Ode to Joy')?.id).toBe('beethoven9_mvt4');
    expect(findMotifWork('In the Hall of the Mountain King')?.id).toBe(
      'peer_gynt_mountainking',
    );
  });

  it('stays silent on a piece we have no motifs for', () => {
    expect(findMotifWork('The Rite of Spring')).toBeNull();
    expect(findMotifWork('')).toBeNull();
  });
});

describe('motifRevealsFor', () => {
  const fifth = MOTIF_WORK_BY_ID.get('beethoven5_mvt1')!;

  it('reveals nothing before a clue describes anything', () => {
    expect(motifRevealsFor(fifth, 'This symphony by a German'.split(' '))).toEqual(
      [],
    );
  });

  it('reveals the motif a clue names', () => {
    const out = motifRevealsFor(fifth, 'It opens with a four note motto'.split(' '));
    expect(out).toHaveLength(1);
    expect(out[0]?.motif.id).toBe('motto');
  });

  it('accumulates and orders by the question', () => {
    const words =
      'a four note motto is then restated before quiet strings take over'.split(
        ' ',
      );
    const out = motifRevealsFor(fifth, words);
    expect(out.map((r) => r.motif.id)).toEqual([
      'motto',
      'motto_lower',
      'development',
    ]);
  });
});

describe('playableSegments', () => {
  const fifth = MOTIF_WORK_BY_ID.get('beethoven5_mvt1')!;

  it('plays in clip order, not mention order', () => {
    const late = fifth.motifs[2]!;
    const early = fifth.motifs[0]!;
    const segs = playableSegments([late, early]);
    expect(segs[0]!.start).toBeLessThan(segs[1]!.start);
  });

  it('merges segments that butt together, so playback does not stutter', () => {
    const segs = playableSegments([
      { id: 'a', label: '', keywords: [], start: 0, end: 2 },
      { id: 'b', label: '', keywords: [], start: 2, end: 4 },
    ]);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toEqual({ start: 0, end: 4 });
  });

  it('keeps a real gap as two segments', () => {
    const segs = playableSegments([
      { id: 'a', label: '', keywords: [], start: 0, end: 2 },
      { id: 'b', label: '', keywords: [], start: 9, end: 11 },
    ]);
    expect(segs).toHaveLength(2);
  });

  it('totals the seconds accounted for', () => {
    expect(
      heardSeconds([
        { id: 'a', label: '', keywords: [], start: 0, end: 2 },
        { id: 'b', label: '', keywords: [], start: 9, end: 11 },
      ]),
    ).toBeCloseTo(4, 5);
    expect(heardSeconds([])).toBe(0);
  });
});

describe('the motif set itself', () => {
  it('has unique work ids and unique motif ids within a work', () => {
    expect(new Set(MOTIF_WORKS.map((w) => w.id)).size).toBe(MOTIF_WORKS.length);
    for (const w of MOTIF_WORKS) {
      expect(new Set(w.motifs.map((m) => m.id)).size).toBe(w.motifs.length);
    }
  });

  it('keeps every segment inside the clip and ordered', () => {
    for (const w of MOTIF_WORKS) {
      for (const m of w.motifs) {
        expect(m.start).toBeGreaterThanOrEqual(0);
        expect(m.end).toBeGreaterThan(m.start);
        expect(m.end).toBeLessThanOrEqual(w.duration + 0.001);
      }
    }
  });

  it('gives every motif a keyword and every work at least three motifs', () => {
    for (const w of MOTIF_WORKS) {
      expect(w.motifs.length).toBeGreaterThanOrEqual(3);
      for (const m of w.motifs) {
        expect(m.keywords.length).toBeGreaterThan(0);
        expect(m.keywords.every((k) => k === k.toLowerCase())).toBe(true);
      }
    }
  });

  it('parses every authored note sequence', () => {
    for (const w of MOTIF_WORKS) {
      for (const m of w.motifs) {
        if (m.notes) expect(parseNotes(m.notes).length).toBeGreaterThan(0);
      }
    }
  });

  it('keeps giveaway motifs last in study order', () => {
    for (const w of MOTIF_WORKS) {
      const order = motifStudyOrder(w);
      expect(order).toHaveLength(w.motifs.length);
      const first = order.findIndex((m) => m.giveaway);
      if (first >= 0) {
        expect(order.slice(first).every((m) => m.giveaway)).toBe(true);
      }
    }
  });
});
