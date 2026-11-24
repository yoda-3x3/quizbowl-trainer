import { describe, expect, it, vi } from 'vitest';
import {
  canListen,
  canSpeak,
  listen,
  rateForWpm,
  speak,
  spokenAnswer,
  wordIndexAtChar,
} from '../speech';
import { normalizeSettings, DEFAULT_SETTINGS } from '../../ui/useSettings';

describe('wordIndexAtChar', () => {
  const words = ['This', 'man', 'wrote', 'Ulysses.'];
  // "This man wrote Ulysses."  offsets: This=0-3, man=5-7, wrote=9-13, Ulysses.=15-22

  it('maps the first char of each word to that word', () => {
    expect(wordIndexAtChar(words, 0)).toBe(0);
    expect(wordIndexAtChar(words, 5)).toBe(1);
    expect(wordIndexAtChar(words, 9)).toBe(2);
    expect(wordIndexAtChar(words, 15)).toBe(3);
  });

  it('maps a char inside a word to that word', () => {
    expect(wordIndexAtChar(words, 11)).toBe(2);
  });

  it('clamps past the end to the last word', () => {
    expect(wordIndexAtChar(words, 999)).toBe(3);
  });

  it('copes with an empty question', () => {
    expect(wordIndexAtChar([], 3)).toBe(0);
  });
});

describe('spokenAnswer', () => {
  it('drops markup and accept/prompt notes', () => {
    expect(
      spokenAnswer('<b><u>James Joyce</u></b> [accept Joyce; prompt on James]'),
    ).toBe('James Joyce');
  });

  it('drops parentheticals', () => {
    expect(spokenAnswer('Charles I (of England)')).toBe('Charles I');
  });
});

describe('rateForWpm', () => {
  it('maps the default pace near normal speech', () => {
    expect(rateForWpm(180)).toBe(1);
    expect(rateForWpm(150)).toBeCloseTo(0.83, 2);
  });

  it('stays inside what speech engines accept well', () => {
    expect(rateForWpm(20)).toBe(0.5);
    expect(rateForWpm(1000)).toBe(2);
  });
});

describe('without browser speech APIs', () => {
  // The node test environment has neither, like Firefox has no recognition.
  it('reports both as unavailable', () => {
    expect(canSpeak()).toBe(false);
    expect(canListen()).toBe(false);
  });

  it('speak is a no-op that still signals the end', () => {
    const onEnd = vi.fn();
    const stop = speak('hello', { onEnd });
    expect(onEnd).toHaveBeenCalledWith(false);
    expect(() => stop()).not.toThrow();
  });

  it('listen reports why it heard nothing instead of hanging', () => {
    const onFinal = vi.fn();
    const onNoResult = vi.fn();
    listen({ onFinal, onNoResult });
    expect(onFinal).not.toHaveBeenCalled();
    expect(onNoResult).toHaveBeenCalledWith('unsupported');
  });
});

describe('voice settings', () => {
  it('are off by default', () => {
    expect(DEFAULT_SETTINGS.voiceRead).toBe(false);
    expect(DEFAULT_SETTINGS.voiceAnswer).toBe(false);
  });

  it('survive a round trip and reject non-booleans', () => {
    const on = normalizeSettings({ voiceRead: true, voiceAnswer: true });
    expect(on.voiceRead).toBe(true);
    expect(on.voiceAnswer).toBe(true);
    const junk = normalizeSettings({ voiceRead: 'yes', voiceAnswer: 1 });
    expect(junk.voiceRead).toBe(false);
    expect(junk.voiceAnswer).toBe(false);
  });
});
