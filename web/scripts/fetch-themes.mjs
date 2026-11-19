/**
 * Downloads one painting per theme into public/themes/.
 * These paintings are the character of the skin on top of the app, not
 * decoration, so each ships at ~2400px wide so a backdrop can cover a
 * laptop display without showing compression artefacts.
 *
 *   node scripts/fetch-themes.mjs
 *
 * Every work here is clearly public domain: every artist died well before
 * 1930, and a faithful 2D reproduction of a PD painting carries no new
 * copyright. The script refuses to write anything whose Commons licence
 * metadata does not say "public domain", and it exits non-zero if any
 * theme fails so a licence regression or a broken fetch cannot sneak into
 * the commit.
 *
 * Why two hosts: the licence metadata is only in the Commons imageinfo
 * API, but Commons' upload cluster throttles bursts aggressively. The
 * actual bytes come from en.wikipedia.org's FilePath redirect, which
 * sits on a separate cache layer and returns images reliably. Both are
 * Wikimedia and both serve the identical file; using Wikipedia as the
 * byte source does not change the copyright status we verified first.
 *
 * Modeled on fetch-art.mjs; keep both in step if the shared pattern changes.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT_DIR = join(ROOT, 'public', 'themes');
const CREDITS = join(ROOT, 'src', 'themes.credits.json');

// Wikimedia asks automated clients to identify themselves descriptively.
const UA = 'QuizbowlTrainer/0.1 (educational quizbowl practice app)';
const WIDTH = 2000;
// Each download gets this long; a hung thumbnail would otherwise freeze
// the whole pipeline until the harness kills it.
const FETCH_TIMEOUT_MS = 30_000;

/**
 * theme id -> { title, ext, filePathName, width? }.
 * - title: Commons File: title. Used for licence verification.
 * - ext: extension of the saved file. Keep PNG for Byrne so the vector
 *   source rasterises cleanly; every other theme ships as JPEG.
 * - filePathName: the path component Wikipedia's Special:FilePath takes.
 *   Usually the title with "File:" stripped; when the file lives only on
 *   Commons an alternate title may be needed.
 * - width: override the global WIDTH (SVGs rasterise at any size; large
 *   JPEGs are capped by the server's cache).
 */
export const SOURCES = {
  art: {
    title: 'File:Jan Vermeer - The Art of Painting - Google Art Project.jpg',
    ext: 'jpg',
    filePathName: 'Jan_Vermeer_-_The_Art_of_Painting_-_Google_Art_Project.jpg',
  },
  science: {
    title:
      'File:Joseph Wright of Derby - Philosopher giving a lecture on the orrery - Google Art Project.jpg',
    ext: 'jpg',
    filePathName:
      'Joseph_Wright_of_Derby_-_Philosopher_giving_a_lecture_on_the_orrery_-_Google_Art_Project.jpg',
  },
  literature: {
    title: 'File:Jean-Honoré Fragonard 011.jpg',
    ext: 'jpg',
    filePathName: 'Jean-Honor%C3%A9_Fragonard_011.jpg',
    width: 1600,
  },
  mythology: {
    title:
      'File:Sandro Botticelli - La nascita di Venere - Google Art Project - edited.jpg',
    ext: 'jpg',
    filePathName:
      'Sandro_Botticelli_-_La_nascita_di_Venere_-_Google_Art_Project_-_edited.jpg',
  },
  math: {
    title: 'File:Byrne Euclid title page image.svg',
    ext: 'png',
    filePathName: 'Byrne_Euclid_title_page_image.svg',
    width: 2400,
  },
};

const plain = (v) =>
  v ? String(v).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : '';

async function fetchWithTimeout(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Commons imageinfo API, batched by title — licence + descriptionurl. */
async function fetchImageinfo(titles) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.searchParams.set('action', 'query');
  url.searchParams.set('titles', titles.join('|'));
  url.searchParams.set('prop', 'imageinfo');
  url.searchParams.set('iiprop', 'url|extmetadata');
  url.searchParams.set('format', 'json');
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`commons api ${res.status}`);
  return res.json();
}

/** Fetch the actual image bytes via Wikipedia's FilePath redirect. */
async function fetchImageBytes(filePathName, width) {
  const url = `https://en.wikipedia.org/wiki/Special:FilePath/${filePathName}?width=${width}`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetchWithTimeout(url);
      if (res.status === 429 || res.status === 503) {
        const wait = attempt * attempt * 3000;
        console.error(`WAIT  HTTP ${res.status}, retry in ${wait}ms`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      if (attempt === 4) throw err;
      const wait = attempt * attempt * 3000;
      console.error(
        `WAIT  ${err.name === 'AbortError' ? 'timed out' : err.message}, retry in ${wait}ms`,
      );
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw new Error('exhausted retries');
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(dirname(CREDITS), { recursive: true });

  const titles = Object.values(SOURCES).map((s) => s.title);
  const byTitle = new Map(
    Object.entries(SOURCES).map(([id, s]) => [s.title, { id, ...s }]),
  );

  const data = await fetchImageinfo(titles);
  const credits = {};
  let bytes = 0;
  let failures = 0;

  for (const page of Object.values(data.query.pages)) {
    const src = byTitle.get(page.title);
    const info = page.imageinfo?.[0];
    if (!src || !info) {
      console.error(`MISS  ${page.title}`);
      failures += 1;
      continue;
    }

    const meta = info.extmetadata ?? {};
    const licence = plain(meta.LicenseShortName?.value);

    // Hard gate: anything not public domain does not get written.
    if (!/public domain/i.test(licence)) {
      console.error(`SKIP  ${src.id}: licence is "${licence}", not public domain`);
      failures += 1;
      continue;
    }

    let buf;
    try {
      buf = await fetchImageBytes(src.filePathName, src.width ?? WIDTH);
    } catch (err) {
      console.error(`FAIL  ${src.id}: ${err.message}`);
      failures += 1;
      continue;
    }

    const out = join(OUT_DIR, `${src.id}.${src.ext}`);
    writeFileSync(out, buf);
    bytes += buf.length;

    credits[src.id] = {
      title: plain(meta.ObjectName?.value) || page.title.replace(/^File:/, ''),
      artist: plain(meta.Artist?.value),
      licence,
      source: info.descriptionurl,
    };

    console.log(
      `OK    ${src.id.padEnd(12)} ${(buf.length / 1024).toFixed(0)} KB  ${out.replace(ROOT, '.')}`,
    );

    // Space out downloads so Wikipedia's cache does not throttle us.
    await new Promise((r) => setTimeout(r, 800));
  }

  writeFileSync(CREDITS, `${JSON.stringify(credits, null, 2)}\n`, 'utf8');
  console.log(
    `\n${Object.keys(credits).length} works, ${(bytes / 1024 / 1024).toFixed(2)} MB total`,
  );
  console.log(`credits -> ${CREDITS}`);

  if (failures > 0) {
    console.error(
      `\n${failures} theme(s) failed to download or failed the PD licence check.`,
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
