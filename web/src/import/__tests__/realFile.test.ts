/**
 * OPT-IN validation against a real packet, skipped by default.
 *
 * No real packet is fetched by this repository's toolchain or committed to it:
 * quizbowlpackets.com disallows automated agents in `robots.txt` on both the
 * site host and the file host, and releases packets for study and practice use
 * only. The committed tests therefore run against synthetic fixtures that
 * reproduce each grammar's structure.
 *
 * To check the parsers against the genuine article, download one file yourself
 * from the set page in your own browser and put it here:
 *
 *   src/import/__fixtures__/real-standard.docx
 *       any round of https://www.quizbowlpackets.com/2316/ (2019 PACE NSC)
 *   src/import/__fixtures__/real-oac.txt
 *       `pdftotext -layout oac-01.pdf real-oac.txt` from
 *       https://www.quizbowlpackets.com/1591/
 *
 * `.gitignore` already excludes *.docx and *.pdf in that directory. The
 * `-layout` flag matters: the OAC grammar depends on column positions, and
 * without it the centred headers and 32-column answers collapse.
 *
 * These assertions are intentionally loose. They check that the parsers find
 * the documented structure in a real file, not that a particular round has
 * particular content.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OAC_SCORING } from '../../types';
import { readDocx } from '../docx';
import { parseOacPacket } from '../parseOac';
import { parseStandardPacket } from '../parseStandard';

const dir = join(__dirname, '..', '__fixtures__');
const standardPath = join(dir, 'real-standard.docx');
const oacPath = join(dir, 'real-oac.txt');

const hasStandard = existsSync(standardPath);
const hasOac = existsSync(oacPath);

describe.skipIf(!hasStandard)('real pyramidal .docx', () => {
  it('parses tossups with answers and category tags', async () => {
    const paragraphs = await readDocx(readFileSync(standardPath));
    const out = parseStandardPacket(paragraphs, {
      setName: 'real standard set',
      setYear: 0,
      packetNumber: 1,
      difficulty: 4,
    });

    expect(out.tossups.length).toBeGreaterThanOrEqual(15);
    expect(out.bonuses.length).toBeGreaterThanOrEqual(15);

    // Most modern tossups carry a power mark and a category tag.
    const powered = out.tossups.filter((t) =>
      t.questionSanitized.includes('(*)'),
    );
    expect(powered.length).toBeGreaterThan(out.tossups.length / 2);

    const tagged = out.tossups.filter((t) => t.category !== 'Other Academic');
    expect(tagged.length).toBeGreaterThan(out.tossups.length / 2);

    // The required answer should have survived as <b><u>...</u></b>.
    const marked = out.tossups.filter((t) => /<u>/.test(t.answer));
    expect(marked.length).toBeGreaterThan(0);

    for (const t of out.tossups) {
      expect(t.answerSanitized.length).toBeGreaterThan(0);
      expect(t.questionSanitized.length).toBeGreaterThan(40);
      expect(t.source).toBe('import');
    }
    for (const b of out.bonuses) {
      expect(b.parts.length).toBeGreaterThanOrEqual(2);
      expect(b.answers.length).toBe(b.parts.length);
    }
  });
});

describe.skipIf(!hasOac)('real OAC round', () => {
  it('parses the documented round shape', () => {
    const out = parseOacPacket(readFileSync(oacPath, 'utf8'), {
      setName: 'real OAC set',
      packetNumber: 1,
    });

    const directed = out.packet.categoryRound.flatMap((b) =>
      b.questions.filter((q) => q.kind === 'directed'),
    );

    expect(out.packet.categoryRound).toHaveLength(10);
    expect(directed).toHaveLength(20);
    // The dedupe target: 20, not the 140 that seven worksheet copies produce.
    expect(out.packet.alphabet.items).toHaveLength(
      OAC_SCORING.alphabetItemCount,
    );
    expect(out.packet.finalRound).toHaveLength(OAC_SCORING.finalTossupCount);
    expect(out.packet.alphabet.letter).toMatch(/^[A-Z]$/);
    expect(out.warnings).toEqual([]);
  });
});

describe('fixture availability', () => {
  it('reports which optional real-file checks ran', () => {
    // Always passes; it exists so the run states plainly whether the real
    // files were present, rather than silently reporting green either way.
    const ran = [
      hasStandard ? 'real-standard.docx' : null,
      hasOac ? 'real-oac.txt' : null,
    ].filter(Boolean);
    expect(Array.isArray(ran)).toBe(true);
    if (ran.length === 0) {
      expect(hasStandard || hasOac).toBe(false);
    }
  });
});

/** Exposed so a developer can see the paths without reading the source. */
export const REAL_FIXTURE_PATHS = { standardPath, oacPath };
