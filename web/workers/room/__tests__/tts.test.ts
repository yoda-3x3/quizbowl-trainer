/** Tests for POST /api/tts: validation, the AI call, and the edge cache. */

import { describe, expect, it, vi } from 'vitest';
import { TTS_MAX_CHARS, TTS_MODEL, handleTts, type TtsAi } from '../tts';

const post = (body: unknown) =>
  new Request('https://x/api/tts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const mp3 = () => new Uint8Array([0xff, 0xfb, 0x90, 0x00]);

function fakeAi(out: () => unknown = () => mp3()): TtsAi & { run: ReturnType<typeof vi.fn> } {
  return { run: vi.fn(async () => out()) };
}

function memoryCache(): Cache {
  const store = new Map<string, Response>();
  return {
    async match(req: RequestInfo) {
      const r = store.get(typeof req === 'string' ? req : req.url);
      return r?.clone();
    },
    async put(req: RequestInfo, res: Response) {
      store.set(typeof req === 'string' ? req : req.url, res.clone());
    },
  } as unknown as Cache;
}

describe('handleTts', () => {
  it('returns MP3 audio for text', async () => {
    const ai = fakeAi();
    const res = await handleTts(post({ text: 'For ten points, name this.' }), ai, null);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/mpeg');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(mp3());
    expect(ai.run).toHaveBeenCalledWith(
      TTS_MODEL,
      expect.objectContaining({ text: 'For ten points, name this.' }),
    );
  });

  it('accepts a ReadableStream from the binding', async () => {
    const ai = fakeAi(() => new Response(mp3()).body);
    const res = await handleTts(post({ text: 'hello' }), ai, null);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(mp3());
  });

  it('synthesizes each text once, then serves it from cache', async () => {
    const ai = fakeAi();
    const cache = memoryCache();
    await handleTts(post({ text: 'same text' }), ai, cache);
    const again = await handleTts(post({ text: 'same text' }), ai, cache);
    expect(again.status).toBe(200);
    expect(ai.run).toHaveBeenCalledTimes(1);
    await handleTts(post({ text: 'other text' }), ai, cache);
    expect(ai.run).toHaveBeenCalledTimes(2);
  });

  it('rejects bad requests without calling the model', async () => {
    const ai = fakeAi();
    expect((await handleTts(new Request('https://x/api/tts'), ai, null)).status).toBe(405);
    expect((await handleTts(post('not json'), ai, null)).status).toBe(400);
    expect((await handleTts(post({ text: '   ' }), ai, null)).status).toBe(400);
    expect((await handleTts(post({ text: 'a'.repeat(TTS_MAX_CHARS + 1) }), ai, null)).status).toBe(413);
    expect(ai.run).not.toHaveBeenCalled();
  });

  it('says 503 when the AI binding is missing, 502 when the model fails', async () => {
    expect((await handleTts(post({ text: 'hi' }), undefined, null)).status).toBe(503);
    const broken = fakeAi(() => {
      throw new Error('boom');
    });
    expect((await handleTts(post({ text: 'hi' }), broken, null)).status).toBe(502);
  });
});
