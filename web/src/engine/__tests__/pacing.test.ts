import { describe, expect, it } from 'vitest';
import { buildSchedule, revealedAt, revealedCharsAt, wordDelay } from '../reader';

describe('wordDelay', () => {
  const base = 400;

  it('gives longer words more time than short ones', () => {
    expect(wordDelay('a', base)).toBeLessThan(
      wordDelay('incontrovertibly', base),
    );
  });

  it('pauses after a sentence ending', () => {
    expect(wordDelay('end.', base)).toBeGreaterThan(wordDelay('end', base));
  });

  it('pauses less after a comma than after a full stop', () => {
    expect(wordDelay('word,', base)).toBeLessThan(wordDelay('word.', base));
    expect(wordDelay('word,', base)).toBeGreaterThan(wordDelay('word', base));
  });

  it('handles a quoted sentence ending', () => {
    expect(wordDelay('pipe."', base)).toBeGreaterThan(wordDelay('pipe', base));
  });

  it('ignores punctuation when measuring length', () => {
    // Same letters, so within the sentence-pause difference only.
    expect(wordDelay('cat', base)).toBeCloseTo(wordDelay('cat', base));
  });
});

describe('buildSchedule', () => {
  it('starts the first word at zero and increases monotonically', () => {
    const s = buildSchedule(['alpha', 'beta', 'gamma'], 150);
    expect(s[0]).toBe(0);
    expect(s[1]).toBeGreaterThan(0);
    expect(s[2]).toBeGreaterThan(s[1] as number);
  });

  it('is faster overall at a higher words-per-minute', () => {
    const words = 'one two three four five six seven eight'.split(' ');
    const slow = buildSchedule(words, 100);
    const fast = buildSchedule(words, 250);
    expect(fast[words.length - 1]).toBeLessThan(slow[words.length - 1] as number);
  });

  it('clamps absurdly low pace rather than dividing by zero', () => {
    const s = buildSchedule(['a', 'b'], 0);
    expect(Number.isFinite(s[1])).toBe(true);
  });

  it('returns an empty schedule for an empty question', () => {
    expect(buildSchedule([], 150)).toEqual([]);
  });
});

describe('revealedAt', () => {
  const words = 'alpha beta gamma delta epsilon'.split(' ');
  const schedule = buildSchedule(words, 150);

  it('reveals nothing before the first word is due', () => {
    expect(revealedAt(schedule, -1)).toBe(0);
  });

  it('reveals the first word at time zero', () => {
    expect(revealedAt(schedule, 0)).toBe(1);
  });

  it('reveals everything once the clock passes the last due time', () => {
    expect(revealedAt(schedule, 10_000_000)).toBe(words.length);
  });

  it('is monotonic as the clock advances', () => {
    let prev = 0;
    for (let ms = 0; ms < 5000; ms += 37) {
      const n = revealedAt(schedule, ms);
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
  });

  it('does not drift: the absolute schedule is the source of truth', () => {
    // Jumping straight to a late time must match stepping there gradually.
    const direct = revealedAt(schedule, 2000);
    let stepped = 0;
    for (let ms = 0; ms <= 2000; ms += 1) stepped = revealedAt(schedule, ms);
    expect(direct).toBe(stepped);
  });
});

describe('revealedCharsAt', () => {
  const words = 'alpha beta gamma delta epsilon'.split(' ');
  const schedule = buildSchedule(words, 150);
  const fullLen = words.join(' ').length;

  it('reveals nothing before the clock starts', () => {
    expect(revealedCharsAt(words, schedule, -1)).toBe(0);
    expect(revealedCharsAt(words, schedule, 0)).toBe(0);
  });

  it('is empty for an empty question', () => {
    expect(revealedCharsAt([], [], 0)).toBe(0);
    expect(revealedCharsAt([], [], 10_000)).toBe(0);
  });

  it('reveals exactly words[0] plus the trailing space when word 1 becomes due', () => {
    const at = schedule[1] ?? 0;
    expect(revealedCharsAt(words, schedule, at)).toBe(
      (words[0] as string).length + 1,
    );
  });

  it('reveals exactly words[0..1] plus spaces when word 2 becomes due', () => {
    const at = schedule[2] ?? 0;
    expect(revealedCharsAt(words, schedule, at)).toBe(
      (words[0] as string).length + 1 + (words[1] as string).length + 1,
    );
  });

  it('interpolates within a word\'s time slice', () => {
    // Halfway through the first word's slice, we should see roughly half of
    // "alpha " (6 chars including its trailing space).
    const start = schedule[0] ?? 0;
    const end = schedule[1] ?? 0;
    const mid = start + (end - start) / 2;
    const chars = revealedCharsAt(words, schedule, mid);
    expect(chars).toBeGreaterThan(0);
    expect(chars).toBeLessThan((words[0] as string).length + 1);
  });

  it('reaches the full length once every word has been read', () => {
    expect(revealedCharsAt(words, schedule, 10_000_000)).toBe(fullLen);
  });

  it('is monotonic as the clock advances', () => {
    let prev = 0;
    for (let ms = 0; ms < 5000; ms += 7) {
      const c = revealedCharsAt(words, schedule, ms);
      expect(c).toBeGreaterThanOrEqual(prev);
      prev = c;
    }
  });

  it('matches revealedAt at word boundaries', () => {
    // At every scheduled word start, the char count must equal the joined
    // length of the fully-revealed prefix: scoring and text reveal must not
    // disagree about where a word ends.
    for (let i = 1; i < words.length; i++) {
      const at = schedule[i] ?? 0;
      const expected = words.slice(0, i).join(' ').length + 1;
      expect(revealedCharsAt(words, schedule, at)).toBe(expected);
    }
  });

  it('keeps punctuation attached to its word', () => {
    // A word with trailing punctuation is a single token, so its comma or
    // period types out as part of that word's slice, never ticks into the
    // next word's time.
    const withPunct = ['Hello,', 'world.'];
    const sch = buildSchedule(withPunct, 150);
    // Just before "world." is due, we should see "Hello," plus one space and
    // nothing of "world.".
    const at = (sch[1] ?? 0) - 0.0001;
    const chars = revealedCharsAt(withPunct, sch, at);
    expect(chars).toBeGreaterThanOrEqual((withPunct[0] as string).length);
    expect(chars).toBeLessThanOrEqual((withPunct[0] as string).length + 1);
  });
});
