import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '../../types';
import type { AttemptEvent } from '../../types';
import {
  LESSONS_PER_UNIT,
  LESSON_LENGTH,
  PASS_THRESHOLD,
  allUnits,
  findLesson,
  totalCompleted,
  unitProgress,
} from '../units';

let seq = 0;
function ev(over: Partial<AttemptEvent> = {}): AttemptEvent {
  seq += 1;
  return {
    id: `e${seq}`,
    at: Date.UTC(2026, 10, 10, 12, 0, 0) + seq * 60_000,
    mode: 'tossup',
    questionId: `q${seq}`,
    category: 'Fine Arts',
    subcategory: 'Visual Fine Arts',
    difficulty: 3,
    buzzWordIndex: 10,
    totalWords: 50,
    powerWordIndex: 20,
    givenAnswer: 'x',
    directive: 'accept',
    points: 15,
    msToAnswer: 1200,
    ...over,
  };
}

/** Writes a full LESSON_LENGTH-event attempt of lesson `id` with `correct`
 *  accepts first, then the rest rejects. Returns the events in order. */
function attemptOf(
  lessonId: string,
  correct: number,
  opts: { startAt?: number } = {},
): AttemptEvent[] {
  const out: AttemptEvent[] = [];
  const base = opts.startAt ?? Date.UTC(2026, 10, 10, 12, 0, 0);
  for (let i = 0; i < LESSON_LENGTH; i++) {
    out.push(
      ev({
        at: base + i * 1000,
        lessonId,
        lessonSeq: i,
        directive: i < correct ? 'accept' : 'reject',
      }),
    );
  }
  return out;
}

describe('allUnits', () => {
  it('produces one unit per CATEGORIES entry, in order', () => {
    const units = allUnits();
    expect(units).toHaveLength(CATEGORIES.length);
    expect(units.map((u) => u.category)).toEqual([...CATEGORIES]);
  });

  it('gives every unit exactly LESSONS_PER_UNIT lessons', () => {
    for (const unit of allUnits()) {
      expect(unit.lessons).toHaveLength(LESSONS_PER_UNIT);
    }
  });

  it('makes lesson 1 a mix and later lessons pin to subcategories when the category has them', () => {
    const lit = allUnits().find((u) => u.category === 'Literature');
    expect(lit).toBeDefined();
    expect(lit!.lessons[0]?.subcategory).toBeNull();
    expect(lit!.lessons[0]?.title).toBe('Literature mix');
    // At least one of the later lessons should target a real subcategory.
    const pinned = lit!.lessons.slice(1).filter((l) => l.subcategory !== null);
    expect(pinned.length).toBeGreaterThan(0);
  });

  it('falls back to a mix every lesson for a single-subcategory category', () => {
    const religion = allUnits().find((u) => u.category === 'Religion');
    expect(religion).toBeDefined();
    // Religion has one subcategory "Religion"; lesson 1 is always a mix,
    // and the walk simply fills the remaining slots with that one sub.
    for (const lesson of religion!.lessons) {
      // Either a mix (subcategory null) or pinned to "Religion".
      expect(lesson.subcategory === null || lesson.subcategory === 'Religion').toBe(true);
    }
  });

  it('gives each lesson a stable, unique id', () => {
    const ids = new Set<string>();
    for (const unit of allUnits()) {
      for (const lesson of unit.lessons) {
        expect(ids.has(lesson.id)).toBe(false);
        ids.add(lesson.id);
      }
    }
  });
});

describe('findLesson', () => {
  it('looks up a lesson by id', () => {
    const lesson = findLesson('literature-1');
    expect(lesson).not.toBeNull();
    expect(lesson?.unit).toBe('Literature');
    expect(lesson?.index).toBe(1);
  });

  it('returns null for an unknown id', () => {
    expect(findLesson('nope-99')).toBeNull();
  });
});

describe('unitProgress gating', () => {
  it('starts with lesson 1 available and all later lessons locked for an empty log', () => {
    const progress = unitProgress([]);
    for (const unit of progress) {
      expect(unit.lessons[0]?.state).toBe('available');
      for (let i = 1; i < unit.lessons.length; i++) {
        expect(unit.lessons[i]?.state).toBe('locked');
      }
      expect(unit.completedCount).toBe(0);
    }
  });

  it('unlocks the next lesson once the current one is completed', () => {
    // Pass lesson 1 in the Literature unit with 3/5 correct.
    const events = attemptOf('literature-1', PASS_THRESHOLD);
    const lit = unitProgress(events).find((u) => u.unit.category === 'Literature');
    expect(lit).toBeDefined();
    expect(lit!.lessons[0]?.state).toBe('completed');
    expect(lit!.lessons[1]?.state).toBe('available');
    // Lesson 3 stays locked until lesson 2 is cleared.
    expect(lit!.lessons[2]?.state).toBe('locked');
    expect(lit!.completedCount).toBe(1);
  });

  it('keeps a lesson in-progress when the player has attempted but not passed', () => {
    const events = attemptOf('literature-1', PASS_THRESHOLD - 1); // 2/5 correct
    const lit = unitProgress(events).find((u) => u.unit.category === 'Literature');
    expect(lit!.lessons[0]?.state).toBe('in-progress');
    // Still have not unlocked lesson 2.
    expect(lit!.lessons[1]?.state).toBe('locked');
  });

  it('keeps a lesson completed when the best attempt was a pass, even after a worse retry', () => {
    const first = attemptOf('literature-1', LESSON_LENGTH, {
      startAt: Date.UTC(2026, 10, 10, 12, 0, 0),
    });
    const retry = attemptOf('literature-1', 1, {
      startAt: Date.UTC(2026, 10, 11, 12, 0, 0),
    });
    const lit = unitProgress([...first, ...retry]).find(
      (u) => u.unit.category === 'Literature',
    );
    expect(lit!.lessons[0]?.state).toBe('completed');
  });

  it('walks across the whole unit when lessons are cleared in order', () => {
    const events = [
      ...attemptOf('literature-1', PASS_THRESHOLD),
      ...attemptOf('literature-2', PASS_THRESHOLD, {
        startAt: Date.UTC(2026, 10, 11, 12, 0, 0),
      }),
    ];
    const lit = unitProgress(events).find((u) => u.unit.category === 'Literature');
    expect(lit!.lessons[0]?.state).toBe('completed');
    expect(lit!.lessons[1]?.state).toBe('completed');
    expect(lit!.lessons[2]?.state).toBe('available');
    expect(lit!.lessons[3]?.state).toBe('locked');
    expect(lit!.completedCount).toBe(2);
  });

  it('ignores events from other units when deriving a unit\'s progress', () => {
    const events = attemptOf('history-1', PASS_THRESHOLD);
    const lit = unitProgress(events).find((u) => u.unit.category === 'Literature');
    expect(lit!.lessons[0]?.state).toBe('available');
    expect(lit!.completedCount).toBe(0);
  });

  it('ignores events without a matching lessonSeq (e.g. old solo-practice rows)', () => {
    // A solo-practice correct answer that happens to be the same category
    // but has no lessonId must not auto-complete lesson 1.
    const events = Array.from({ length: LESSON_LENGTH }, () =>
      ev({ directive: 'accept' }),
    );
    const lit = unitProgress(events).find((u) => u.unit.category === 'Literature');
    expect(lit!.lessons[0]?.state).toBe('available');
  });
});

describe('totalCompleted', () => {
  it('sums the completedCount across every unit', () => {
    const events = [
      ...attemptOf('literature-1', PASS_THRESHOLD),
      ...attemptOf('history-1', PASS_THRESHOLD, {
        startAt: Date.UTC(2026, 10, 11, 12, 0, 0),
      }),
    ];
    expect(totalCompleted(events)).toBe(2);
  });

  it('is zero for an empty log', () => {
    expect(totalCompleted([])).toBe(0);
  });
});
