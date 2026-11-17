/**
 * Sign-in screen. Rendered from Settings when nobody is signed in.
 *
 * Shares a Sheet with its layout, matches the dark, dense visual language of
 * the rest of the app, and surfaces the server's own error strings inline. The
 * submit button disables while the request is in flight so double-taps do not
 * stack signin attempts against the rate limiter.
 */

import { useState, type FormEvent } from 'react';
import { Button, Field, Sheet, TextInput } from '../ui';
import { useAuth } from '../auth';

export interface SignInProps {
  /** Fired after a successful signin, e.g. to close the sheet. */
  onDone?(): void;
  /** Swap to the sign-up screen. */
  onSwitchToSignUp?(): void;
  onCancel?(): void;
}

export default function SignIn({ onDone, onSwitchToSignUp, onCancel }: SignInProps) {
  const auth = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setLocalError(null);
    try {
      await auth.signIn(username.trim(), password);
      onDone?.();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit =
    username.trim().length > 0 && password.length > 0 && !submitting;

  return (
    <Sheet
      title="Sign in"
      aside={
        onCancel ? (
          <Button variant="ghost" small onClick={onCancel}>
            Cancel
          </Button>
        ) : null
      }
    >
      <form onSubmit={submit}>
        <Field label="username">
          <TextInput
            autoFocus
            autoComplete="username"
            value={username}
            maxLength={32}
            onChange={(e) => setUsername(e.target.value)}
          />
        </Field>
        <Field label="password">
          <TextInput
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {localError ? (
          <p className="banner banner--warn">{localError}</p>
        ) : null}
        <div className="row">
          <Button variant="primary" type="submit" disabled={!canSubmit}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
          {onSwitchToSignUp ? (
            <Button variant="ghost" onClick={onSwitchToSignUp} disabled={submitting}>
              Create an account
            </Button>
          ) : null}
        </div>
      </form>
    </Sheet>
  );
}
