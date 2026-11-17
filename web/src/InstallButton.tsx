/**
 * Install-app button and iOS fallback.
 *
 * Renders nothing when the app is already running standalone, or on a browser
 * that has not yet fired `beforeinstallprompt` and is not iOS: that is a page
 * the manifest/SW gate is not satisfied on, so there is nothing we can offer.
 */

import { useState } from 'react';
import { Button, Sheet } from './ui';
import { useInstallState } from './install';

export default function InstallButton() {
  const { canInstall, isIOS, installed, promptInstall } = useInstallState();
  const [showIOS, setShowIOS] = useState(false);
  const [busy, setBusy] = useState(false);

  if (installed) return null;

  if (canInstall) {
    return (
      <Button
        variant="primary"
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          await promptInstall();
          setBusy(false);
        }}
        disabled={busy}
      >
        {busy ? 'Installing…' : 'Install app'}
      </Button>
    );
  }

  if (isIOS) {
    return (
      <>
        <Button variant="primary" onClick={() => setShowIOS(true)}>
          Install on iOS
        </Button>
        {showIOS ? (
          <Sheet title="Add to Home Screen">
            <p className="tiny">
              Tap the Share icon in Safari (the square with an arrow), scroll
              down, and pick <strong>Add to Home Screen</strong>. The app opens
              full screen from the icon, Rooms and packet import light up, and
              everything works offline.
            </p>
            <Button variant="ghost" small onClick={() => setShowIOS(false)}>
              Got it
            </Button>
          </Sheet>
        ) : null}
      </>
    );
  }

  return null;
}
