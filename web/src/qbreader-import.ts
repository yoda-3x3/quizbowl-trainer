/**
 * Pulls packet JSON from qbreader.org's public API and converts it to the
 * server packet shape. Browser-side, user-triggered. Ships only in the admin
 * Packets screen; the Node seed script in `/scripts/` does the same thing
 * from a terminal for bulk runs.
 *
 * qbreader.org permits the API: robots.txt only disallows `/play/mp/`, and
 * Access-Control-Allow-Origin is *. This module runs one set at a time at
 * the user's gesture — no background crawl, no concurrency.
 */

import type { Category } from './types';
import type { ServerPacketData } from './packets';

const QBR = 'https://www.qbreader.org';

const VALID_CATEGORIES: ReadonlySet<Category> = new Set([
  'Literature', 'History', 'Science', 'Fine Arts', 'Religion', 'Mythology',
  'Philosophy', 'Social Science', 'Current Events', 'Geography',
  'Other Academic', 'Pop Culture',
]);

function pickCategory(raw: unknown): Category {
  return typeof raw === 'string' && VALID_CATEGORIES.has(raw as Category)
    ? (raw as Category)
    : 'Other Academic';
}

function yearOf(setName: string): number {
  const m = /^(\d{4})\b/.exec(setName);
  return m ? parseInt(m[1]!, 10) : 0;
}

export async function fetchQbreaderSetList(): Promise<string[]> {
  const res = await fetch(`${QBR}/api/set-list`);
  if (!res.ok) throw new Error(`qbreader set-list ${res.status}`);
  const body = (await res.json()) as { setList?: string[] };
  return body.setList ?? [];
}

export async function fetchQbreaderNumPackets(setName: string): Promise<number> {
  const res = await fetch(
    `${QBR}/api/num-packets?setName=${encodeURIComponent(setName)}`,
  );
  if (!res.ok) throw new Error(`qbreader num-packets ${res.status}`);
  const body = (await res.json()) as { numPackets?: number };
  return body.numPackets ?? 0;
}

interface QbTossup {
  _id?: string;
  question?: string;
  question_sanitized?: string;
  answer?: string;
  answer_sanitized?: string;
  category?: string;
  subcategory?: string;
  difficulty?: number;
  number?: number;
}
interface QbBonus {
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
}

export async function fetchQbreaderPacket(
  setName: string,
  packetNumber: number,
): Promise<ServerPacketData> {
  const url = `${QBR}/api/packet?setName=${encodeURIComponent(setName)}&packetNumber=${packetNumber}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`qbreader packet ${res.status}`);
  const body = (await res.json()) as { tossups?: QbTossup[]; bonuses?: QbBonus[] };
  const year = yearOf(setName);
  const tossups = (body.tossups ?? []).map((t) => ({
    id: String(t._id ?? crypto.randomUUID()),
    question: String(t.question ?? ''),
    questionSanitized: String(t.question_sanitized ?? t.question ?? ''),
    answer: String(t.answer ?? ''),
    answerSanitized: String(t.answer_sanitized ?? t.answer ?? ''),
    category: pickCategory(t.category),
    subcategory: String(t.subcategory ?? ''),
    difficulty: Number(t.difficulty ?? 3),
    setName,
    setYear: year,
    packetNumber,
    questionNumber: Number(t.number ?? 0),
    source: 'import' as const,
  }));
  const bonuses = (body.bonuses ?? []).map((b) => {
    const parts = (b.parts ?? []).map(String);
    const partsSan = (b.parts_sanitized ?? parts).map(String);
    const answers = (b.answers ?? []).map(String);
    const answersSan = (b.answers_sanitized ?? answers).map(String);
    return {
      id: String(b._id ?? crypto.randomUUID()),
      leadin: String(b.leadin ?? ''),
      leadinSanitized: String(b.leadin_sanitized ?? b.leadin ?? ''),
      parts,
      partsSanitized: partsSan,
      answers,
      answersSanitized: answersSan,
      ...(Array.isArray(b.values) ? { values: b.values.map(Number) } : {}),
      category: pickCategory(b.category),
      subcategory: String(b.subcategory ?? ''),
      difficulty: Number(b.difficulty ?? 3),
      setName,
      source: 'import' as const,
    };
  });
  return {
    tossups,
    bonuses,
    kind: 'standard',
    filename: `qbreader:${setName}:${packetNumber}`,
  };
}

export function qbreaderPacketName(setName: string, packetNumber: number): string {
  return `${setName} — Packet ${packetNumber}`;
}
