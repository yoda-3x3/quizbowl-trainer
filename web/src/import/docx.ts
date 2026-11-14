/**
 * Minimal .docx reader for the packet importer.
 *
 * A .docx is an ordinary ZIP archive; the body text lives in
 * `word/document.xml`. We read it ourselves rather than adding a zip
 * dependency, because the only compression method Word emits is raw DEFLATE
 * and both the browser and Node expose that through `DecompressionStream`.
 *
 * WHY DOCX AND NOT PDF: in docx the power span and the required portion of an
 * answerline are explicit `<w:b>` / `<w:u>` runs, so we can reconstruct the
 * `<b><u>required</u></b>` markup that `judge()` relies on for typo tolerance.
 * `pdftotext` throws that away and additionally inserts a spurious space after
 * the first underlined letter of an answer line, yielding `ANSWER: A ristotle`.
 * `parseStandard.ts` repairs that, but the markup is gone for good, so we
 * prefer docx whenever a set offers both.
 */

// ---------------------------------------------------------------------------
// Parser input contract, shared with parseStandard.ts
// ---------------------------------------------------------------------------

/**
 * One source paragraph, carrying both representations the parsers need.
 *
 * `html` keeps `<b>` / `<u>` so the answerline markup survives into
 * `Tossup.answer`; `text` is the same content as plain text, which is what the
 * line grammars match against and what lands in `questionSanitized`.
 */
export interface SourceParagraph {
  /** Inline HTML. Only <b> and <u>; all text content is escaped. */
  html: string;
  /** Plain text of the same paragraph. */
  text: string;
}

// ---------------------------------------------------------------------------
// ZIP reading
// ---------------------------------------------------------------------------

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

export interface ZipEntry {
  name: string;
  /** 0 = stored, 8 = deflate. Anything else we refuse. */
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

export class DocxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocxError';
  }
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/**
 * Locates the End Of Central Directory record. It sits at the very end of the
 * file unless there is a trailing archive comment, which can be up to 64 KiB,
 * so we scan backwards over that window rather than assuming a fixed offset.
 */
function findEocd(bytes: Uint8Array): number {
  const dv = view(bytes);
  const minOffset = Math.max(0, bytes.byteLength - (0xffff + 22));
  for (let i = bytes.byteLength - 22; i >= minOffset; i -= 1) {
    if (dv.getUint32(i, true) === SIG_EOCD) return i;
  }
  throw new DocxError('not a zip archive: no end-of-central-directory record');
}

/** Reads the central directory. Entry order is archive order. */
export function listZipEntries(bytes: Uint8Array): ZipEntry[] {
  const dv = view(bytes);
  const eocd = findEocd(bytes);

  const count = dv.getUint16(eocd + 10, true);
  const dirOffset = dv.getUint32(eocd + 16, true);

  if (dirOffset === 0xffffffff || count === 0xffff) {
    throw new DocxError('ZIP64 archives are not supported');
  }

  const entries: ZipEntry[] = [];
  let p = dirOffset;

  for (let i = 0; i < count; i += 1) {
    if (p + 46 > bytes.byteLength || dv.getUint32(p, true) !== SIG_CENTRAL) {
      throw new DocxError(`corrupt central directory at entry ${i}`);
    }
    const method = dv.getUint16(p + 10, true);
    const compressedSize = dv.getUint32(p + 20, true);
    const uncompressedSize = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localHeaderOffset = dv.getUint32(p + 42, true);

    const name = new TextDecoder('utf-8').decode(
      bytes.subarray(p + 46, p + 46 + nameLen),
    );

    entries.push({
      name,
      method,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    p += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

async function inflateRaw(deflated: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new DocxError(
      'DecompressionStream is unavailable in this runtime, so .docx cannot be read here',
    );
  }
  const stream = new Blob([deflated as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Extracts one entry by exact name. */
export async function readZipEntry(
  bytes: Uint8Array,
  name: string,
): Promise<Uint8Array> {
  const entry = listZipEntries(bytes).find((e) => e.name === name);
  if (!entry) throw new DocxError(`archive has no entry "${name}"`);

  const dv = view(bytes);
  const lh = entry.localHeaderOffset;
  if (dv.getUint32(lh, true) !== SIG_LOCAL) {
    throw new DocxError(`corrupt local header for "${name}"`);
  }
  // The local header repeats the name and carries its own extra field, whose
  // length routinely differs from the central directory copy.
  const nameLen = dv.getUint16(lh + 26, true);
  const extraLen = dv.getUint16(lh + 28, true);
  const dataStart = lh + 30 + nameLen + extraLen;

  // Prefer the central directory size: a streamed local header may carry
  // zeroes and defer the real sizes to a trailing data descriptor.
  let compressedSize = entry.compressedSize;
  if (compressedSize === 0) {
    const localCompressed = dv.getUint32(lh + 18, true);
    compressedSize = localCompressed || bytes.byteLength - dataStart;
  }

  const raw = bytes.subarray(dataStart, dataStart + compressedSize);

  if (entry.method === 0) return raw.slice();
  if (entry.method === 8) return inflateRaw(raw);
  throw new DocxError(
    `entry "${name}" uses unsupported compression method ${entry.method}`,
  );
}

// ---------------------------------------------------------------------------
// WordprocessingML
// ---------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body] ?? whole;
  });
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Is a toggle element such as `<w:b/>` on?
 *
 * Word writes `<w:b/>` for on and `<w:b w:val="0"/>` for off, and an
 * explicitly-off toggle is common inside styled runs, so a bare presence test
 * would report bold text that renders upright.
 */
function toggleOn(rPr: string, tag: string): boolean {
  const m = new RegExp(`<w:${tag}(\\s[^>]*)?/?>`).exec(rPr);
  if (!m) return false;
  const attrs = m[1];
  if (!attrs) return true;
  const val = /w:val="([^"]*)"/.exec(attrs)?.[1];
  if (val === undefined) return true;
  return val !== '0' && val !== 'false' && val !== 'none';
}

/** Returns the substrings of `xml` enclosed by `<tag ...>` ... `</tag>`. */
function blocks(xml: string, tag: string): string[] {
  const out: string[] = [];
  const open = new RegExp(`<${tag}(?:\\s[^>]*)?(/?)>`, 'g');
  const close = `</${tag}>`;

  let m: RegExpExecArray | null;
  while ((m = open.exec(xml)) !== null) {
    if (m[1] === '/') {
      // Self-closing, e.g. an empty <w:p/>.
      out.push('');
      continue;
    }
    const start = m.index + m[0].length;
    const end = xml.indexOf(close, start);
    if (end === -1) break;
    out.push(xml.slice(start, end));
    open.lastIndex = end + close.length;
  }
  return out;
}

interface Run {
  text: string;
  bold: boolean;
  underline: boolean;
}

function runsOf(paragraphXml: string): Run[] {
  const runs: Run[] = [];

  for (const r of blocks(paragraphXml, 'w:r')) {
    // Run properties, when present, are the first child of the run. Reading
    // them from inside the run keeps us clear of the paragraph-mark <w:rPr>
    // that Word nests inside <w:pPr> ahead of any run.
    const rPr = blocks(r, 'w:rPr')[0] ?? '';
    const bold = toggleOn(rPr, 'b');
    const underline = toggleOn(rPr, 'u');

    // Only <w:t> is visible body text. <w:delText> is tracked-change deletion
    // and <w:instrText> is a field code; both must stay out.
    let text = '';
    const tokens = r.matchAll(
      /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>|<w:noBreakHyphen\s*\/>/g,
    );
    for (const t of tokens) {
      if (t[1] !== undefined) text += decodeEntities(t[1]);
      else if (t[0].startsWith('<w:tab')) text += '\t';
      else if (t[0].startsWith('<w:br')) text += ' ';
      else text += '-';
    }

    if (text.length > 0) runs.push({ text, bold, underline });
  }

  return runs;
}

/** Collapses adjacent runs that share formatting, then emits html + text. */
function paragraphFrom(runs: Run[]): SourceParagraph {
  let html = '';
  let text = '';

  for (let i = 0; i < runs.length; ) {
    const run = runs[i];
    if (!run) break;
    let merged = run.text;
    let j = i + 1;
    while (j < runs.length) {
      const next = runs[j];
      if (!next || next.bold !== run.bold || next.underline !== run.underline) {
        break;
      }
      merged += next.text;
      j += 1;
    }

    let piece = escapeHtml(merged);
    if (run.underline) piece = `<u>${piece}</u>`;
    if (run.bold) piece = `<b>${piece}</b>`;
    html += piece;
    text += merged;
    i = j;
  }

  return { html, text };
}

/** Splits `word/document.xml` into paragraphs with bold/underline preserved. */
export function paragraphsFromDocumentXml(xml: string): SourceParagraph[] {
  // Restrict to the body so headers, footnotes and settings cannot leak in.
  const body = blocks(xml, 'w:body')[0] ?? xml;
  return blocks(body, 'w:p').map((p) => paragraphFrom(runsOf(p)));
}

/** Reads a .docx file's body text. */
export async function readDocx(bytes: Uint8Array): Promise<SourceParagraph[]> {
  const xml = new TextDecoder('utf-8').decode(
    await readZipEntry(bytes, 'word/document.xml'),
  );
  return paragraphsFromDocumentXml(xml);
}

/** Wraps plain text (a PDF extraction, say) in the parser input contract. */
export function paragraphsFromText(text: string): SourceParagraph[] {
  return text.split(/\r\n|\r|\n/).map((line) => ({
    html: escapeHtml(line),
    text: line,
  }));
}
