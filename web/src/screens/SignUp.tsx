/**
 * Sign-up screen. Same shape as SignIn, with a client-side password confirmation.
 *
 * Username rules mirror the server (`/^[a-z0-9_]+$/i`, 3-32 characters); the
 * client-side check is only a hint and the server is still the source of truth.
 */

import { useState, type FormEvent } from 'react';
import { Button, Field, Sheet, TextInput } from '../ui';
import { useAuth } from '../auth';

export interface SignUpProps {
  onDone?(): void;
  onSwitchToSignIn?(): void;
  onCancel?(): void;
}

const USERNAME_RE = /^[a-z0-9_]+$/i;

function usernameHint(u: string): string | null {
  if (u.length === 0) return null;
  if (u.length < 3) return 'Username is too short.';
  if (u.length > 32) return 'Username is too long.';
  if (!USERNAME_RE.test(u))
    return 'Use letters, digits and underscores only.';
  return null;
}

function passwordHint(p: string): string | null {
  if (p.length === 0) return null;
  if (p.length < 8) return 'Password needs at least 8 characters.';
  return null;
}

export default function SignUp({ onDone, onSwitchToSignIn, onCancel }: SignUpProps) {
  const auth = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const uHint = usernameHint(username);
  const pHint = passwordHint(password);
  const cMismatch = confirm.length > 0 && confirm !== password;

  const canSubmit =
    username.trim().length >= 3 &&
    password.length >= 8 &&
    confirm === password &&
    !submitting;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setLocalError(null);
    try {
      await auth.signUp(username.trim(), password);
      onDone?.();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Sign-up failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet
      title="Create an account"
      aside={
        onCancel ? (
          <Button variant="ghost" small onClick={onCancel}>
            Cancel
          </Button>
        ) : null
      }
    >
      <form onSubmit={submit}>
        <Field
          label="username"
          hint={
            uHint ?? '3 to 32 characters, letters, digits and underscores.'
          }
        >
          <TextInput
            autoFocus
            autoComplete="username"
            value={username}
            maxLength={32}
            onChange={(e) => setUsername(e.target.value)}
          />
        </Field>
        <Field
          label="password"
          hint={pHint ?? 'At least 8 characters.'}
        >
          <TextInput
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field
          label="confirm password"
          hint={cMismatch ? 'The two passwords do not match.' : undefined}
        >
          <TextInput
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        {localError ? (
          <p className="banner banner--warn">{localError}</p>
        ) : null}
        <div className="row">
          <Button variant="primary" type="submit" disabled={!canSubmit}>
            {submitting ? 'Creating…' : 'Create account'}
          </Button>
          {onSwitchToSignIn ? (
            <Button variant="ghost" onClick={onSwitchToSignIn} disabled={submitting}>
              I already have one
            </Button>
          ) : null}
        </div>
      </form>
    </Sheet>
  );
}
