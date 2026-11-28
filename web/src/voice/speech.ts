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
 * Fallback voice when the neural engine is unavailable: the most natural
 * English voice the browser has. Edge's "Online (Natural)" and Chrome's
 * "Google" voices are neural; the old local SAPI-style voices sound robotic
 * and are the last resort.
 */
export function pickVoice(
  voices: readonly SpeechSynthesisVoice[] = window.speechSynthesis.getVoices(),
): SpeechSynthesisVoice | null {
  const english = voices.filter((v) => /^en(-|_|$)/i.test(v.lang));
  const us = (v: SpeechSynthesisVoice) => /^en[-_]US$/i.test(v.lang);
  const natural = (v: SpeechSynthesisVoice) => /natural|neural/i.test(v.name);
  const google = (v: SpeechSynthesisVoice) => /^google/i.test(v.name);
  return (
    english.find((v) => natural(v) && us(v)) ??
    english.find(natural) ??
    english.find((v) => google(v) && us(v)) ??
    english.find(google) ??
    english.find((v) => v.localService && v.default) ??
    english.find((v) => v.localService) ??
    english[0] ??
    null
  );
}

// --- Neural engine (Workers AI via /api/tts) --------------------------------

/**
 * Off under tests (they script the Web Speech API directly) and switched off
 * for the session after the server says it can't do TTS, so a missing
 * binding costs one request, not one per question.
 */
let neuralOn = typeof import.meta !== 'undefined' && import.meta.env?.MODE !== 'test';

/** For tests and for a settings switch: use the neural engine or not. */
export function setNeuralVoice(on: boolean): void {
  neuralOn = on;
}

export function neuralVoiceOn(): boolean {
  return neuralOn && typeof fetch === 'function' && typeof Audio !== 'undefined';
}

/** Recently synthesized clips by text, so a repeated prompt or replay is instant. */
const clipCache = new Map<string, Promise<Blob>>();
const CLIP_CACHE_MAX = 12;

function fetchClip(text: string, signal?: AbortSignal): Promise<Blob> {
  const hit = clipCache.get(text);
  if (hit) return hit;
  const p = fetch('/api/tts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
    signal,
  }).then(async (r) => {
    if (!r.ok) {
      // Not configured / not deployed here: stop asking this session.
      if (r.status === 404 || r.status === 405 || r.status === 501 || r.status === 503) {
        neuralOn = false;
      }
      throw new Error(`tts ${r.status}`);
    }
    const blob = await r.blob();
    if (!blob.type.startsWith('audio/') || blob.size === 0) throw new Error('tts: not audio');
    return blob;
  });
  clipCache.set(text, p);
  p.catch(() => clipCache.delete(text));
  while (clipCache.size > CLIP_CACHE_MAX) {
    const oldest = clipCache.keys().next().value;
    if (oldest === undefined) break;
    clipCache.delete(oldest);
  }
  return p;
}

/** Warms the cache for text that is about to be read (e.g. the next question). */
export function prefetchSpeech(text: string): void {
  if (neuralVoiceOn() && text.trim()) fetchClip(text.trim()).catch(() => {});
}

/**
 * Interrupts the neural clip in flight, if any. Like a cancelled utterance,
 * an interrupted reading still reports onEnd(false): callers wait on onEnd
 * before opening the mic, so it must fire however the reading ends.
 */
let interruptCurrent: (() => void) | null = null;

/** Stops anything being read. Safe to call when nothing is. */
export function stopSpeaking(): void {
  const interrupt = interruptCurrent;
  interruptCurrent = null;
  interrupt?.();
  if (canSpeak()) window.speechSynthesis.cancel();
}

/** Reads `text` aloud, replacing anything already being read. Returns a stop function. */
export function speak(text: string, opts: SpeakOptions = {}): () => void {
  stopSpeaking();
  if (!neuralVoiceOn() || text.trim() === '') return speakBrowser(text, opts);
  const { stop, interrupt } = speakNeural(text, opts);
  interruptCurrent = interrupt;
  return () => {
    if (interruptCurrent === interrupt) interruptCurrent = null;
    stop();
  };
}

/**
 * Plays the neural clip. No word boundaries come with it, so progress is
 * reported as a char offset proportional to playback position — and pinned
 * to 0 while the clip is still loading, so a reader clock synced to it
 * doesn't run ahead of audio nobody has heard yet. Any failure before
 * playback falls back to the browser voice.
 */
function speakNeural(
  text: string,
  opts: SpeakOptions,
): { stop(): void; interrupt(): void } {
  const rate = opts.rate ?? 1;
  const ctrl = new AbortController();
  let stopped = false;
  let finished = false;
  let audio: HTMLAudioElement | null = null;
  let url: string | null = null;
  let fallbackStop: (() => void) | null = null;

  const hold = setInterval(() => opts.onBoundary?.(0), 100);
  opts.onBoundary?.(0);
  const cleanup = () => {
    clearInterval(hold);
    clearTimeout(loadTimer);
    if (audio) {
      audio.onplaying = audio.ontimeupdate = audio.onended = audio.onerror = null;
      audio.pause();
    }
    if (url) URL.revokeObjectURL(url);
  };
  const finish = (completed: boolean) => {
    if (finished || stopped) return;
    finished = true;
    cleanup();
    opts.onEnd?.(completed);
  };
  const fallBack = () => {
    if (finished || stopped || fallbackStop) return;
    cleanup();
    fallbackStop = speakBrowser(text, opts);
  };
  // Synthesis of a long tossup takes a second or two; past this, give up and
  // let the browser voice read it rather than leave the player waiting.
  const loadTimer = setTimeout(() => {
    ctrl.abort();
    fallBack();
  }, 9000);

  fetchClip(text.trim(), ctrl.signal)
    .then((blob) => {
      if (stopped || fallbackStop) return;
      clearTimeout(loadTimer);
      url = URL.createObjectURL(blob);
      const a = new Audio(url);
      audio = a;
      a.playbackRate = rate;
      (a as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
      let playing = false;
      a.onplaying = () => {
        playing = true;
        clearInterval(hold);
      };
      a.ontimeupdate = () => {
        if (!playing || !Number.isFinite(a.duration) || a.duration <= 0) return;
        const frac = Math.min(1, a.currentTime / a.duration);
        opts.onBoundary?.(Math.floor(frac * text.length));
      };
      a.onended = () => finish(true);
      a.onerror = () => (playing ? finish(false) : fallBack());
      a.play().catch(() => fallBack());
    })
    .catch(() => {
      if (!ctrl.signal.aborted) fallBack();
    });

  return {
    stop() {
      stopped = true;
      ctrl.abort();
      cleanup();
      fallbackStop?.();
    },
    interrupt() {
      ctrl.abort();
      // A browser fallback in flight ends via the synth.cancel() that follows.
      if (!fallbackStop) finish(false);
    },
  };
}

function speakBrowser(text: string, opts: SpeakOptions): () => void {
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
