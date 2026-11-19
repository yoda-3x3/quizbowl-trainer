/**
 * Packet importer screen.
 *
 * Deliberately plain, in the same spirit as `Rooms.tsx`: Card A owns the
 * visual system, and this screen should adopt its primitives once they land.
 * What matters here is the flow and the constraints it enforces.
 *
 * THE FLOW IS USER-INITIATED FROM END TO END. There is no catalogue sitting in
 * the bundle, nothing is prefetched, and no request happens on mount. The user
 * either hands us a file they already downloaded (the preferred route, which
 * never touches the archive) or pastes one set page and taps one round.
 *
 * quizbowlpackets.com disallows automated agents in `robots.txt` on both its
 * site host and its file host and releases packets for study and practice use
 * only, so the "fetch" route is strictly one file per tap, cached on the
 * device, never redistributed. See `fetchPacket.ts` for the guards.
 */

import { useCallback, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Bonus, OacPacket, Tossup } from '../types';
import {
  guessGrammar,
  groupRounds,
  parseSetFiles,
  toQbDifficulty,
  type ArchiveId,
  type PacketFileRef,
} from '../import/catalogue';
import { paragraphsFromText, readDocx } from '../import/docx';
import {
  ImportError,
  fetchArchivePage,
  fetchPacketFile,
  idbPacketCache,
  importLocalFile,
  userGesture,
  type CachedPacket,
} from '../import/fetchPacket';
import { parseOacPacket } from '../import/parseOac';
import { parseStandardPacket } from '../import/parseStandard';
import { uploadServerPacket } from '../packets';

export interface ImportResult {
  kind: 'standard' | 'oac';
  filename: string;
  tossups: Tossup[];
  bonuses: Bonus[];
  oac: OacPacket | null;
  warnings: string[];
}

export interface ImportProps {
  /** Called once the user confirms an import. */
  onImported?(result: ImportResult): void;
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // "%PDF"
const ZIP_MAGIC = [0x50, 0x4b]; // "PK"

function sniff(bytes: Uint8Array): 'docx' | 'pdf' | 'text' {
  if (ZIP_MAGIC.every((b, i) => bytes[i] === b)) return 'docx';
  if (PDF_MAGIC.every((b, i) => bytes[i] === b)) return 'pdf';
  return 'text';
}

function roundNumberOf(filename: string): number {
  const m = /(\d+)/.exec(filename);
  const n = Number.parseInt(m?.[1] ?? '', 10);
  return Number.isFinite(n) ? n : 1;
}

export default function Import({ onImported }: ImportProps) {
  const cache = useMemo(() => idbPacketCache(), []);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const [setPageInput, setSetPageInput] = useState('');
  const [files, setFiles] = useState<PacketFileRef[]>([]);
  const [setName, setSetName] = useState('');
  const [archive, setArchive] = useState<ArchiveId>('hs');
  const [difficulty, setDifficulty] = useState(2);

  const [pastedText, setPastedText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [uploadStatus, setUploadStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'uploading' }
    | { kind: 'uploaded'; id: string }
    | { kind: 'failed'; message: string }
  >({ kind: 'idle' });

  const fail = useCallback((e: unknown) => {
    setError(
      e instanceof ImportError || e instanceof Error
        ? e.message
        : 'Something went wrong reading that packet.',
    );
  }, []);

  // -------------------------------------------------------------------------
  // Parsing
  // -------------------------------------------------------------------------

  const parse = useCallback(
    async (
      packet: CachedPacket,
      opts: { setNameHint: string; archiveHint: ArchiveId; difficultyHint: number },
    ): Promise<ImportResult> => {
      const kind = guessGrammar({
        filename: packet.filename,
        setName: opts.setNameHint,
      });
      const format = sniff(packet.bytes);
      const name = opts.setNameHint.trim() || packet.filename;
      const packetNumber = roundNumberOf(packet.filename);

      if (format === 'pdf') {
        throw new ImportError(
          'unsupported-format',
          'This build cannot read a PDF directly. Open the PDF, copy its text, ' +
            'and paste it into the box below. For a .docx the file is read as is.',
        );
      }

      if (kind === 'oac') {
        const text =
          format === 'docx'
            ? (await readDocx(packet.bytes)).map((p) => p.text).join('\n')
            : new TextDecoder().decode(packet.bytes);
        const { packet: oac, warnings } = parseOacPacket(text, {
          setName: name,
          packetNumber,
        });
        return {
          kind: 'oac',
          filename: packet.filename,
          tossups: [],
          bonuses: [],
          oac,
          warnings,
        };
      }

      const paragraphs =
        format === 'docx'
          ? await readDocx(packet.bytes)
          : paragraphsFromText(new TextDecoder().decode(packet.bytes));

      const { tossups, bonuses } = parseStandardPacket(
        paragraphs,
        {
          setName: name,
          setYear: 0,
          packetNumber,
          difficulty: toQbDifficulty(opts.archiveHint, opts.difficultyHint),
        },
        // Only a text source can carry the pdftotext spacing damage.
        { repairPdfSpacing: format === 'text' },
      );

      const warnings: string[] = [];
      if (tossups.length === 0) {
        warnings.push('No tossups were found. Is this a packet file?');
      }
      if (format === 'text') {
        warnings.push(
          'Read from plain text, so the bold and underline markup that improves ' +
            'typo tolerance is not available. A .docx keeps it.',
        );
      }

      return {
        kind: 'standard',
        filename: packet.filename,
        tossups,
        bonuses,
        oac: null,
        warnings,
      };
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Route 1: a file the user already has. No network at all.
  // -------------------------------------------------------------------------

  const onPickFile = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      setResult(null); setUploadStatus({ kind: 'idle' });
      try {
        const packet = await importLocalFile(file);
        setResult(
          await parse(packet, {
            setNameHint: setName,
            archiveHint: archive,
            difficultyHint: difficulty,
          }),
        );
      } catch (e) {
        fail(e);
      } finally {
        setBusy(false);
      }
    },
    [archive, difficulty, fail, parse, setName],
  );

  // -------------------------------------------------------------------------
  // Route 2: pasted text, for PDF sources.
  // -------------------------------------------------------------------------

  const onParsePasted = useCallback(async () => {
    setBusy(true);
    setError(null);
    setResult(null); setUploadStatus({ kind: 'idle' });
    try {
      const bytes = new TextEncoder().encode(pastedText);
      setResult(
        await parse(
          {
            url: 'local:pasted',
            filename: setName.trim() || 'pasted text',
            bytes,
            contentType: 'text/plain',
            fetchedAt: Date.now(),
          },
          {
            setNameHint: setName,
            archiveHint: archive,
            difficultyHint: difficulty,
          },
        ),
      );
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }, [archive, difficulty, fail, parse, pastedText, setName]);

  // -------------------------------------------------------------------------
  // Route 3: one set page, then one round. Each step is a separate tap.
  // -------------------------------------------------------------------------

  const onLoadSetPage = useCallback(async () => {
    setBusy(true);
    setError(null);
    setFiles([]);
    try {
      const url = setPageInput.trim();
      const html = await fetchArchivePage(
        { url, gesture: userGesture() },
        { cache },
      );
      const setId = Number.parseInt(
        new URL(url).pathname.split('/').filter(Boolean)[0] ?? '0',
        10,
      );
      const found = parseSetFiles(html, Number.isFinite(setId) ? setId : 0);
      setFiles(found);
      if (found.length === 0) {
        setError('No packet files were listed on that page.');
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }, [cache, fail, setPageInput]);

  const onFetchRound = useCallback(
    async (file: PacketFileRef) => {
      setBusy(true);
      setError(null);
      setResult(null); setUploadStatus({ kind: 'idle' });
      try {
        const packet = await fetchPacketFile(
          { url: file.url, filename: file.filename, gesture: userGesture() },
          { cache },
        );
        setResult(
          await parse(packet, {
            setNameHint: setName,
            archiveHint: archive,
            difficultyHint: difficulty,
          }),
        );
      } catch (e) {
        fail(e);
      } finally {
        setBusy(false);
      }
    },
    [archive, cache, difficulty, fail, parse, setName],
  );

  const rounds = useMemo(() => groupRounds(files), [files]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div style={S.wrap}>
      <h2 style={S.h2}>Import a packet</h2>
      <p style={S.hint}>
        Packets come from quizbowlpackets.com, which releases them for study and
        practice. One file at a time, kept on this device, never shared.
      </p>

      <section style={S.panel}>
        <h3 style={S.h3}>About this packet</h3>
        <div style={S.row}>
          <label style={S.label}>
            set name
            <input
              style={S.input}
              value={setName}
              onChange={(e) => setSetName(e.target.value)}
              placeholder="2019 PACE NSC"
            />
          </label>
          <label style={S.label}>
            archive
            <select
              style={S.input}
              value={archive}
              onChange={(e) => setArchive(e.target.value as ArchiveId)}
            >
              <option value="hs">High school</option>
              <option value="collegiate">Collegiate</option>
              <option value="ms">Middle school</option>
              <option value="popculture">Pop culture</option>
            </select>
          </label>
          <label style={S.label}>
            level
            <select
              style={S.input}
              value={difficulty}
              onChange={(e) => setDifficulty(Number(e.target.value))}
            >
              <option value={1}>Novice</option>
              <option value={2}>Regular</option>
              <option value={3}>Regular-Plus</option>
              <option value={4}>Nationals</option>
            </select>
          </label>
        </div>
      </section>

      <section style={S.panel}>
        <h3 style={S.h3}>Choose a file</h3>
        <p style={S.hint}>
          The simplest route. Download a round from the set page in your browser,
          then pick it here. A .docx keeps the bold and underline marks that make
          answer checking more forgiving, so prefer it over a .pdf.
        </p>
        <input
          ref={fileInput}
          type="file"
          accept=".docx,.txt,text/plain"
          style={S.file}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onPickFile(file);
          }}
        />
      </section>

      <section style={S.panel}>
        <h3 style={S.h3}>Paste text from a PDF</h3>
        <p style={S.hint}>
          Older sets, including the Ohio Academic Competition rounds, are PDF
          only. Open the PDF, select all, and paste here. Keep the line breaks:
          the OAC grammar reads the column layout.
        </p>
        <textarea
          style={S.textarea}
          value={pastedText}
          onChange={(e) => setPastedText(e.target.value)}
          rows={6}
          placeholder="ANSWER: ..."
        />
        <button
          style={S.button}
          disabled={busy || pastedText.trim().length === 0}
          onClick={() => void onParsePasted()}
        >
          Parse pasted text
        </button>
      </section>

      <section style={S.panel}>
        <h3 style={S.h3}>Fetch one round</h3>
        <p style={S.hint}>
          Paste a set page address, such as
          https://www.quizbowlpackets.com/2316/. We read that one page, list its
          rounds, and fetch only the round you tap. If your browser blocks the
          request, use "Choose a file" instead.
        </p>
        <div style={S.row}>
          <input
            style={{ ...S.input, flex: 1 }}
            value={setPageInput}
            onChange={(e) => setSetPageInput(e.target.value)}
            placeholder="https://www.quizbowlpackets.com/2316/"
          />
          <button
            style={S.button}
            disabled={busy || setPageInput.trim().length === 0}
            onClick={() => void onLoadSetPage()}
          >
            List rounds
          </button>
        </div>

        {rounds.length > 0 && (
          <ul style={S.list}>
            {rounds.map((round) => {
              const pick = round.docx ?? round.pdf;
              if (!pick) return null;
              return (
                <li key={round.round} style={S.listItem}>
                  <span>{round.round}</span>
                  <span style={S.formats}>
                    {round.docx ? 'docx' : ''}
                    {round.docx && round.pdf ? ' + ' : ''}
                    {round.pdf ? 'pdf' : ''}
                  </span>
                  <button
                    style={S.buttonSmall}
                    disabled={busy}
                    onClick={() => void onFetchRound(pick)}
                  >
                    Import
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {busy && <p style={S.hint}>Working...</p>}
      {error && <p style={S.error}>{error}</p>}

      {result && (
        <section style={S.panel}>
          <h3 style={S.h3}>{result.filename}</h3>
          {result.kind === 'oac' && result.oac ? (
            <ul style={S.summary}>
              <li>
                {result.oac.categoryRound.length} category blocks,{' '}
                {result.oac.categoryRound.length * 2} directed questions
              </li>
              <li>
                alphabet round, letter {result.oac.alphabet.letter || '?'},{' '}
                {result.oac.alphabet.items.length} items
              </li>
              <li>{result.oac.finalRound.length} final-round tossups</li>
            </ul>
          ) : (
            <ul style={S.summary}>
              <li>{result.tossups.length} tossups</li>
              <li>{result.bonuses.length} bonuses</li>
              <li>
                {
                  result.tossups.filter((t) =>
                    t.questionSanitized.includes('(*)'),
                  ).length
                }{' '}
                with a power mark
              </li>
            </ul>
          )}

          {result.warnings.length > 0 && (
            <ul style={S.warnings}>
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}

          <button
            style={S.button}
            disabled={uploadStatus.kind === 'uploading'}
            onClick={() => {
              onImported?.(result);
              // Share the packet with every other device by uploading it to
              // the server. The parse stays on the host for the local queue
              // regardless of the upload outcome.
              setUploadStatus({ kind: 'uploading' });
              void uploadServerPacket(
                (setName.trim() || result.filename).slice(0, 200),
                {
                  kind: result.kind,
                  filename: result.filename,
                  tossups: result.tossups,
                  bonuses: result.bonuses,
                  oac: result.oac,
                  warnings: result.warnings,
                },
              )
                .then((id) => setUploadStatus({ kind: 'uploaded', id }))
                .catch((err: unknown) =>
                  setUploadStatus({
                    kind: 'failed',
                    message:
                      err instanceof Error
                        ? err.message
                        : 'upload failed',
                  }),
                );
            }}
          >
            Add to my questions
          </button>

          {uploadStatus.kind === 'uploading' && (
            <p style={S.hint}>Uploading packet to the server...</p>
          )}
          {uploadStatus.kind === 'uploaded' && (
            <p style={S.hint}>
              Uploaded. Other devices will see this packet in their Server
              packets list.
            </p>
          )}
          {uploadStatus.kind === 'failed' && (
            <p style={S.error}>
              Saved locally, but the server upload failed ({uploadStatus.message}).
              Other devices will not see this packet.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  wrap: { padding: 16, maxWidth: 760, margin: '0 auto' },
  h2: { margin: '0 0 4px', fontSize: 20 },
  h3: { margin: '0 0 8px', fontSize: 15, color: 'var(--ink)' },
  hint: {
    margin: '0 0 12px',
    color: 'var(--ink-soft)',
    fontSize: 13,
    lineHeight: 1.5,
  },
  panel: {
    background: 'var(--panel)',
    border: '1px solid var(--line)',
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
  },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    fontSize: 12,
    color: 'var(--ink-soft)',
  },
  input: {
    background: 'var(--panel-2)',
    color: 'var(--ink)',
    border: '1px solid var(--line)',
    borderRadius: 6,
    padding: '8px 10px',
    minWidth: 140,
  },
  textarea: {
    width: '100%',
    background: 'var(--panel-2)',
    color: 'var(--ink)',
    border: '1px solid var(--line)',
    borderRadius: 6,
    padding: 10,
    fontFamily: 'var(--font-read)',
    fontSize: 13,
    marginBottom: 10,
    resize: 'vertical',
  },
  file: { color: 'var(--ink-soft)', fontSize: 13 },
  button: {
    background: 'var(--accent)',
    color: '#0b1016',
    border: 'none',
    borderRadius: 6,
    padding: '8px 14px',
    fontWeight: 600,
  },
  buttonSmall: {
    background: 'var(--panel-2)',
    color: 'var(--ink)',
    border: '1px solid var(--line)',
    borderRadius: 6,
    padding: '5px 10px',
    fontSize: 12,
  },
  list: { listStyle: 'none', padding: 0, margin: '12px 0 0' },
  listItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    justifyContent: 'space-between',
    padding: '7px 0',
    borderTop: '1px solid var(--line)',
    fontSize: 13,
  },
  formats: { color: 'var(--ink-soft)', fontSize: 12 },
  summary: { margin: '0 0 10px', paddingLeft: 18, fontSize: 13, lineHeight: 1.6 },
  warnings: {
    margin: '0 0 10px',
    paddingLeft: 18,
    fontSize: 12,
    color: 'var(--gold)',
    lineHeight: 1.5,
  },
  error: { color: 'var(--bad)', fontSize: 13 },
};
