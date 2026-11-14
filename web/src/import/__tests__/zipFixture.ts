/**
 * Builds genuine ZIP archives in memory so `docx.ts` is tested against the
 * real binary format rather than a mock.
 *
 * Not a test file; vitest only collects `*.test.ts`.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = CRC_TABLE[(c ^ (bytes[i] ?? 0)) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export interface ZipInput {
  name: string;
  data: string | Uint8Array;
  /** Store uncompressed when false. Exercises both code paths in docx.ts. */
  deflate?: boolean;
}

/** Writes a spec-conformant ZIP archive, CRCs included. */
export async function buildZip(inputs: readonly ZipInput[]): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const input of inputs) {
    const raw =
      typeof input.data === 'string' ? encoder.encode(input.data) : input.data;
    const useDeflate = input.deflate ?? true;
    const body = useDeflate ? await deflateRaw(raw) : raw;
    const method = useDeflate ? 8 : 0;
    const nameBytes = encoder.encode(input.name);
    const crc = crc32(raw);

    const header = new Uint8Array(30 + nameBytes.length);
    const hv = new DataView(header.buffer);
    hv.setUint32(0, 0x04034b50, true);
    hv.setUint16(4, 20, true);
    hv.setUint16(6, 0, true);
    hv.setUint16(8, method, true);
    hv.setUint16(10, 0, true);
    hv.setUint16(12, 0x2821, true);
    hv.setUint32(14, crc, true);
    hv.setUint32(18, body.length, true);
    hv.setUint32(22, raw.length, true);
    hv.setUint16(26, nameBytes.length, true);
    hv.setUint16(28, 0, true);
    header.set(nameBytes, 30);

    const dir = new Uint8Array(46 + nameBytes.length);
    const dv = new DataView(dir.buffer);
    dv.setUint32(0, 0x02014b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 20, true);
    dv.setUint16(8, 0, true);
    dv.setUint16(10, method, true);
    dv.setUint16(12, 0, true);
    dv.setUint16(14, 0x2821, true);
    dv.setUint32(16, crc, true);
    dv.setUint32(20, body.length, true);
    dv.setUint32(24, raw.length, true);
    dv.setUint16(28, nameBytes.length, true);
    dv.setUint16(30, 0, true);
    dv.setUint16(32, 0, true);
    dv.setUint16(34, 0, true);
    dv.setUint16(36, 0, true);
    dv.setUint32(38, 0, true);
    dv.setUint32(42, offset, true);
    dir.set(nameBytes, 46);

    local.push(header, body);
    central.push(dir);
    offset += header.length + body.length;
  }

  const centralSize = central.reduce((n, b) => n + b.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, inputs.length, true);
  ev.setUint16(10, inputs.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const chunks = [...local, ...central, eocd];
  const total = chunks.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const chunk of chunks) {
    out.set(chunk, p);
    p += chunk.length;
  }
  return out;
}

/** Wraps paragraph XML in the document skeleton Word emits. */
export function documentXml(bodyXml: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body>${bodyXml}</w:body>` +
    '</w:document>'
  );
}

/** A run with optional bold/underline. */
export function run(
  text: string,
  opts: { bold?: boolean; underline?: boolean } = {},
): string {
  const props: string[] = [];
  if (opts.bold) props.push('<w:b/>');
  if (opts.underline) props.push('<w:u w:val="single"/>');
  const rPr = props.length > 0 ? `<w:rPr>${props.join('')}</w:rPr>` : '';
  return `<w:r>${rPr}<w:t xml:space="preserve">${text}</w:t></w:r>`;
}

export function para(...runs: string[]): string {
  return `<w:p>${runs.join('')}</w:p>`;
}

/** Builds a .docx whose body is the given paragraph XML. */
export function buildDocx(
  bodyXml: string,
  opts: { deflate?: boolean } = {},
): Promise<Uint8Array> {
  return buildZip([
    {
      name: '[Content_Types].xml',
      data: '<?xml version="1.0"?><Types/>',
      deflate: opts.deflate ?? true,
    },
    {
      name: 'word/document.xml',
      data: documentXml(bodyXml),
      deflate: opts.deflate ?? true,
    },
  ]);
}
