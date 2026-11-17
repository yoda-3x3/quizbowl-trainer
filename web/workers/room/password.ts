/**
 * Password hashing for the Rooms Worker.
 *
 * PBKDF2-SHA256 with a per-user random salt. bcrypt is deliberately avoided:
 * the WASM port is fragile under the Workers runtime and @node-rs/bcrypt is a
 * native addon that will not load in a Worker. PBKDF2 ships inside Web Crypto
 * so there is no extra dependency.
 *
 * Stored format: "pbkdf2$<iterations>$<salt_b64>$<hash_b64>".
 * The iterations are embedded so a future bump can keep verifying old hashes.
 */

const ITERATIONS = 210_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i] as number);
  // btoa is available in Workers.
  return btoa(s);
}

function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Constant-time comparison of two equal-length byte arrays. */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a[i] as number) ^ (b[i] as number);
  }
  return diff === 0;
}

async function derive(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

/** Produces a fresh stored-hash string for the given password. */
export async function hash(password: string): Promise<string> {
  const salt = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(salt);
  const out = await derive(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(out)}`;
}

/**
 * Checks `password` against a stored hash string. Returns false for any
 * malformed stored value instead of throwing: a corrupted row in the users
 * table must not take the signin route down.
 */
export async function verify(password: string, stored: string): Promise<boolean> {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 4) return false;
  const [scheme, iterStr, saltB64, hashB64] = parts;
  if (scheme !== 'pbkdf2') return false;
  const iterations = Number(iterStr);
  if (!Number.isFinite(iterations) || iterations < 1 || iterations > 10_000_000) {
    return false;
  }
  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = fromB64(saltB64 ?? '');
    expected = fromB64(hashB64 ?? '');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;
  let actual: Uint8Array;
  try {
    actual = await derive(password, salt, iterations);
  } catch {
    return false;
  }
  return constantTimeEqual(actual, expected);
}

/** For tests only. */
export const __test = { ITERATIONS, SALT_BYTES, HASH_BYTES };
