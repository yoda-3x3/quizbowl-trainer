/**
 * Client auth state.
 *
 * A single module-level store so sign-in from any screen is seen by every
 * subscriber without plumbing a context through the app shell, which matches
 * how `useSettings` works.
 *
 * The session cookie is HttpOnly and lives on /api/auth/*, so this module never
 * sees the token; it only mirrors the server's view of who is signed in by
 * calling /api/auth/me on mount and keeping the last answer in memory.
 */

import { useEffect, useState } from 'react';

export type AuthRole = 'user' | 'admin';

export interface AuthUser {
  id: number;
  username: string;
  role: AuthRole;
}

export interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  /** Last network error from signIn / signUp / refresh. Cleared on success. */
  error: string | null;
}

export interface AuthActions {
  signIn(username: string, password: string): Promise<AuthUser>;
  signUp(username: string, password: string): Promise<AuthUser>;
  signOut(): Promise<void>;
  refresh(): Promise<void>;
}

export type AuthHandle = AuthState & AuthActions;

// ---------------------------------------------------------------------------
// Module-level store
// ---------------------------------------------------------------------------

let state: AuthState = { user: null, loading: true, error: null };
const listeners = new Set<(s: AuthState) => void>();

function setState(patch: Partial<AuthState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l(state);
}

export function getAuthState(): AuthState {
  return state;
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

interface MeBody {
  user?: AuthUser;
  error?: string;
}

async function parseErrorBody(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body && typeof body.error === 'string' && body.error.length > 0) {
      return body.error;
    }
  } catch {
    // Non-JSON body, fall through.
  }
  return `request failed (${res.status})`;
}

async function readUser(res: Response): Promise<AuthUser> {
  const body = (await res.json()) as MeBody;
  if (!body.user) throw new Error('server returned no user');
  return body.user;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function refreshAuth(): Promise<void> {
  setState({ loading: true });
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (res.status === 401) {
      setState({ user: null, loading: false, error: null });
      return;
    }
    if (!res.ok) {
      setState({ loading: false, error: await parseErrorBody(res) });
      return;
    }
    const user = await readUser(res);
    setState({ user, loading: false, error: null });
  } catch (err) {
    setState({
      loading: false,
      error: err instanceof Error ? err.message : 'network error',
    });
  }
}

export async function signIn(username: string, password: string): Promise<AuthUser> {
  setState({ loading: true, error: null });
  try {
    const res = await postJson('/api/auth/signin', { username, password });
    if (!res.ok) {
      const error = await parseErrorBody(res);
      setState({ loading: false, error });
      throw new Error(error);
    }
    const user = await readUser(res);
    setState({ user, loading: false, error: null });
    return user;
  } catch (err) {
    if (!state.error) {
      setState({
        loading: false,
        error: err instanceof Error ? err.message : 'network error',
      });
    }
    throw err;
  }
}

export async function signUp(username: string, password: string): Promise<AuthUser> {
  setState({ loading: true, error: null });
  try {
    const res = await postJson('/api/auth/signup', { username, password });
    if (!res.ok) {
      const error = await parseErrorBody(res);
      setState({ loading: false, error });
      throw new Error(error);
    }
    const user = await readUser(res);
    setState({ user, loading: false, error: null });
    return user;
  } catch (err) {
    if (!state.error) {
      setState({
        loading: false,
        error: err instanceof Error ? err.message : 'network error',
      });
    }
    throw err;
  }
}

export async function signOut(): Promise<void> {
  try {
    await postJson('/api/auth/signout', {});
  } catch {
    // Signout is best-effort: clearing the client state is the important part,
    // and the server-side session row will expire on its own.
  }
  setState({ user: null, loading: false, error: null });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

let hasRefreshed = false;

/** Subscribes a component to the auth store, firing a /me refresh on first mount. */
export function useAuth(): AuthHandle {
  const [value, setValue] = useState<AuthState>(state);

  useEffect(() => {
    setValue(state);
    const listen = (s: AuthState) => setValue(s);
    listeners.add(listen);
    if (!hasRefreshed) {
      hasRefreshed = true;
      void refreshAuth();
    }
    return () => {
      listeners.delete(listen);
    };
  }, []);

  return {
    ...value,
    signIn,
    signUp,
    signOut,
    refresh: refreshAuth,
  };
}

// ---------------------------------------------------------------------------
// Test seam
// ---------------------------------------------------------------------------

/** Resets the store. Test-only. */
export function __resetAuth(): void {
  state = { user: null, loading: true, error: null };
  listeners.clear();
  hasRefreshed = false;
}

/** Sets the store directly. Test-only. */
export function __setAuth(patch: Partial<AuthState>): void {
  setState(patch);
}
