import { describe, expect, it } from 'vitest';
import {
  ARCHIVES,
  archiveById,
  extractRscPayload,
  groupRounds,
  guessGrammar,
  parseCatalogue,
  parseSetFiles,
  preferredFile,
  searchCatalogue,
  setPageUrl,
  toQbDifficulty,
} from '../catalogue';

/**
 * Builds a page whose catalogue is embedded the way Next.js embeds it: each
 * flight chunk is a JSON string literal inside `self.__next_f.push([1, ...])`.
 */
function pageWithChunks(chunks: readonly string[]): string {
  const scripts = chunks
    .map((c) => `<script>self.__next_f.push([1,${JSON.stringify(c)}])</script>`)
    .join('\n');
  return `<!doctype html><html><body><div id="__next"></div>${scripts}</body></html>`;
}

const RECORDS = [
  '{"set_id":1591,"set_name":"2014 Ohio Academic Competition","difficulty":2,"year":"2014-01-01T00:00:00.000Z","subjects":"All-Subject"}',
  '{"set_id":2316,"set_name":"2019 PACE NSC","difficulty":4,"year":"2019-01-01T00:00:00.000Z","subjects":"All-Subject"}',
  '{"set_id":900,"set_name":"2008 Novice Tournament","difficulty":1,"year":"2008-01-01T00:00:00.000Z","subjects":"All-Subject"}',
];

describe('archives', () => {
  it('knows the four sibling archives', () => {
    expect(ARCHIVES.map((a) => a.id)).toEqual([
      'hs',
      'collegiate',
      'popculture',
      'ms',
    ]);
    expect(archiveById('hs').host).toBe('www.quizbowlpackets.com');
  });

  it('builds the canonical set page url', () => {
    expect(setPageUrl('hs', 1591)).toBe('https://www.quizbowlpackets.com/1591/');
    expect(setPageUrl('ms', 7)).toBe('https://ms.quizbowlpackets.com/7/');
  });

  it('throws on an unknown archive rather than guessing', () => {
    // @ts-expect-error deliberately outside the union
    expect(() => archiveById('nope')).toThrow();
  });
});

describe('extractRscPayload', () => {
  it('concatenates the chunks in document order', () => {
    const html = pageWithChunks(['first ', 'second']);
    expect(extractRscPayload(html)).toBe('first second');
  });

  it('unescapes the embedded quotes', () => {
    const html = pageWithChunks(['{"a":"b"}']);
    expect(extractRscPayload(html)).toBe('{"a":"b"}');
  });

  it('returns an empty string when the page has no payload', () => {
    expect(extractRscPayload('<html></html>')).toBe('');
  });
});

describe('parseCatalogue', () => {
  it('enumerates every set from a single page', () => {
    const entries = parseCatalogue(
      pageWithChunks([`[${RECORDS.join(',')}]`]),
      'hs',
    );
    expect(entries.map((e) => e.setId).sort((a, b) => a - b)).toEqual([
      900, 1591, 2316,
    ]);
  });

  /**
   * React splits the flight stream at arbitrary byte boundaries, so a record
   * is routinely cut in half. Chunks must be joined before any record is read.
   */
  it('recovers a record split across two chunks', () => {
    const joined = `[${RECORDS.join(',')}]`;
    const cut = Math.floor(joined.length / 2);
    const entries = parseCatalogue(
      pageWithChunks([joined.slice(0, cut), joined.slice(cut)]),
      'hs',
    );
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.setName)).toContain('2019 PACE NSC');
  });

  it('reads the fields off each record', () => {
    const entries = parseCatalogue(pageWithChunks([RECORDS[0]!]), 'hs');
    expect(entries[0]).toMatchObject({
      setId: 1591,
      setName: '2014 Ohio Academic Competition',
      difficulty: 2,
      difficultyLabel: 'Regular',
      year: 2014,
      subjects: 'All-Subject',
      archive: 'hs',
      setPageUrl: 'https://www.quizbowlpackets.com/1591/',
    });
  });

  it('takes the year from the ISO string without timezone drift', () => {
    // Constructing a Date from "2014-01-01T00:00:00.000Z" and reading
    // getFullYear() west of UTC yields 2013.
    const entries = parseCatalogue(pageWithChunks([RECORDS[0]!]), 'hs');
    expect(entries[0]?.year).toBe(2014);
  });

  it('sorts newest first', () => {
    const entries = parseCatalogue(
      pageWithChunks([`[${RECORDS.join(',')}]`]),
      'hs',
    );
    expect(entries.map((e) => e.year)).toEqual([2019, 2014, 2008]);
  });

  it('dedupes a set that appears in more than one chunk', () => {
    const entries = parseCatalogue(
      pageWithChunks([RECORDS[0]!, RECORDS[0]!]),
      'hs',
    );
    expect(entries).toHaveLength(1);
  });

  it('labels an unrated difficulty rather than dropping the set', () => {
    const entries = parseCatalogue(
      pageWithChunks(['{"set_id":5,"set_name":"Mystery Set"}']),
      'hs',
    );
    expect(entries[0]?.difficultyLabel).toBe('Unrated');
    expect(entries[0]?.year).toBe(0);
  });

  it('ignores malformed records instead of throwing', () => {
    const entries = parseCatalogue(
      pageWithChunks([`{"set_id":"not a number"},${RECORDS[1]!}`]),
      'hs',
    );
    expect(entries.map((e) => e.setId)).toEqual([2316]);
  });

  it('returns nothing for a page with no catalogue', () => {
    expect(parseCatalogue('<html>nothing here</html>', 'hs')).toEqual([]);
  });
});

describe('toQbDifficulty', () => {
  it('maps the 1-4 archive enum onto the 0-10 scale per archive', () => {
    expect(toQbDifficulty('hs', 1)).toBe(2);
    expect(toQbDifficulty('hs', 4)).toBe(5);
    // "Regular" means something very different in the collegiate archive.
    expect(toQbDifficulty('collegiate', 2)).toBe(7);
    expect(toQbDifficulty('ms', 3)).toBe(1);
    expect(toQbDifficulty('popculture', 2)).toBe(0);
  });

  it('falls back sanely on a missing difficulty', () => {
    expect(toQbDifficulty('hs', 0)).toBe(3);
  });
});

describe('searchCatalogue', () => {
  const entries = parseCatalogue(
    pageWithChunks([`[${RECORDS.join(',')}]`]),
    'hs',
  );

  it('matches on name, case insensitively', () => {
    expect(searchCatalogue(entries, 'pace').map((e) => e.setId)).toEqual([2316]);
  });

  it('matches on set id', () => {
    expect(searchCatalogue(entries, '1591').map((e) => e.setId)).toEqual([1591]);
  });

  it('returns everything for an empty query', () => {
    expect(searchCatalogue(entries, '  ')).toHaveLength(3);
  });
});

describe('parseSetFiles', () => {
  const setPage = `
    <h1>2019 PACE NSC</h1>
    <ul>
      <li><a href="https://files.quizbowlpackets.com/2316/Round%2001.docx">Round 01.docx</a></li>
      <li><a href="https://files.quizbowlpackets.com/2316/Round%2001.pdf">Round 01.pdf</a></li>
      <li><a href="https://files.quizbowlpackets.com/2316/Round%2002.docx">Round 02.docx</a></li>
      <li><a href="/2316/">permalink</a></li>
      <li><a href="https://example.com/evil.docx">not the file host</a></li>
    </ul>`;

  it('finds the file links and decodes the filenames', () => {
    const files = parseSetFiles(setPage, 2316);
    expect(files.map((f) => f.filename)).toEqual([
      'Round 01.docx',
      'Round 01.pdf',
      'Round 02.docx',
    ]);
  });

  it('refuses links outside the file host', () => {
    const files = parseSetFiles(setPage, 2316);
    expect(files.every((f) => f.url.includes('files.quizbowlpackets.com'))).toBe(
      true,
    );
  });

  it('tags the format', () => {
    const files = parseSetFiles(setPage, 2316);
    expect(files[0]?.format).toBe('docx');
    expect(files[1]?.format).toBe('pdf');
  });

  it('handles the OAC naming, which follows no convention', () => {
    const page =
      '<a href="https://files.quizbowlpackets.com/1591/oac-01.pdf">oac-01.pdf</a>' +
      '<a href="https://files.quizbowlpackets.com/1591/oac-18.pdf">oac-18.pdf</a>';
    const files = parseSetFiles(page, 1591);
    expect(files.map((f) => f.filename)).toEqual(['oac-01.pdf', 'oac-18.pdf']);
  });

  it('dedupes a link that appears twice on the page', () => {
    const page =
      '<a href="https://files.quizbowlpackets.com/1/a.pdf">x</a>' +
      '<a href="https://files.quizbowlpackets.com/1/a.pdf">y</a>';
    expect(parseSetFiles(page, 1)).toHaveLength(1);
  });

  it('sorts rounds numerically rather than lexically', () => {
    const page = [2, 10, 1]
      .map(
        (n) =>
          `<a href="https://files.quizbowlpackets.com/1/Round%20${n}.pdf">r</a>`,
      )
      .join('');
    expect(parseSetFiles(page, 1).map((f) => f.filename)).toEqual([
      'Round 1.pdf',
      'Round 2.pdf',
      'Round 10.pdf',
    ]);
  });

  it('groups a round that ships in both formats', () => {
    const rounds = groupRounds(parseSetFiles(setPage, 2316));
    expect(rounds).toHaveLength(2);
    expect(rounds[0]?.round).toBe('Round 01');
    expect(rounds[0]?.docx?.format).toBe('docx');
    expect(rounds[0]?.pdf?.format).toBe('pdf');
    expect(rounds[1]?.pdf).toBeUndefined();
  });
});

describe('preferredFile', () => {
  it('prefers docx, which keeps the markup a pdf would lose', () => {
    const files = parseSetFiles(
      '<a href="https://files.quizbowlpackets.com/1/a.pdf">a</a>' +
        '<a href="https://files.quizbowlpackets.com/1/a.docx">a</a>',
      1,
    );
    expect(preferredFile(files)?.format).toBe('docx');
  });

  it('falls back to pdf when that is all there is', () => {
    const files = parseSetFiles(
      '<a href="https://files.quizbowlpackets.com/1591/oac-01.pdf">a</a>',
      1591,
    );
    expect(preferredFile(files)?.format).toBe('pdf');
  });

  it('returns null for an empty list', () => {
    expect(preferredFile([])).toBeNull();
  });
});

describe('guessGrammar', () => {
  it('routes the OAC filenames to the OAC parser', () => {
    expect(guessGrammar({ filename: 'oac-01.pdf' })).toBe('oac');
    expect(
      guessGrammar({
        filename: 'Round 1.pdf',
        setName: '2014 Ohio Academic Competition',
      }),
    ).toBe('oac');
  });

  it('routes everything else to the standard parser', () => {
    expect(
      guessGrammar({ filename: 'Round 01.docx', setName: '2019 PACE NSC' }),
    ).toBe('standard');
  });
});
