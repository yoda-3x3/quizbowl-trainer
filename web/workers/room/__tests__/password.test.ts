import { describe, expect, it } from 'vitest';
import { hash, verify } from '../password';

describe('password hashing', () => {
  it('a hashed password verifies against itself', async () => {
    const stored = await hash('correct horse battery staple');
    expect(await verify('correct horse battery staple', stored)).toBe(true);
  });

  it('two hashes of the same password differ (random salt)', async () => {
    const a = await hash('the-same-password');
    const b = await hash('the-same-password');
    expect(a).not.toBe(b);
    expect(await verify('the-same-password', a)).toBe(true);
    expect(await verify('the-same-password', b)).toBe(true);
  });

  it('starts with the pbkdf2 prefix and four dollar-separated fields', async () => {
    const stored = await hash('x');
    const parts = stored.split('$');
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe('pbkdf2');
    expect(Number(parts[1])).toBeGreaterThanOrEqual(100_000);
  });

  it('rejects the wrong password', async () => {
    const stored = await hash('alpha');
    expect(await verify('beta', stored)).toBe(false);
  });

  it('rejects an empty submitted password when the stored one was not empty', async () => {
    const stored = await hash('alpha');
    expect(await verify('', stored)).toBe(false);
  });

  it('rejects a hash whose salt was tampered with', async () => {
    const stored = await hash('alpha');
    const parts = stored.split('$');
    // Flip one character of the salt.
    const salt = parts[2] ?? '';
    const flipped = (salt[0] === 'A' ? 'B' : 'A') + salt.slice(1);
    const tampered = `${parts[0]}$${parts[1]}$${flipped}$${parts[3]}`;
    expect(await verify('alpha', tampered)).toBe(false);
  });

  it('rejects a hash whose derived bytes were tampered with', async () => {
    const stored = await hash('alpha');
    const parts = stored.split('$');
    const digest = parts[3] ?? '';
    const flipped = (digest[0] === 'A' ? 'B' : 'A') + digest.slice(1);
    const tampered = `${parts[0]}$${parts[1]}$${parts[2]}$${flipped}`;
    expect(await verify('alpha', tampered)).toBe(false);
  });

  it('handles a malformed stored string without throwing', async () => {
    expect(await verify('x', '')).toBe(false);
    expect(await verify('x', 'not-a-hash')).toBe(false);
    expect(await verify('x', 'pbkdf2$abc')).toBe(false);
    expect(await verify('x', 'bcrypt$100$salt$hash')).toBe(false);
    expect(await verify('x', 'pbkdf2$0$AAAA$AAAA')).toBe(false);
    expect(await verify('x', 'pbkdf2$not-a-number$AAAA$AAAA')).toBe(false);
    expect(await verify('x', 'pbkdf2$1$$')).toBe(false);
    // Clearly bogus base64 should not throw.
    expect(await verify('x', 'pbkdf2$1$***$***')).toBe(false);
  });

  it('handles unicode passwords', async () => {
    const stored = await hash('пароль-123-ñ-🐎');
    expect(await verify('пароль-123-ñ-🐎', stored)).toBe(true);
    expect(await verify('пароль-123-ñ', stored)).toBe(false);
  });
});
