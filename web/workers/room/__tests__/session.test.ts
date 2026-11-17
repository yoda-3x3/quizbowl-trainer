import { describe, expect, it } from 'vitest';
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  newSessionToken,
  parseSessionCookie,
  serializeClearedSessionCookie,
  serializeSessionCookie,
} from '../session';

describe('session tokens', () => {
  it('produces a 64-character lowercase hex string', () => {
    const t = newSessionToken();
    expect(t).toMatch(/^[0-9a-f]{64}$/);
  });

  it('two tokens almost never collide', () => {
    const set = new Set<string>();
    for (let i = 0; i < 64; i++) set.add(newSessionToken());
    expect(set.size).toBe(64);
  });
});

describe('session cookie serialization', () => {
  it('names the cookie session= with the token', () => {
    const t = 'a'.repeat(64);
    const c = serializeSessionCookie(t);
    expect(c.startsWith(`${SESSION_COOKIE}=${t};`)).toBe(true);
  });

  it('is HttpOnly, Secure, SameSite=Lax, Path=/ with a 30-day Max-Age', () => {
    const c = serializeSessionCookie('x'.repeat(64));
    expect(c).toContain('HttpOnly');
    expect(c).toContain('Secure');
    expect(c).toContain('SameSite=Lax');
    expect(c).toContain('Path=/');
    expect(c).toContain(`Max-Age=${SESSION_TTL_SECONDS}`);
    expect(SESSION_TTL_SECONDS).toBe(2_592_000);
  });

  it('cleared cookie uses Max-Age=0 and an empty value', () => {
    const c = serializeClearedSessionCookie();
    expect(c).toContain('Max-Age=0');
    expect(c.startsWith(`${SESSION_COOKIE}=;`)).toBe(true);
  });
});

describe('session cookie parsing', () => {
  it('reads the session cookie from a plain header', () => {
    expect(parseSessionCookie(`${SESSION_COOKIE}=abc123`)).toBe('abc123');
  });

  it('tolerates leading whitespace around every pair', () => {
    expect(parseSessionCookie(`other=1;  ${SESSION_COOKIE}=hello ; last=2`)).toBe(
      'hello',
    );
  });

  it('returns null for a missing header', () => {
    expect(parseSessionCookie(null)).toBeNull();
    expect(parseSessionCookie('')).toBeNull();
  });

  it('returns null when the cookie is not present', () => {
    expect(parseSessionCookie('foo=bar; baz=qux')).toBeNull();
  });

  it('returns null for an empty session value', () => {
    expect(parseSessionCookie(`${SESSION_COOKIE}=`)).toBeNull();
    expect(parseSessionCookie(`other=1; ${SESSION_COOKIE}=  ; x=2`)).toBeNull();
  });

  it('does not pick up a cookie whose name only contains the session name', () => {
    expect(parseSessionCookie('xsession=bad; other=1')).toBeNull();
  });

  it('round-trips with serializeSessionCookie', () => {
    const t = newSessionToken();
    // A browser does not send the attributes back, only the name and value.
    expect(parseSessionCookie(`${SESSION_COOKIE}=${t}`)).toBe(t);
  });
});
