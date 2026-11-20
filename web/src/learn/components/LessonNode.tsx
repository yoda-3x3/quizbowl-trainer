/**
 * One circular node on a unit's lesson path.
 *
 * The content inside the circle is intentionally small: an index, or a glyph
 * for a lock or a tick. The lesson's real title lives in a caption below,
 * because reading the title inside a 56px circle is not a design — it is a
 * test of the user's eyesight.
 */

import type { LessonDef, LessonProgress, LessonState } from '../units';

export interface LessonNodeProps {
  lesson: LessonDef & LessonProgress;
  onSelect(lesson: LessonDef): void;
}

const STATE_LABEL: Record<LessonState, string> = {
  locked: 'Locked, finish the previous lesson first',
  available: 'Start this lesson',
  'in-progress': 'Continue this lesson',
  completed: 'Completed, retry for more XP',
};

function glyph(state: LessonState, index: number): string {
  if (state === 'locked') return '○'; // hollow circle
  if (state === 'completed') return '✓'; // check mark
  return String(index);
}

export default function LessonNode({ lesson, onSelect }: LessonNodeProps) {
  const disabled = lesson.state === 'locked';
  const label = `Lesson ${lesson.index}: ${lesson.title} (${lesson.state})`;

  return (
    <div
      className={`lesson-node lesson-node--${lesson.state}`}
      aria-label={label}
    >
      <button
        type="button"
        className="lesson-node__btn"
        onClick={() => onSelect(lesson)}
        disabled={disabled}
        title={STATE_LABEL[lesson.state]}
        aria-label={label}
      >
        <span aria-hidden="true">{glyph(lesson.state, lesson.index)}</span>
      </button>
      <span className="lesson-node__label" aria-hidden="true">
        {lesson.title}
      </span>
    </div>
  );
}
