/**
 * Session tokens and the single session cookie for the Rooms Worker.
 *
 * A session token is 32 random bytes rendered as lowercase hex. The cookie is
 * HttpOnly and SameSite=Lax; the app lives on a single origin because Pages
 * proxies /api to this Worker, so no cross-site exception is needed.
 *
 * Expiry is 30 days from issue. The server stores `expires_at` so a stolen
 * cookie whose row has been deleted cannot resurrect itself on the client.
 */

export const SESSION_COOKIE = 'session';
/** 30 days in seconds. Matches the cookie's Max-Age. */
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
/** 30 days in milliseconds. Matches the DB `expires_at` column. */
export const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;

/** 32 random bytes, hex-encoded. 64 characters. */
export function newSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] as number;
    out += (b < 16 ? '0' : '') + b.toString(16);
  }
  return out;
}

/** Serializes the session cookie with the given token and a 30-day TTL. */
export function serializeSessionCookie(token: string): string {
  return [
    `${SESSION_COOKIE}=${token}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ].join('; ');
}

/** The cookie used to clear a session on signout. */
export function serializeClearedSessionCookie(): string {
  return [
    `${SESSION_COOKIE}=`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Path=/',
    'Max-Age=0',
  ].join('; ');
}

/**
 * Finds the session token in a Cookie header, if present. Returns null for a
 * missing header, a missing cookie, or an empty value. Robust against stray
 * whitespace and extra cookies.
 */
export function parseSessionCookie(header: string | null): string | null {
  if (!header) return null;
  const parts = header.split(';');
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (name !== SESSION_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    return value.length > 0 ? value : null;
  }
  return null;
}
