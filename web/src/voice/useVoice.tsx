import { useCallback, useEffect, useRef, useState } from 'react';
import { useSettings } from '../ui';
import { canListen, canSpeak, listen, speak } from './speech';

/**
 * Reads `text` aloud once per `key` and reports whether that key's reading
 * has finished. Keyed rather than a "talking" flag so that a new key counts
 * as unread from its very first render — otherwise a listener could open in
 * the render between a new part appearing and its reading starting.
 * Always true when disabled or when there is nothing to read.
 */
export function useReadAloud(
  enabled: boolean,
  key: string | null,
  text: string,
  rate = 1,
): boolean {
  const [doneKey, setDoneKey] = useState<string | null>(null);
  const textRef = useRef(text);
  textRef.current = text;
  useEffect(() => {
    if (!enabled || key === null) return;
    return speak(textRef.current, { rate, onEnd: () => setDoneKey(key) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);
  return !enabled || key === null || doneKey === key;
}

/** Whether each half of voice mode is on and actually available here. */
export function useVoiceSettings(): { read: boolean; answer: boolean } {
  const [settings] = useSettings();
  return {
    read: settings.voiceRead && canSpeak(),
    answer: settings.voiceAnswer && canListen(),
  };
}

export type ListenState = 'off' | 'listening' | 'heard' | 'missed';

export interface VoiceAnswerHandle {
  state: ListenState;
  /** What the recognizer has heard so far, interim or final. */
  heard: string;
  /** Why the last attempt produced nothing, for the "missed" state. */
  reason: string | null;
  /** Listen again after a miss, or after a prompt. */
  restart(): void;
}

/**
 * Listens for a spoken answer whenever `active` is true and hands the final
 * transcript to `onFinal`. Changing `attemptKey` while active starts a fresh
 * listen (e.g. a moderator prompt asked for more).
 */
export function useVoiceAnswer(
  active: boolean,
  onFinal: (text: string) => void,
  attemptKey: unknown = null,
): VoiceAnswerHandle {
  const [state, setState] = useState<ListenState>('off');
  const [heard, setHeard] = useState('');
  const [reason, setReason] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  useEffect(() => {
    if (!active) {
      setState('off');
      return;
    }
    setState('listening');
    setHeard('');
    setReason(null);
    return listen({
      onInterim: setHeard,
      onFinal: (text) => {
        setHeard(text);
        setState('heard');
        onFinalRef.current(text);
      },
      onNoResult: (why) => {
        // Recognizers give up after a few seconds of silence; while an answer
        // is still wanted, just listen again. Real failures (mic blocked,
        // none present) stop and say so.
        if (why === 'no-speech') {
          setNonce((n) => n + 1);
          return;
        }
        setReason(why);
        setState('missed');
      },
    });
  }, [active, attemptKey, nonce]);

  const restart = useCallback(() => setNonce((n) => n + 1), []);
  return { state, heard, reason, restart };
}

function missedText(reason: string | null): string {
  if (reason === 'not-allowed' || reason === 'service-not-allowed') {
    return 'Microphone blocked — allow it in the browser, or type instead.';
  }
  if (reason === 'audio-capture') return 'No microphone found — type instead.';
  return "Didn't catch that.";
}

/** One-line status for a voice answer, with a retry after a miss. */
export function VoiceAnswerStatus({ voice }: { voice: VoiceAnswerHandle }) {
  if (voice.state === 'off') return null;
  return (
    <div className={`voice-status voice-status--${voice.state}`} role="status" aria-live="polite">
      {voice.state === 'listening' ? (
        <>
          <span className="voice-status__dot" aria-hidden="true" />
          <span>{voice.heard ? `“${voice.heard}”` : 'listening — say your answer'}</span>
        </>
      ) : voice.state === 'heard' ? (
        <span>heard “{voice.heard}”</span>
      ) : (
        <>
          <span>{missedText(voice.reason)}</span>
          <button type="button" className="voice-status__retry" onClick={voice.restart}>
            Speak again
          </button>
        </>
      )}
    </div>
  );
}
