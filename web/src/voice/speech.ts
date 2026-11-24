/**
 * Voice mode primitives: read text aloud (Web Speech synthesis) and listen
 * for a spoken answer (Web Speech recognition).
 *
 * Both APIs are feature-detected and every entry point degrades to a no-op,
 * so a browser without them (Firefox has no recognition; some WebViews have
 * neither) silently falls back to the screen's own text and typing.
 */

export interface SpeakOptions {
  /** Speech rate multiplier, 1 = the voice's normal pace. */
  rate?: number;
  /** Fires per word with the char offset into `text`, when the voice reports it. */
  onBoundary?(charIndex: number): void;
  /** Always fires once unless stopped. `completed` is false if speech never really played through. */
  onEnd?(completed: boolean): void;
}

export interface ListenOptions {
  onInterim?(text: string): void;
  onFinal(text: string): void;
  /** Recognition stopped without a final result (silence, error, denied mic). */
  onNoResult?(reason: string): void;
}

// Minimal shapes for the prefixed, untyped recognition API.
interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function canListen(): boolean {
  return recognitionCtor() !== null;
}

/**
 * The reader's pacing is in words per minute; a typical voice at rate 1 runs
 * about 180 wpm. Matching the two keeps audio and on-screen text together
 * even on voices that never report word boundaries.
 */
export function rateForWpm(wpm: number): number {
  return Math.min(2, Math.max(0.5, wpm / 180));
}

/**
 * Prefer a local English voice: local voices fire word `boundary` events
 * (network voices in Chrome do not), which is what lets the reader re-anchor
 * its clock to the audio.
 */
function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const english = voices.filter((v) => /^en(-|_|$)/i.test(v.lang));
  return (
    english.find((v) => v.localService && v.default) ??
    english.find((v) => v.localService) ??
    english[0] ??
    null
  );
}

/** Stops anything being read. Safe to call when nothing is. */
export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}

/** Reads `text` aloud, replacing anything already being read. Returns a stop function. */
export function speak(text: string, opts: SpeakOptions = {}): () => void {
  if (!canSpeak() || text.trim() === '') {
    opts.onEnd?.(false);
    return () => {};
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voice = pickVoice();
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? 'en-US';
  const rate = opts.rate ?? 1;
  u.rate = rate;
  let stopped = false;
  let finished = false;
  // Callers wait on onEnd before opening the mic, so it must always fire:
  // a browser with no voices never starts, speech without a user gesture
  // errors, and Chrome can drop a long utterance without an end event.
  const words = text.trim().split(/\s+/).length;
  const expectedMs = (words / (180 * rate)) * 60_000;
  let startTimer: ReturnType<typeof setTimeout> | undefined;
  let maxTimer: ReturnType<typeof setTimeout> | undefined;
  let started = false;
  const finish = (completed: boolean) => {
    if (finished || stopped) return;
    finished = true;
    clearTimeout(startTimer);
    clearTimeout(maxTimer);
    opts.onEnd?.(completed);
  };
  u.onstart = () => {
    started = true;
    clearTimeout(startTimer);
  };
  u.onboundary = (e) => {
    if (!stopped && e.name !== 'sentence') opts.onBoundary?.(e.charIndex);
  };
  u.onend = () => finish(started);
  u.onerror = () => finish(false);
  startTimer = setTimeout(() => finish(false), 2500);
  maxTimer = setTimeout(() => finish(false), expectedMs * 1.6 + 3000);
  synth.speak(u);
  return () => {
    stopped = true;
    clearTimeout(startTimer);
    clearTimeout(maxTimer);
    synth.cancel();
  };
}

/** Listens for one spoken answer. Returns a function that stops listening. */
export function listen(opts: ListenOptions): () => void {
  const Ctor = recognitionCtor();
  if (!Ctor) {
    opts.onNoResult?.('unsupported');
    return () => {};
  }
  const rec = new Ctor();
  rec.lang = 'en-US';
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  let finished = false;
  let stopped = false;

  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (!r) continue;
      const text = r[0].transcript.trim();
      if (r.isFinal) {
        if (!finished && !stopped) {
          finished = true;
          opts.onFinal(text);
        }
        return;
      }
      interim += text;
    }
    if (!stopped && interim) opts.onInterim?.(interim);
  };
  rec.onerror = (e) => {
    if (!finished && !stopped) {
      finished = true;
      opts.onNoResult?.(e.error);
    }
  };
  rec.onend = () => {
    if (!finished && !stopped) {
      finished = true;
      opts.onNoResult?.('no-speech');
    }
  };

  try {
    rec.start();
  } catch {
    finished = true;
    opts.onNoResult?.('start-failed');
  }
  return () => {
    stopped = true;
    try {
      rec.abort();
    } catch {
      // Already stopped.
    }
  };
}

/**
 * The part of an answerline worth saying out loud: drop the bracketed and
 * parenthetical accept/prompt notes and any markup.
 */
export function spokenAnswer(answerline: string): string {
  return answerline
    .replace(/<[^>]*>/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Maps a char offset into `words.join(' ')` to the index of the word it falls
 * in. Used to turn a speech boundary event into a reader word index.
 */
export function wordIndexAtChar(words: readonly string[], charIndex: number): number {
  let pos = 0;
  for (let i = 0; i < words.length; i++) {
    const end = pos + (words[i] ?? '').length;
    if (charIndex <= end) return i;
    pos = end + 1;
  }
  return Math.max(0, words.length - 1);
}
