/**
 * A five-line staff that fills in as motifs are described.
 *
 * Drawn rather than typeset: a real notation engine would be a large
 * dependency for what is a handful of note heads with no rhythm. Pitch is the
 * only thing this needs to show, and pitch is what a clue gives you.
 */

import { layoutStaff, parseNotes, type StaffNote } from './staffLayout';

export interface StaffProps {
  /** Pitch tokens, e.g. "G G G Eb". Prose is ignored. */
  notes: string;
  /** Highlights the notes added by the most recent reveal. */
  newFrom?: number;
  className?: string;
}

const ACCIDENTAL: Record<number, string> = { [-1]: '♭', 1: '♯' };

export default function Staff({ notes, newFrom, className }: StaffProps) {
  const parsed: StaffNote[] = parseNotes(notes);
  const layout = layoutStaff(parsed, { lineGap: 12, leftPad: 38, noteGap: 28 });

  if (parsed.length === 0) return null;

  const bottomLine = layout.lines[4] ?? 0;

  return (
    <svg
      className={`staff${className ? ` ${className}` : ''}`}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      role="img"
      aria-label={`Staff showing ${parsed
        .map(
          (n) =>
            `${n.step}${n.accidental === 1 ? ' sharp' : n.accidental === -1 ? ' flat' : ''}`,
        )
        .join(', ')}`}
    >
      {layout.lines.map((y, i) => (
        <line
          key={i}
          x1={6}
          x2={layout.width - 6}
          y1={y}
          y2={y}
          className="staff__line"
        />
      ))}

      <text x={10} y={bottomLine + 2} className="staff__clef">
        {'\u{1D11E}'}
      </text>

      {layout.notes.map((g, i) => {
        const isNew = newFrom !== undefined && i >= newFrom;
        const stemUp = g.y > (layout.lines[2] ?? 0);
        return (
          <g
            key={i}
            className={`staff__note${isNew ? ' staff__note--new' : ''}`}
            style={{ animationDelay: `${i * 70}ms` }}
          >
            {g.ledgers.map((ly, k) => (
              <line
                key={k}
                x1={g.x - 9}
                x2={g.x + 9}
                y1={ly}
                y2={ly}
                className="staff__line"
              />
            ))}

            <line
              x1={stemUp ? g.x + 5.4 : g.x - 5.4}
              x2={stemUp ? g.x + 5.4 : g.x - 5.4}
              y1={g.y}
              y2={stemUp ? g.y - 26 : g.y + 26}
              className="staff__stem"
            />

            <ellipse
              cx={g.x}
              cy={g.y}
              rx={6}
              ry={4.4}
              transform={`rotate(-18 ${g.x} ${g.y})`}
              className="staff__head"
            />

            {g.note.accidental !== 0 ? (
              <text x={g.x - 20} y={g.y + 4} className="staff__accidental">
                {ACCIDENTAL[g.note.accidental]}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
