/**
 * One unit (= one Category) rendered as a vertical path of lesson nodes.
 *
 * The spine behind the nodes is a static CSS line; the nodes themselves are
 * laid out with flexbox rather than SVG so a title can wrap underneath each
 * one without the layout having to measure anything.
 */

import type { LessonDef } from '../units';
import type { UnitProgress } from '../units';
import LessonNode from './LessonNode';

export interface UnitPathProps {
  progress: UnitProgress;
  onSelectLesson(lesson: LessonDef): void;
}

export default function UnitPath({ progress, onSelectLesson }: UnitPathProps) {
  const { unit, lessons, completedCount } = progress;
  return (
    <section className="unit" aria-labelledby={`unit-${unit.category}`}>
      <header className="unit__head">
        <h3 className="unit__title" id={`unit-${unit.category}`}>
          {unit.category}
        </h3>
        <span className="unit__status" aria-label={`${completedCount} of ${lessons.length} lessons complete`}>
          {completedCount}/{lessons.length}
        </span>
      </header>

      <div className="unit__path">
        <div className="unit__spine" aria-hidden="true" />
        {lessons.map((lesson) => (
          <LessonNode
            key={lesson.id}
            lesson={lesson}
            onSelect={onSelectLesson}
          />
        ))}
      </div>
    </section>
  );
}
