export interface TabItem<Id extends string> {
  id: Id;
  label: string;
  /** A single character used as a plain glyph; no icon font is loaded. */
  glyph: string;
}

export interface TabBarProps<Id extends string> {
  items: readonly TabItem<Id>[];
  active: Id;
  onSelect(id: Id): void;
}

/**
 * Fixed bottom navigation. Fixed rather than sticky because the practice
 * screens scroll and the tab bar must stay thumb-reachable; it sits above the
 * home-indicator inset via the --safe-b padding in theme.css.
 */
export default function TabBar<Id extends string>({
  items,
  active,
  onSelect,
}: TabBarProps<Id>) {
  return (
    <nav className="tabbar" aria-label="Sections">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="tabbar__btn"
          aria-current={item.id === active ? 'page' : undefined}
          onClick={() => onSelect(item.id)}
        >
          <span className="tabbar__glyph" aria-hidden="true">
            {item.glyph}
          </span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
