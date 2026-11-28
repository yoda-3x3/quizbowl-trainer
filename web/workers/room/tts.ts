/**
 * POST /api/tts  { text }  ->  audio/mpeg
 *
 * Neural read-aloud for voice mode, via Workers AI (Deepgram Aura-2). The
 * browser's built-in voices sound robotic; this is the "realistic" engine,
 * and the client falls back to them whenever this returns an error.
 *
 * Each distinct text is synthesized once: the MP3 is kept in the edge cache
 * keyed by a hash of model + voice + text, so the same tossup read twice (or
 * by two players) costs nothing the second time.
 */

/** The slice of the Workers AI binding this module uses. */
export interface TtsAi {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

export const TTS_MODEL = '@cf/deepgram/aura-2-en';
/** A clear, even-paced voice that suits a moderator. */
export const TTS_SPEAKER = 'orion';
/** Longest text accepted; a long tossup plus its lead-in is well under this. */
export const TTS_MAX_CHARS = 2000;

const JSON_HEADERS = { 'content-type': 'application/json' };

function error(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), { status, headers: JSON_HEADERS });
}

async function cacheKey(text: string): Promise<Request> {
  const bytes = new TextEncoder().encode(`${TTS_MODEL}\n${TTS_SPEAKER}\n${text}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return new Request(`https://tts.cache/${hex}`);
}

function toBody(out: unknown): BodyInit | null {
  if (out instanceof ReadableStream) return out;
  if (out instanceof ArrayBuffer || out instanceof Uint8Array) return out;
  if (out instanceof Response) return out.body;
  // Some binding versions wrap the audio as base64 in an object.
  const audio = (out as { audio?: unknown } | null)?.audio;
  if (typeof audio === 'string') {
    return Uint8Array.from(atob(audio), (c) => c.charCodeAt(0));
  }
  return null;
}

export async function handleTts(
  request: Request,
  ai: TtsAi | undefined,
  cache: Cache | null,
): Promise<Response> {
  if (request.method !== 'POST') return error(405, 'method not allowed');
  if (!ai) return error(503, 'tts not configured');

  let text = '';
  try {
    const body = (await request.json()) as { text?: unknown };
    text = typeof body.text === 'string' ? body.text.trim() : '';
  } catch {
    return error(400, 'expected JSON { text }');
  }
  if (!text) return error(400, 'text is required');
  if (text.length > TTS_MAX_CHARS) return error(413, `text over ${TTS_MAX_CHARS} chars`);

  const key = await cacheKey(text);
  const hit = cache ? await cache.match(key) : undefined;
  if (hit) return hit;

  let body: BodyInit | null;
  try {
    body = toBody(await ai.run(TTS_MODEL, { text, speaker: TTS_SPEAKER, encoding: 'mp3' }));
  } catch (e) {
    return error(502, `tts failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!body) return error(502, 'tts returned no audio');

  // Buffer it so one copy can go to the cache and one to the caller.
  const audio = await new Response(body).arrayBuffer();
  const headers = {
    'content-type': 'audio/mpeg',
    'cache-control': 'public, max-age=2592000, immutable',
  };
  if (cache) await cache.put(key, new Response(audio, { headers }));
  return new Response(audio, { headers });
}
