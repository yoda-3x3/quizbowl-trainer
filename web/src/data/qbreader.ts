/**
 * QB Reader data layer. OWNED FILE.
 *
 * Normalizes the upstream API into our Tossup/Bonus types and serves questions
 * through a prefetching, non-repeating queue.
 *
 * This is core rather than bulk work because the normalization is where a
 * subtle mistake poisons everything downstream: mishandling the "(*)" marker
 * breaks power scoring, dropping the HTML answer field breaks typo tolerance in
 * the judge, and trusting `answers.length === parts.length` crashes on the
 * handful of bonuses with authoring errors.
 *
 * VERIFIED API FACTS (measured, not assumed):
 *  - Host must be `www.qbreader.org`. The bare host 301s WITHOUT CORS headers.
 *  - Every endpoint sends `Access-Control-Allow-Origin: *`, so no proxy.
 *  - Rate limit is 20 req/sec; a 429 body is PLAIN TEXT, not JSON.
 *  - `categories=science` is silently ignored. It must be `Science`.
 */

import type {
  Bonus,
  Category,
  QuestionFilters,
  Tossup,
} from '../types';
import { BUNDLED_TOSSUPS } from './bundled';

const BASE = 'https://www.qbreader.org/api';

// ---------------------------------------------------------------------------
// Upstream shapes
// ---------------------------------------------------------------------------

interface RawSet {
  name?: string;
  year?: number;
  standard?: boolean;
}

interface RawPacket {
  number?: number;
}

interface RawTossup {
  _id?: string;
  question?: string;
  question_sanitized?: string;
  answer?: string;
  answer_sanitized?: string;
  category?: string;
  subcategory?: string;
  alternate_subcategory?: string;
  difficulty?: number;
  number?: number;
  packet?: RawPacket;
  set?: RawSet;
}

interface RawBonus {
  _id?: string;
  leadin?: string;
  leadin_sanitized?: string;
  parts?: string[];
  parts_sanitized?: string[];
  answers?: string[];
  answers_sanitized?: string[];
  values?: number[];
  category?: string;
  subcategory?: string;
  difficulty?: number;
  set?: RawSet;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeTossup(raw: RawTossup): Tossup | null {
  const question = raw.question ?? raw.question_sanitized;
  const answer = raw.answer ?? raw.answer_sanitized;
  if (!question || !answer) return null;

  // question_sanitized retains "(*)", which is what the power parser needs.
  // If it is missing we fall back to stripping tags ourselves, which also
  // preserves "(*)" because it is literal text, not markup.
  const questionSanitized = raw.question_sanitized ?? stripTags(question);

  return {
    id: raw._id ?? `qb-${Math.random().toString(36).slice(2)}`,
    question,
    questionSanitized,
    answer,
    answerSanitized: raw.answer_sanitized ?? stripTags(answer),
    category: (raw.category ?? 'Other Academic') as Category,
    subcategory: raw.subcategory ?? raw.category ?? 'Other Academic',
    ...(raw.alternate_subcategory
      ? { alternateSubcategory: raw.alternate_subcategory }
      : {}),
    difficulty: raw.difficulty ?? 3,
    setName: raw.set?.name ?? 'unknown set',
    setYear: raw.set?.year ?? 0,
    packetNumber: raw.packet?.number ?? 0,
    questionNumber: raw.number ?? 0,
    source: 'qbreader',
  };
}

export function normalizeBonus(raw: RawBonus): Bonus | null {
  const parts = raw.parts ?? [];
  const answers = raw.answers ?? raw.answers_sanitized ?? [];
  if (parts.length === 0 || answers.length === 0) return null;

  // A few bonuses upstream have answers.length !== parts.length. Truncate to
  // the shorter of the two rather than indexing past the end mid-game.
  const n = Math.min(parts.length, answers.length);

  return {
    id: raw._id ?? `qb-b-${Math.random().toString(36).slice(2)}`,
    leadin: raw.leadin ?? '',
    leadinSanitized: raw.leadin_sanitized ?? stripTags(raw.leadin ?? ''),
    parts: parts.slice(0, n),
    partsSanitized: (raw.parts_sanitized ?? parts).slice(0, n),
    answers: answers.slice(0, n),
    answersSanitized: (raw.answers_sanitized ?? answers.map(stripTags)).slice(0, n),
    ...(raw.values ? { values: raw.values.slice(0, n) } : {}),
    category: (raw.category ?? 'Other Academic') as Category,
    subcategory: raw.subcategory ?? raw.category ?? 'Other Academic',
    difficulty: raw.difficulty ?? 3,
    setName: raw.set?.name ?? 'unknown set',
    source: 'qbreader',
  };
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

export class RateLimited extends Error {
  constructor(public retryAfterMs: number) {
    super('qbreader rate limit');
  }
}

function buildQuery(filters: QuestionFilters, number: number): string {
  const p = new URLSearchParams();
  p.set('number', String(number));
  if (filters.difficulties.length > 0) {
    p.set('difficulties', filters.difficulties.join(','));
  }
  if (filters.categories.length > 0) {
    p.set('categories', filters.categories.join(','));
  }
  if (filters.subcategories.length > 0) {
    p.set('subcategories', filters.subcategories.join(','));
  }
  if (filters.minYear !== undefined) p.set('minYear', String(filters.minYear));
  if (filters.maxYear !== undefined) p.set('maxYear', String(filters.maxYear));
  if (filters.standardOnly) p.set('standardOnly', 'true');
  if (filters.powermarkOnly) p.set('powermarkOnly', 'true');
  return p.toString();
}

async function getJson(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`);
  if (res.status === 429) {
    const retry = Number(res.headers.get('retry-after') ?? '1');
    throw new RateLimited(Math.max(1000, retry * 1000));
  }
  if (!res.ok) throw new Error(`qbreader ${res.status}`);
  // Only parse JSON on a success; a 429 body is plain text.
  return res.json();
}

export async function fetchTossups(
  filters: QuestionFilters,
  n = 20,
): Promise<Tossup[]> {
  const data = (await getJson(`/random-tossup?${buildQuery(filters, n)}`)) as {
    tossups?: RawTossup[];
  };
  return (data.tossups ?? [])
    .map(normalizeTossup)
    .filter((t): t is Tossup => t !== null);
}

export async function fetchBonuses(
  filters: QuestionFilters,
  n = 20,
): Promise<Bonus[]> {
  const data = (await getJson(`/random-bonus?${buildQuery(filters, n)}`)) as {
    bonuses?: RawBonus[];
  };
  return (data.bonuses ?? [])
    .map(normalizeBonus)
    .filter((b): b is Bonus => b !== null);
}

export interface FrequencyEntry {
  answer: string;
  count: number;
}

/** Most-asked answers for a subcategory. Powers the Learn tab's lessons. */
export async function fetchFrequencyList(
  subcategory: string,
  limit = 40,
): Promise<FrequencyEntry[]> {
  const p = new URLSearchParams({ subcategory, limit: String(limit) });
  const data = (await getJson(`/frequency-list?${p.toString()}`)) as unknown;

  // The endpoint wraps its rows: {"frequencyList":[{answer, answer_normalized,
  // count}, ...]}. An earlier version of this function expected a bare array
  // and so silently returned nothing for every subcategory, which made the
  // Learn tab's lessons chapter permanently empty. Accept both shapes.
  const rows = unwrapFrequencyRows(data);

  return rows
    .map((row) => {
      const r = row as {
        answer?: string;
        answer_normalized?: string;
        _id?: string;
        count?: number;
      };
      const answer = r.answer ?? r.answer_normalized ?? r._id;
      return answer ? { answer, count: r.count ?? 0 } : null;
    })
    .filter((e): e is FrequencyEntry => e !== null)
    .slice(0, limit);
}

/** Accepts either a bare array or the `{frequencyList: [...]}` envelope. */
export function unwrapFrequencyRows(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const wrapped = (data as { frequencyList?: unknown }).frequencyList;
    if (Array.isArray(wrapped)) return wrapped;
  }
  return [];
}

// ---------------------------------------------------------------------------
// The queue — shuffled-deck drain, ported from the legacy app
// ---------------------------------------------------------------------------

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = out[i];
    const b = out[j];
    if (a !== undefined && b !== undefined) {
      out[i] = b;
      out[j] = a;
    }
  }
  return out;
}

const REFILL_THRESHOLD = 5;
const BATCH = 20;

/**
 * Serves tossups without repeats until the pool is exhausted, prefetching in
 * batches of 20 to respect the 20/sec limit with a single request.
 *
 * Falls back to the bundled offline pack when the network is unavailable, so
 * practice never hard-stops.
 */
export class TossupQueue {
  private pool: Tossup[] = [];
  private seen = new Set<string>();
  private fetching: Promise<void> | null = null;
  private offline = false;

  constructor(private filters: QuestionFilters) {}

  get isOffline(): boolean {
    return this.offline;
  }

  setFilters(filters: QuestionFilters): void {
    this.filters = filters;
    this.pool = [];
  }

  private async refill(): Promise<void> {
    try {
      const batch = await fetchTossups(this.filters, BATCH);
      const fresh = batch.filter((t) => !this.seen.has(t.id));
      if (fresh.length === 0) {
        // Exhausted what the filters can give us; allow repeats rather than
        // dead-ending, which is what the legacy deck drain did at reset.
        this.seen.clear();
        this.pool.push(...shuffle(batch));
      } else {
        this.pool.push(...shuffle(fresh));
      }
      this.offline = false;
    } catch {
      this.offline = true;
      const fallback = BUNDLED_TOSSUPS.filter((t) => !this.seen.has(t.id));
      if (fallback.length === 0) this.seen.clear();
      this.pool.push(
        ...shuffle(fallback.length > 0 ? fallback : BUNDLED_TOSSUPS),
      );
    }
  }

  private ensureRefill(): Promise<void> {
    if (this.fetching) return this.fetching;
    this.fetching = this.refill().finally(() => {
      this.fetching = null;
    });
    return this.fetching;
  }

  async next(): Promise<Tossup | null> {
    if (this.pool.length === 0) await this.ensureRefill();
    const t = this.pool.shift() ?? null;
    if (t) this.seen.add(t.id);
    // Warm the next batch in the background so the next buzz feels instant.
    if (this.pool.length < REFILL_THRESHOLD) void this.ensureRefill();
    return t;
  }
}

export function defaultFilters(): QuestionFilters {
  return {
    difficulties: [3, 4, 5],
    categories: [],
    subcategories: [],
    standardOnly: true,
  };
}
