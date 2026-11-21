/**
 * Regression test for a real bug found during live multiplayer QA: the join
 * code input stripped every digit, but makeRoomCode()'s alphabet
 * (CODE_ALPHABET in workers/room/protocol.ts) includes digits 2-9, making
 * most generated room codes literally unjoinable through the UI.
 */

import { describe, expect, it } from 'vitest';
import { sanitizeCodeInput } from '../Rooms';
import { CODE_ALPHABET, CODE_LENGTH } from '../../../workers/room/protocol';

describe('sanitizeCodeInput', () => {
  it('keeps digits from the room-code alphabet', () => {
    expect(sanitizeCodeInput('8N57')).toBe('8N57');
    expect(sanitizeCodeInput('P2HE')).toBe('P2HE');
  });

  it('upper-cases letters', () => {
    expect(sanitizeCodeInput('p2he')).toBe('P2HE');
  });

  it('strips characters outside the alphabet (e.g. confusable I/O/0/1)', () => {
    expect(sanitizeCodeInput('I0O1')).toBe('');
    expect(sanitizeCodeInput('A!B@C#D$')).toBe('ABCD');
  });

  it('truncates to CODE_LENGTH', () => {
    expect(sanitizeCodeInput('ABCDEFGH')).toHaveLength(CODE_LENGTH);
    expect(sanitizeCodeInput('ABCDEFGH')).toBe('ABCD');
  });

  it('accepts every character in the generator alphabet', () => {
    for (const ch of CODE_ALPHABET) {
      expect(sanitizeCodeInput(ch)).toBe(ch);
    }
  });
});
