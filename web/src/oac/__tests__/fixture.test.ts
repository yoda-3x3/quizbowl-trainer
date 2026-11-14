/**
 * The fixture has to be boring for the match tests to mean anything: every
 * answer accepts itself and rejects WRONG. If the answer checker ever starts
 * being clever about these words, this test fails here rather than as a
 * mysterious off-by-two in the final score.
 */

import { describe, expect, it } from 'vitest';
import { checkOacAnswer } from '../match';
import { allFixtureAnswers, makePacket, WRONG } from './fixture';

describe('fixture', () => {
  it('accepts every answer against itself', () => {
    for (const answer of allFixtureAnswers()) {
      const result = checkOacAnswer({ answer, acceptable: [] }, answer);
      expect(result.directive, answer).toBe('accept');
    }
  });

  it('rejects the wrong answer against every answer', () => {
    for (const answer of allFixtureAnswers()) {
      const result = checkOacAnswer({ answer, acceptable: [] }, WRONG);
      expect(result.directive, answer).toBe('reject');
    }
  });

  it('rejects a blank answer', () => {
    expect(checkOacAnswer({ answer: 'Alpha', acceptable: [] }, '   ').directive).toBe(
      'reject',
    );
  });

  it('is shaped like a full packet', () => {
    const packet = makePacket();
    expect(packet.categoryRound).toHaveLength(10);
    expect(packet.alphabet.items).toHaveLength(OAC_ITEMS);
    expect(packet.finalRound).toHaveLength(20);
    for (const block of packet.categoryRound) {
      expect(block.questions[0].kind).toBe('directed');
      expect(block.questions[1].kind).toBe('directed');
      expect(block.questions[2].kind).toBe('tossup');
    }
  });
});

const OAC_ITEMS = 20;
