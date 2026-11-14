import { describe, expect, it } from 'vitest';
import {
  DocxError,
  escapeHtml,
  listZipEntries,
  paragraphsFromDocumentXml,
  paragraphsFromText,
  readDocx,
  readZipEntry,
} from '../docx';
import { buildDocx, buildZip, documentXml, para, run } from './zipFixture';

describe('zip reading', () => {
  it('lists the central directory', async () => {
    const bytes = await buildZip([
      { name: 'a.txt', data: 'alpha' },
      { name: 'word/document.xml', data: documentXml(para(run('hi'))) },
    ]);
    const entries = listZipEntries(bytes);
    expect(entries.map((e) => e.name)).toEqual(['a.txt', 'word/document.xml']);
    expect(entries[0]?.method).toBe(8);
  });

  it('round-trips a deflated entry', async () => {
    // Long enough that DEFLATE genuinely compresses rather than storing.
    const payload = 'quizbowl '.repeat(400);
    const bytes = await buildZip([{ name: 'big.txt', data: payload }]);
    const out = await readZipEntry(bytes, 'big.txt');
    expect(new TextDecoder().decode(out)).toBe(payload);
  });

  it('round-trips a stored entry', async () => {
    const bytes = await buildZip([
      { name: 'plain.txt', data: 'no compression', deflate: false },
    ]);
    const out = await readZipEntry(bytes, 'plain.txt');
    expect(new TextDecoder().decode(out)).toBe('no compression');
  });

  it('finds the directory even behind a trailing archive comment', async () => {
    const base = await buildZip([{ name: 'a.txt', data: 'alpha' }]);
    // Append a comment and record its length in the EOCD, as a zip writer
    // with a comment would.
    const comment = new TextEncoder().encode('a trailing comment');
    const padded = new Uint8Array(base.length + comment.length);
    padded.set(base, 0);
    padded.set(comment, base.length);
    new DataView(padded.buffer).setUint16(
      base.length - 2,
      comment.length,
      true,
    );
    expect(listZipEntries(padded).map((e) => e.name)).toEqual(['a.txt']);
  });

  it('rejects a non-zip with a clear error', async () => {
    const junk = new Uint8Array(100).fill(7);
    expect(() => listZipEntries(junk)).toThrow(DocxError);
  });

  it('names the missing entry when it is absent', async () => {
    const bytes = await buildZip([{ name: 'a.txt', data: 'alpha' }]);
    await expect(readZipEntry(bytes, 'word/document.xml')).rejects.toThrow(
      /word\/document\.xml/,
    );
  });
});

describe('WordprocessingML runs', () => {
  it('emits bold and underline as <b> and <u>', () => {
    const out = paragraphsFromDocumentXml(
      documentXml(
        para(
          run('ANSWER: '),
          run('Diana', { bold: true, underline: true }),
          run(' [prompt on '),
          run('Artemis', { underline: true }),
          run(']'),
        ),
      ),
    );
    expect(out[0]?.html).toBe(
      'ANSWER: <b><u>Diana</u></b> [prompt on <u>Artemis</u>]',
    );
    expect(out[0]?.text).toBe('ANSWER: Diana [prompt on Artemis]');
  });

  it('treats an explicitly-off toggle as off', () => {
    // Word writes <w:b w:val="0"/> inside runs that inherit bold from a style.
    const xml = documentXml(
      '<w:p><w:r><w:rPr><w:b w:val="0"/></w:rPr><w:t>upright</w:t></w:r></w:p>',
    );
    expect(paragraphsFromDocumentXml(xml)[0]?.html).toBe('upright');
  });

  it('treats <w:u w:val="none"/> as not underlined', () => {
    const xml = documentXml(
      '<w:p><w:r><w:rPr><w:u w:val="none"/></w:rPr><w:t>flat</w:t></w:r></w:p>',
    );
    expect(paragraphsFromDocumentXml(xml)[0]?.html).toBe('flat');
  });

  it('does not inherit the paragraph-mark run properties', () => {
    // <w:pPr><w:rPr> styles the paragraph mark, not the text. Reading it would
    // bold entire questions and make the answer markup useless.
    const xml = documentXml(
      '<w:p><w:pPr><w:rPr><w:b/><w:u w:val="single"/></w:rPr></w:pPr>' +
        '<w:r><w:t>plain text</w:t></w:r></w:p>',
    );
    expect(paragraphsFromDocumentXml(xml)[0]?.html).toBe('plain text');
  });

  it('merges adjacent runs that share formatting', () => {
    const xml = documentXml(
      para(run('Salvador ', { bold: true }), run('Dali', { bold: true })),
    );
    expect(paragraphsFromDocumentXml(xml)[0]?.html).toBe('<b>Salvador Dali</b>');
  });

  it('decodes entities and re-escapes them for the html field', () => {
    const xml = documentXml(para(run('Sturm &amp; Drang &lt;tag&gt;')));
    const out = paragraphsFromDocumentXml(xml)[0];
    expect(out?.text).toBe('Sturm & Drang <tag>');
    expect(out?.html).toBe('Sturm &amp; Drang &lt;tag&gt;');
  });

  it('decodes numeric character references', () => {
    const xml = documentXml(para(run('caf&#233; &#x2014; fin')));
    expect(paragraphsFromDocumentXml(xml)[0]?.text).toBe('café — fin');
  });

  it('ignores tracked-change deletions and field codes', () => {
    const xml = documentXml(
      '<w:p>' +
        '<w:r><w:t>kept </w:t></w:r>' +
        '<w:del><w:r><w:delText>deleted </w:delText></w:r></w:del>' +
        '<w:r><w:instrText>PAGE</w:instrText></w:r>' +
        '<w:r><w:t>text</w:t></w:r>' +
        '</w:p>',
    );
    expect(paragraphsFromDocumentXml(xml)[0]?.text).toBe('kept text');
  });

  it('turns a tab into a tab and a break into a space', () => {
    const xml = documentXml(
      '<w:p><w:r><w:t>a</w:t><w:tab/><w:t>b</w:t><w:br/><w:t>c</w:t></w:r></w:p>',
    );
    expect(paragraphsFromDocumentXml(xml)[0]?.text).toBe('a\tb c');
  });

  it('keeps an empty paragraph as an empty entry, preserving paragraph count', () => {
    const xml = documentXml(para(run('one')) + '<w:p/>' + para(run('two')));
    const out = paragraphsFromDocumentXml(xml);
    expect(out.map((p) => p.text)).toEqual(['one', '', 'two']);
  });

  it('ignores content outside the body', () => {
    const xml =
      '<w:document xmlns:w="x"><w:hdr><w:p><w:r><w:t>header</w:t></w:r></w:p></w:hdr>' +
      '<w:body><w:p><w:r><w:t>body</w:t></w:r></w:p></w:body></w:document>';
    expect(paragraphsFromDocumentXml(xml).map((p) => p.text)).toEqual(['body']);
  });

  it('reads a whole .docx end to end', async () => {
    const bytes = await buildDocx(
      para(run('Tossups')) + para(run('1. A question.')),
    );
    const out = await readDocx(bytes);
    expect(out.map((p) => p.text)).toEqual(['Tossups', '1. A question.']);
  });
});

describe('plain-text input', () => {
  it('wraps each line and escapes it for the html field', () => {
    const out = paragraphsFromText('a < b\nsecond');
    expect(out).toEqual([
      { html: 'a &lt; b', text: 'a < b' },
      { html: 'second', text: 'second' },
    ]);
  });

  it('preserves leading whitespace, which the OAC grammar depends on', () => {
    const out = paragraphsFromText('        ANSWER: Mount Rushmore');
    expect(out[0]?.text).toBe('        ANSWER: Mount Rushmore');
  });

  it('handles CRLF line endings', () => {
    expect(paragraphsFromText('a\r\nb').map((p) => p.text)).toEqual(['a', 'b']);
  });
});

describe('escapeHtml', () => {
  it('escapes the three characters that matter', () => {
    expect(escapeHtml('<a> & "q"')).toBe('&lt;a&gt; &amp; "q"');
  });
});
