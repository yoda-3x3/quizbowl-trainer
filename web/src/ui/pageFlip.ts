/**
 * Quick slide between screens.
 *
 * The new page slides in with a slight swing, from the right when moving
 * forward and from the left when going back. It is a plain CSS entrance
 * animation on the remounted `.tab-page` (see theme.css), so it starts on the
 * very next frame: no View Transition snapshot of the old page, which is what
 * made the earlier book page-turn feel laggy on heavy pages.
 *
 * Reduced motion is handled in CSS (the slide becomes a short fade).
 */

export type FlipDirection = 'forward' | 'back';

/**
 * Runs `update` (a React state change) and tells the CSS which way the next
 * page should slide in. The direction is set before React commits, so the
 * remounted page picks it up on its first frame.
 */
export function flipPage(update: () => void, direction: FlipDirection = 'forward'): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.slide = direction;
  }
  update();
}

/** Forward when moving to a later item in `order`, back when moving earlier. */
export function directionBetween<T>(order: readonly T[], from: T, to: T): FlipDirection {
  return order.indexOf(to) < order.indexOf(from) ? 'back' : 'forward';
}
