/**
 * Page-turn transition between screens, like flipping a page in a book.
 *
 * Uses the View Transitions API: the browser snapshots the current page, we
 * apply the state change synchronously inside the callback, and CSS (see
 * `.tab-page` / `::view-transition-*(page)` in theme.css) animates the old
 * snapshot turning over its left edge to reveal the new page underneath.
 * Going back runs it in reverse: the previous page swings back in from the
 * left and lands on top.
 *
 * Browsers without the API, and anyone with reduced motion on, just get the
 * state change (plus the existing small fade-in on `.tab-page`).
 */
import { flushSync } from 'react-dom';

export type FlipDirection = 'forward' | 'back';

interface ViewTransitionLike {
  finished: Promise<void>;
}
type StartViewTransition = (update: () => void) => ViewTransitionLike;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

let inFlight = false;

/**
 * Runs `update` (a React state change) as a page flip. Safe to call anywhere a
 * plain state update would go; if a flip is already running, the update just
 * happens immediately so rapid clicks never queue up animations.
 */
export function flipPage(update: () => void, direction: FlipDirection = 'forward'): void {
  const doc = typeof document === 'undefined' ? null : document;
  const start = (doc as unknown as { startViewTransition?: StartViewTransition } | null)
    ?.startViewTransition;
  if (!doc || typeof start !== 'function' || prefersReducedMotion() || inFlight) {
    update();
    return;
  }
  const root = doc.documentElement;
  root.dataset.flip = direction;
  inFlight = true;
  let transition: ViewTransitionLike;
  try {
    transition = start.call(doc, () => {
      flushSync(update);
    });
  } catch {
    inFlight = false;
    delete root.dataset.flip;
    update();
    return;
  }
  transition.finished
    .catch(() => {})
    .finally(() => {
      inFlight = false;
      delete root.dataset.flip;
    });
}

/** Forward when moving to a later item in `order`, back when moving earlier. */
export function directionBetween<T>(order: readonly T[], from: T, to: T): FlipDirection {
  return order.indexOf(to) < order.indexOf(from) ? 'back' : 'forward';
}
