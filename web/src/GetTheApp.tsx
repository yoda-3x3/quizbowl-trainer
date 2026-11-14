/**
 * What a plain browser tab sees in place of Rooms and packet import.
 *
 * The web build is a lite mode on purpose: solo practice works anywhere, and
 * the two features that need a live socket or the filesystem are app-only.
 */

import { Sheet } from './ui';

export interface GetTheAppProps {
  /** The feature that is app-only, lower case, e.g. "multiplayer rooms". */
  feature: string;
  /** Why it is app-only, one sentence. */
  reason: string;
}

export default function GetTheApp({ feature, reason }: GetTheAppProps) {
  return (
    <Sheet title="In the app">
      <p className="tiny">
        {feature} {reason}
      </p>
      <p className="tiny muted">
        Install this page from your browser menu (Add to Home Screen on iOS,
        Install app on Android Chrome), or use the Android or iOS build. Tossups,
        bonuses, ear training, OAC matches, Learn and Settings all work here in
        the browser.
      </p>
    </Sheet>
  );
}
