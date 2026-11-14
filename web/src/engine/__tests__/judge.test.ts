import { describe, expect, it } from 'vitest';
import { judge } from '../judge';

/**
 * These lock in behaviour measured against qb-answer-checker 1.1.9. They exist
 * so a dependency bump that silently changes judging shows up as a test failure
 * rather than as mysteriously different scores.
 */
describe('judge', () => {
  const diana = '<b><u>Diana</u></b> [prompt on <u>Artemis</u>]';

  it('accepts the required answer', () => {
    expect(judge(diana, 'Diana').directive).toBe('accept');
  });

  it('is case insensitive', () => {
    expect(judge(diana, 'diana').directive).toBe('accept');
  });

  it('prompts on a prompt-listed alternate', () => {
    expect(judge(diana, 'artemis').directive).toBe('prompt');
  });

  it('rejects a wrong answer', () => {
    expect(judge(diana, 'zeus').directive).toBe('reject');
  });

  it('returns the directed prompt text when there is one', () => {
    const line =
      '<b><u>Fermats Last Theorem</u></b> [prompt on <u>Fermat</u> by asking "what theorem?"]';
    const r = judge(line, 'Fermat');
    expect(r.directive).toBe('prompt');
    expect(r.directedPrompt).toBe('what theorem?');
  });

  it('omits directedPrompt when there is none', () => {
    expect(judge(diana, 'artemis').directedPrompt).toBeUndefined();
  });

  it('accepts only the underlined span when the name is partly optional', () => {
    expect(judge('Rene <b><u>Magritte</u></b>', 'Magritte').directive).toBe(
      'accept',
    );
  });

  it('folds diacritics without any help from us', () => {
    expect(judge('<b><u>Salvador Dalí</u></b>', 'Salvador Dali').directive).toBe(
      'accept',
    );
    expect(judge('<b><u>René Magritte</u></b>', 'Rene Magritte').directive).toBe(
      'accept',
    );
  });

  it('tolerates a typo when the surname alone is the required span', () => {
    expect(
      judge('Pyotr Ilyich <b><u>Tchaikovsky</u></b>', 'Tchaikovksy').directive,
    ).toBe('accept');
  });

  it('requires the whole span when the whole name is underlined', () => {
    // Correct quizbowl behaviour, and the reason we prefer the HTML answer
    // field over the sanitized one.
    expect(
      judge('<b><u>Pyotr Ilyich Tchaikovsky</u></b>', 'Tchaikovsky').directive,
    ).toBe('reject');
  });

  it('rejects the legacy substring bug', () => {
    // The old Python matcher accepted "ring" here because "spring" contains it.
    expect(judge('<b><u>The Rite of Spring</u></b>', 'ring').directive).toBe(
      'reject',
    );
  });

  it('rejects an empty answer', () => {
    expect(judge(diana, '   ').directive).toBe('reject');
  });

  it('never throws on a malformed answerline', () => {
    expect(() => judge('<b><u>unclosed [accept', 'x')).not.toThrow();
    expect(judge('', 'x').directive).toBe('reject');
  });

  it('documents the known containment behaviour', () => {
    // Token containment means a surrounding negation still accepts. We do not
    // guard this: a blocklist would reject legitimate answers like "No Exit",
    // and nobody types a negation as their own self-test answer.
    expect(
      judge('<b><u>Michelangelo</u></b>', 'not michelangelo').directive,
    ).toBe('accept');
  });

  it('is more lenient at strictness 1 than at 7', () => {
    const line = '<b><u>Pyotr Ilyich Tchaikovsky</u></b>';
    expect(judge(line, 'Tchaikovksy', 1).directive).toBe('accept');
    expect(judge(line, 'Tchaikovksy', 7).directive).toBe('reject');
  });
});
