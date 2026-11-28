/**
 * Client side of profiles: the `#/u/<id>` route parser and the attempt sync,
 * which must strip answer/question text before anything leaves the device.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { __setMemoryLog } from '../engine/log';
import { profileIdFromHash, profileUrl, syncAttempts } from '../profile';
import type { AttemptEvent } from '../types';

describe('profile route', () => {
  it('parses #/u/<id> and nothing else', () => {
    expect(profileIdFromHash('#/u/12')).toBe(12);
    expect(profileIdFromHash('#/u/0')).toBeNull();
    expect(profileIdFromHash('#/u/abc')).toBeNull();
    expect(profileIdFromHash('#/u/12/x')).toBeNull();
    expect(profileIdFromHash('')).toBeNull();
    expect(profileUrl(7)).toBe('/#/u/7');
    expect(profileIdFromHash(profileUrl(7).slice(1))).toBe(7);
  });
});

function event(i: number): AttemptEvent {
  return {
    id: `e${i}`,
    at: 1_700_000_000_000 + i,
    mode: 'tossup',
    questionId: `q${i}`,
    category: 'Philosophy',
    subcategory: 'Philosophy',
    difficulty: 3,
    buzzWordIndex: 10,
    totalWords: 80,
    powerWordIndex: 30,
    givenAnswer: 'kant',
    directive: 'accept',
    points: 15,
    msToAnswer: 900,
    questionSnapshot: { questionSanitized: 'This thinker...', answerSanitized: 'Immanuel Kant', setName: 'S' },
  };
}

afterEach(() => vi.restoreAllMocks());

describe('syncAttempts', () => {
  it('uploads the log in chunks with only the fields the server keeps', async () => {
    __setMemoryLog(Array.from({ length: 250 }, (_, i) => event(i)));
    const bodies: Array<{ events: Array<Record<string, unknown>> }> = [];
    (globalThis as unknown as { fetch: unknown }).fetch = async (_path: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { events: Array<Record<string, unknown>> };
      bodies.push(body);
      return new Response(JSON.stringify({ inserted: body.events.length }), { status: 200 });
    };

    const inserted = await syncAttempts(1);
    expect(inserted).toBe(250);
    expect(bodies.map((b) => b.events.length)).toEqual([200, 50]);
    const sent = JSON.stringify(bodies);
    expect(sent).not.toContain('kant');
    expect(sent).not.toContain('Kant');
    expect(sent).not.toContain('This thinker');
    expect(Object.keys(bodies[0]?.events[0] ?? {}).sort()).toEqual(
      ['at', 'buzzWordIndex', 'category', 'directive', 'id', 'mode', 'points', 'powerWordIndex', 'totalWords'].sort(),
    );
  });

  it('surfaces a server error', async () => {
    __setMemoryLog([event(1)]);
    (globalThis as unknown as { fetch: unknown }).fetch = async () =>
      new Response(JSON.stringify({ error: 'not signed in' }), { status: 401 });
    await expect(syncAttempts(2)).rejects.toThrow('not signed in');
  });
});
