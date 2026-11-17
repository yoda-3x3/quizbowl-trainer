/**
 * Keyboard shortcut plumbing.
 *
 * One hook, one rule: a shortcut never fires while the user is typing. Any
 * input, textarea or contenteditable in focus means the keypress is theirs,
 * not ours. Modifier keys (Ctrl, Meta, Alt) also disqualify a press, so the
 * browser's own Ctrl+F, Cmd+L, etc. keep working.
 *
 * The map is `{key -> handler}`, matched against `ev.key`. Keys that are a
 * single printable character match case-insensitively, so you can bind "t"
 * without worrying about caps lock. Named keys ("Escape", "?", "Enter") match
 * exactly.
 */

import { useEffect } from 'react';

export type ShortcutMap = Record<string, (() => void) | undefined>;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}

export function useShortcuts(map: ShortcutMap, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;

    const handler = (ev: KeyboardEvent) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (isTypingTarget(ev.target)) return;

      const key = ev.key;
      const direct = map[key];
      if (direct) {
        ev.preventDefault();
        direct();
        return;
      }

      // Case-insensitive match for single-character letter bindings.
      if (key.length === 1) {
        const lower = key.toLowerCase();
        const fn = map[lower];
        if (fn) {
          ev.preventDefault();
          fn();
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [map, enabled]);
}
