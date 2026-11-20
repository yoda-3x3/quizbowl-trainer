/**
 * Unit and lesson definitions for the Learn tab's Duolingo-style path.
 *
 * A unit is one Category. A lesson is a 5-question tossup drill scoped to
 * that unit — the first lesson in every unit is a random mix across all of
 * its subcategories; later lessons pin to a specific subcategory when the
 * category has them, so advancing through a unit feels like widening focus.
 *
 * Progress lives in the event log, not in a separate store. A lesson is
 * completed when at least `PASS_THRESHOLD` of its tagged tossup events came
 * back correct. A later retry of the same lesson id can only improve the
 * recorded correct count — once a lesson is completed it stays completed.
 */

import { CATEGORIES, SUBCATEGORIES, type AttemptEvent, type Category } from '../types';

/** Correct answers in a 5-question lesson needed to mark it complete. */
export const PASS_THRESHOLD = 3;

/** Questions per lesson. Kept as a const so tests and UI agree. */
export const LESSON_LENGTH = 5;

/** Lessons shown per unit. */
export const LESSONS_PER_UNIT = 5;

export type LessonState = 'locked' | 'available' | 'in-progress' | 'completed';

export interface LessonDef {
  /** Stable id `<categorySlug>-<index>`, used as the `lessonId` on events. */
  id: string;
  /** 1-based position in the unit. */
  index: number;
  unit: Category;
  /**
   * Subcategory the lesson pins to, or null for a random mix across the
   * whole category. The first lesson of every unit is always a mix so the
   * player is not forced into a narrow bucket before they know the unit.
   */
  subcategory: string | null;
  /** Human-readable label for the LessonNode's aria-label and completion screen. */
  title: string;
}

export interface UnitDef {
  category: Category;
  lessons: LessonDef[];
}

export interface LessonProgress {
  state: LessonState;
  attempts: number;
  correct: number;
  /** Most recent attempt time for this lesson, or null if never attempted. */
  lastAttemptAt: number | null;
}

export interface UnitProgress {
  unit: UnitDef;
  lessons: Array<LessonDef & LessonProgress>;
  /** Count of completed lessons in this unit, for the unit header readout. */
  completedCount: number;
}

// ---------------------------------------------------------------------------
// Unit construction
// ---------------------------------------------------------------------------

function slug(category: Category): string {
  return category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/**
 * Walks the category's subcategories to lay out lesson 2..N. Lesson 1 is
 * always a mix. If the category has fewer subcategories than remaining
 * lesson slots the walk wraps, so every slot is filled.
 */
function buildLessons(category: Category): LessonDef[] {
  const subs = SUBCATEGORIES[category] ?? [];
  const lessons: LessonDef[] = [];
  const categorySlug = slug(category);

  for (let i = 0; i < LESSONS_PER_UNIT; i++) {
    const index = i + 1;
    const id = `${categorySlug}-${index}`;
    if (i === 0 || subs.length === 0) {
      lessons.push({
        id,
        index,
        unit: category,
        subcategory: null,
        title: `${category} mix`,
      });
    } else {
      const sub = subs[(i - 1) % subs.length] as string;
      lessons.push({
        id,
        index,
        unit: category,
        subcategory: sub,
        title: sub,
      });
    }
  }
  return lessons;
}

/** Every unit, in the canonical CATEGORIES order. */
export function allUnits(): UnitDef[] {
  return CATEGORIES.map((category) => ({
    category,
    lessons: buildLessons(category),
  }));
}

/** Look up a lesson definition by its id. Null when the id is unknown. */
export function findLesson(id: string): LessonDef | null {
  for (const unit of allUnits()) {
    for (const lesson of unit.lessons) {
      if (lesson.id === id) return lesson;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Progress derivations
// ---------------------------------------------------------------------------

function lessonTotals(
  events: AttemptEvent[],
  lessonId: string,
): { attempts: number; correct: number; lastAt: number | null } {
  // Only the BEST attempt matters for pass-or-not. Group events by the
  // 1-second window around their timestamp? Simpler: take the max correct
  // count across any single attempt of this lesson. Each attempt is a run
  // of up to LESSON_LENGTH events tagged with the same lessonId. We use the
  // event's `lessonSeq` to split them: a new attempt resets seq to 0.
  //
  // In practice the Session writes seq = 0..LESSON_LENGTH-1 per attempt, so
  // we group by "runs that start at seq 0". A run is complete when it has
  // LESSON_LENGTH events, which is what we care about for completion.

  let bestCorrect = 0;
  let totalAttempts = 0;
  let lastAt: number | null = null;

  let runCorrect = 0;
  let runLen = 0;

  const tagged = events
    .filter((e) => e.lessonId === lessonId && typeof e.lessonSeq === 'number')
    .sort((a, b) => a.at - b.at);

  for (const e of tagged) {
    if (lastAt === null || e.at > lastAt) lastAt = e.at;
    if (e.lessonSeq === 0) {
      // Finish any previous run.
      if (runLen > 0) {
        totalAttempts += 1;
        if (runCorrect > bestCorrect) bestCorrect = runCorrect;
      }
      runCorrect = 0;
      runLen = 0;
    }
    runLen += 1;
    if (e.directive === 'accept') runCorrect += 1;
  }
  if (runLen > 0) {
    totalAttempts += 1;
    if (runCorrect > bestCorrect) bestCorrect = runCorrect;
  }

  return { attempts: totalAttempts, correct: bestCorrect, lastAt };
}

/**
 * Derives per-unit lesson progress from the event log. The first lesson of
 * every unit is always `available` — Duolingo's trick of never making the
 * player stare at a locked wall. Each later lesson unlocks as soon as the
 * one before it is `completed`.
 */
export function unitProgress(events: AttemptEvent[]): UnitProgress[] {
  const units = allUnits();
  return units.map((unit) => {
    const lessons = unit.lessons.map((lesson, i) => {
      const totals = lessonTotals(events, lesson.id);
      const completed = totals.correct >= PASS_THRESHOLD;
      const inProgress = !completed && totals.attempts > 0;
      return {
        ...lesson,
        state: 'pending' as LessonState,
        attempts: totals.attempts,
        correct: totals.correct,
        lastAttemptAt: totals.lastAt,
        _completed: completed,
        _inProgress: inProgress,
        _position: i,
      };
    });

    // Second pass to resolve locked/available. The first lesson is always
    // available; after that, availability rides on the previous lesson's
    // completion. A completed lesson stays completed; an in-progress one
    // keeps that label so the player sees where they left off.
    let previousCompleted = true; // Lesson 1 unlocks by default.
    for (const lesson of lessons) {
      if (lesson._completed) {
        lesson.state = 'completed';
      } else if (lesson._inProgress) {
        lesson.state = 'in-progress';
      } else if (previousCompleted || lesson._position === 0) {
        lesson.state = 'available';
      } else {
        lesson.state = 'locked';
      }
      previousCompleted = lesson._completed;
    }

    const cleaned = lessons.map(({ _completed, _inProgress, _position, ...rest }) => {
      void _completed;
      void _inProgress;
      void _position;
      return rest;
    });

    return {
      unit,
      lessons: cleaned,
      completedCount: cleaned.filter((l) => l.state === 'completed').length,
    };
  });
}

/** Total lessons the player has completed across every unit. */
export function totalCompleted(events: AttemptEvent[]): number {
  return unitProgress(events).reduce((n, u) => n + u.completedCount, 0);
}
