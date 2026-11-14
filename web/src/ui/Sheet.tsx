import type { ReactNode } from 'react';

export interface SheetProps {
  /** Small uppercase section label. Omit for a bare surface. */
  title?: ReactNode;
  /** Right-hand side of the header row, usually a pill or a small button. */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * The one surface everything sits on: a bordered panel with an optional
 * section header. Screens compose these rather than inventing their own cards,
 * so density stays consistent down to 390px.
 */
export default function Sheet({ title, aside, children, className }: SheetProps) {
  return (
    <section className={['sheet', className ?? ''].filter(Boolean).join(' ')}>
      {title !== undefined || aside !== undefined ? (
        <header className="sheet__head">
          {title !== undefined ? (
            <h2 className="sheet__title">{title}</h2>
          ) : (
            <span />
          )}
          {aside}
        </header>
      ) : null}
      {children}
    </section>
  );
}
