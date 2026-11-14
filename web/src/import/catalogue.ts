/**
 * Set enumeration for quizbowlpackets.com.
 *
 * LEGAL POSTURE — read before changing anything in this file.
 *
 * quizbowlpackets.com publishes `robots.txt` on BOTH the site host and the
 * file host with `Disallow: /` for ClaudeBot, anthropic-ai, Claude-Web, GPTBot,
 * CCBot and about thirty other agents, and asserts
 * `Content-Signal: search=yes, ai-train=no, use=reference` as an express
 * reservation of rights. The site releases packets "for study and practice
 * use" only.
 *
 * Everything here is therefore PURE PARSING. This module performs no network
 * I/O at all: it turns HTML that the user's own browser already loaded into
 * structured records. The single, user-initiated fetch lives in
 * `fetchPacket.ts` and is subject to the guards documented there.
 *
 * Do not add a crawler, a bulk downloader, a prefetcher or a scheduled sync on
 * top of this module. Enumerating a catalogue costs ONE request per archive
 * because each archive homepage embeds its whole catalogue in the Next.js RSC
 * payload, so there is never a reason to walk set pages in bulk.
 */

// ---------------------------------------------------------------------------
// Archives
// ---------------------------------------------------------------------------

export type ArchiveId = 'hs' | 'collegiate' | 'popculture' | 'ms';

export interface Archive {
  id: ArchiveId;
  host: string;
  label: string;
  /** Approximate set count, for UI copy only. */
  approxSets: number;
}

/** The four sibling archives. Same application, separate catalogues. */
export const ARCHIVES: readonly Archive[] = [
  {
    id: 'hs',
    host: 'www.quizbowlpackets.com',
    label: 'High school',
    approxSets: 610,
  },
  {
    id: 'collegiate',
    host: 'collegiate.quizbowlpackets.com',
    label: 'Collegiate',
    approxSets: 1174,
  },
  {
    id: 'popculture',
    host: 'popculture.quizbowlpackets.com',
    label: 'Pop culture',
    approxSets: 521,
  },
  {
    id: 'ms',
    host: 'ms.quizbowlpackets.com',
    label: 'Middle school',
    approxSets: 36,
  },
];

export const FILE_HOST = 'files.quizbowlpackets.com';

export function archiveById(id: ArchiveId): Archive {
  const found = ARCHIVES.find((a) => a.id === id);
  if (!found) throw new Error(`unknown archive "${id}"`);
  return found;
}

/** Archive difficulty is a 1-4 enum, not the QB Reader 0-10 scale. */
export const SET_DIFFICULTY_LABELS: Record<number, string> = {
  1: 'Novice',
  2: 'Regular',
  3: 'Regular-Plus',
  4: 'Nationals',
};

export interface CatalogueEntry {
  setId: number;
  setName: string;
  /** 1-4 as the archive defines it. 0 when the record omitted it. */
  difficulty: number;
  difficultyLabel: string;
  /** Calendar year, or 0 when absent. */
  year: number;
  subjects: string;
  archive: ArchiveId;
  /** Canonical human-facing page for this set. */
  setPageUrl: string;
}

export function setPageUrl(archive: ArchiveId, setId: number): string {
  return `https://${archiveById(archive).host}/${setId}/`;
}

/**
 * Converts an archive difficulty to the 0-10 scale `Tossup.difficulty` uses.
 *
 * The 1-4 enum is relative to its own archive, so the same "Regular" means
 * something very different in the high school and collegiate catalogues; the
 * archive has to be part of the mapping.
 */
export function toQbDifficulty(archive: ArchiveId, difficulty: number): number {
  const d = difficulty >= 1 && difficulty <= 4 ? difficulty : 2;
  switch (archive) {
    case 'ms':
      return 1;
    case 'popculture':
      return 0;
    case 'collegiate':
      return [6, 7, 8, 9][d - 1] ?? 7;
    case 'hs':
    default:
      return [2, 3, 4, 5][d - 1] ?? 3;
  }
}

// ---------------------------------------------------------------------------
// RSC payload extraction
// ---------------------------------------------------------------------------

/**
 * Reads the JSON string literal that starts at `html[open]`, which must be the
 * opening quote, and returns the decoded value plus the index just past it.
 */
function readJsonString(
  html: string,
  open: number,
): { value: string; end: number } | null {
  if (html[open] !== '"') return null;
  let i = open + 1;
  while (i < html.length) {
    const ch = html[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '"') {
      try {
        return { value: JSON.parse(html.slice(open, i + 1)) as string, end: i + 1 };
      } catch {
        return null;
      }
    }
    i += 1;
  }
  return null;
}

/**
 * Concatenates every `self.__next_f.push([1, "..."])` chunk in document order.
 *
 * The chunks must be joined BEFORE any record is extracted: React splits the
 * flight stream at arbitrary byte boundaries, so a single set record is
 * routinely cut in half across two pushes.
 */
export function extractRscPayload(html: string): string {
  const marker = /self\.__next_f\.push\(\s*\[\s*1\s*,\s*/g;
  let out = '';
  let m: RegExpExecArray | null;

  while ((m = marker.exec(html)) !== null) {
    const at = m.index + m[0].length;
    const str = readJsonString(html, at);
    if (!str) continue;
    out += str.value;
    marker.lastIndex = str.end;
  }

  return out;
}

/** Forward brace matching that ignores braces inside string literals. */
function objectAt(s: string, start: number): string | null {
  let depth = 0;
  let inString = false;

  for (let i = start; i < s.length; i += 1) {
    const ch = s[i];
    if (inString) {
      if (ch === '\\') {
        i += 1;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

interface RawSetRecord {
  set_id?: number;
  set_name?: string;
  difficulty?: number;
  year?: string;
  subjects?: string;
}

/**
 * Enumerates an archive's sets from its homepage HTML.
 *
 * One GET of the homepage yields the entire catalogue, which is precisely why
 * this importer never needs to crawl.
 */
export function parseCatalogue(html: string, archive: ArchiveId): CatalogueEntry[] {
  // Records may appear either in the escaped RSC payload or, for a
  // server-rendered variant, inline. Scan both and dedupe by set id.
  const sources = [extractRscPayload(html), html];
  const byId = new Map<number, CatalogueEntry>();

  for (const source of sources) {
    const key = /"set_id"\s*:/g;
    let m: RegExpExecArray | null;

    while ((m = key.exec(source)) !== null) {
      // `set_id` is the first key of the record, so the nearest preceding
      // brace opens it. Bail out if a `}` intervenes, which would mean we
      // latched onto a different object.
      const brace = source.lastIndexOf('{', m.index);
      if (brace === -1) continue;
      if (source.slice(brace, m.index).includes('}')) continue;

      const text = objectAt(source, brace);
      if (!text) continue;

      let raw: RawSetRecord;
      try {
        raw = JSON.parse(text) as RawSetRecord;
      } catch {
        continue;
      }

      const setId = raw.set_id;
      const setName = raw.set_name;
      if (typeof setId !== 'number' || typeof setName !== 'string') continue;
      if (byId.has(setId)) continue;

      const difficulty =
        typeof raw.difficulty === 'number' ? raw.difficulty : 0;

      // Take the year from the leading digits of the ISO string rather than
      // constructing a Date: "2014-01-01T00:00:00.000Z" parsed locally and
      // read back with getFullYear() returns 2013 west of UTC.
      const year = Number.parseInt((raw.year ?? '').slice(0, 4), 10);

      byId.set(setId, {
        setId,
        setName,
        difficulty,
        difficultyLabel: SET_DIFFICULTY_LABELS[difficulty] ?? 'Unrated',
        year: Number.isFinite(year) ? year : 0,
        subjects: raw.subjects ?? '',
        archive,
        setPageUrl: setPageUrl(archive, setId),
      });
    }
  }

  return [...byId.values()].sort(
    (a, b) => b.year - a.year || a.setName.localeCompare(b.setName),
  );
}

/** Case-insensitive substring filter over set name and subjects. */
export function searchCatalogue(
  entries: readonly CatalogueEntry[],
  query: string,
): CatalogueEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...entries];
  return entries.filter(
    (e) =>
      e.setName.toLowerCase().includes(q) ||
      e.subjects.toLowerCase().includes(q) ||
      String(e.setId) === q,
  );
}

// ---------------------------------------------------------------------------
// Per-set file lists
// ---------------------------------------------------------------------------

export type PacketFormat = 'docx' | 'pdf' | 'other';

export interface PacketFileRef {
  setId: number;
  /** Decoded filename, e.g. `Round 01.docx`. */
  filename: string;
  url: string;
  format: PacketFormat;
}

function decodeAttr(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&apos;/g, '\u0027')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function formatOf(filename: string): PacketFormat {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.docx')) return 'docx';
  if (lower.endsWith('.pdf')) return 'pdf';
  return 'other';
}

/**
 * Extracts the packet file links from a set page.
 *
 * Set pages are plain server-rendered anchors pointing at the separate file
 * host, so no script execution is involved. Filenames follow no convention
 * across sets (`Round 01.pdf`, `oac-01.pdf`, `Packet 3 - Finals.docx`), which
 * is why the page is parsed rather than the names being predicted.
 */
export function parseSetFiles(html: string, setId: number): PacketFileRef[] {
  const sources = [html, extractRscPayload(html)];
  const byUrl = new Map<string, PacketFileRef>();

  const pattern = new RegExp(
    `https?://${FILE_HOST.replace(/\./g, '\\.')}/[^"'\\\\\\s<>)]+`,
    'g',
  );

  for (const source of sources) {
    for (const match of source.matchAll(pattern)) {
      const url = decodeAttr(match[0]);
      if (byUrl.has(url)) continue;

      let path: string;
      try {
        path = new URL(url).pathname;
      } catch {
        continue;
      }

      const last = path.split('/').filter(Boolean).pop();
      if (!last) continue;

      let filename = last;
      try {
        filename = decodeURIComponent(last);
      } catch {
        // A stray percent sign is not worth discarding the link over.
      }

      const format = formatOf(filename);
      if (format === 'other') continue;

      byUrl.set(url, { setId, filename, url, format });
    }
  }

  return [...byUrl.values()].sort((a, b) =>
    a.filename.localeCompare(b.filename, undefined, { numeric: true }),
  );
}

/**
 * Groups a set's files by round so the UI can offer one row per round with the
 * better format preselected. Modern sets ship both .docx and .pdf per round.
 */
export function groupRounds(
  files: readonly PacketFileRef[],
): { round: string; docx?: PacketFileRef; pdf?: PacketFileRef }[] {
  const byRound = new Map<
    string,
    { round: string; docx?: PacketFileRef; pdf?: PacketFileRef }
  >();

  for (const file of files) {
    const round = file.filename.replace(/\.(docx|pdf)$/i, '');
    const slot = byRound.get(round) ?? { round };
    if (file.format === 'docx') slot.docx = file;
    else if (file.format === 'pdf') slot.pdf = file;
    byRound.set(round, slot);
  }

  return [...byRound.values()].sort((a, b) =>
    a.round.localeCompare(b.round, undefined, { numeric: true }),
  );
}

/** Prefers .docx, which keeps the bold/underline markup a .pdf would lose. */
export function preferredFile(
  files: readonly PacketFileRef[],
): PacketFileRef | null {
  return (
    files.find((f) => f.format === 'docx') ??
    files.find((f) => f.format === 'pdf') ??
    null
  );
}

/**
 * Guesses which grammar a file uses.
 *
 * Ohio Academic Competition packets are structurally unrelated to pyramidal
 * packets, so the importer has to pick a parser before reading. Set 1591 is
 * the only OAC set in the entire archive and names its files `oac-01.pdf`
 * through `oac-18.pdf`; the name test is kept general in case more appear.
 */
export function guessGrammar(opts: {
  filename: string;
  setName?: string;
}): 'standard' | 'oac' {
  const haystack = `${opts.filename} ${opts.setName ?? ''}`.toLowerCase();
  if (/\boac\b|\boac-|ohio academic/.test(haystack)) return 'oac';
  return 'standard';
}
