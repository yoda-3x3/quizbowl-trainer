/**
 * Downloads the curated artwork set from Wikimedia Commons into public/art/,
 * and writes src/art/credits.json with the licence and attribution for each.
 *
 *   node scripts/fetch-art.mjs
 *
 * Every work here is public domain: the artist died more than 70 years ago and
 * a faithful 2D reproduction of a public-domain painting carries no new
 * copyright. That constraint is why the set skews older than QB Reader's
 * most-asked list, where the top four visual artists (Dali, Warhol, Brancusi,
 * Duchamp) are all still in copyright and cannot ship.
 *
 * The script refuses to write anything whose licence metadata does not say
 * public domain, so a future addition cannot quietly smuggle in a restricted
 * image.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT_DIR = join(ROOT, 'public', 'art');
const CREDITS = join(ROOT, 'src', 'art', 'credits.json');

// Wikimedia asks automated clients to identify themselves descriptively.
const UA = 'QuizbowlTrainer/0.1 (educational quizbowl practice app)';
const WIDTH = 1100;

/** id -> Commons File: title. Keep ids stable; they key the element data. */
export const SOURCES = {
  starry_night: 'File:Van Gogh - Starry Night - Google Art Project.jpg',
  the_scream:
    'File:Edvard Munch, 1893, The Scream, oil, tempera and pastel on cardboard, 91 x 73 cm, National Gallery of Norway.jpg',
  birth_of_venus:
    'File:Sandro Botticelli - La nascita di Venere - Google Art Project - edited.jpg',
  oath_of_the_horatii: 'File:Jacques-Louis David, Le Serment des Horaces.jpg',
  melencolia_i: 'File:Melencolia I (Durero).jpg',
  last_supper:
    'File:Leonardo da Vinci (1452-1519) - The Last Supper (1495-1498).jpg',
  the_oxbow:
    'File:Cole Thomas The Oxbow (The Connecticut River near Northampton 1836).jpg',
  venus_of_urbino: 'File:Tiziano - Venere di Urbino - Google Art Project.jpg',
  school_of_athens:
    'File:"The School of Athens" by Raffaello Sanzio da Urbino.jpg',
  arnolfini_portrait: 'File:Van Eyck - Arnolfini Portrait.jpg',
  las_meninas:
    'File:Las Meninas, by Diego Velázquez, from Prado in Google Earth.jpg',
  third_of_may:
    'File:El Tres de Mayo, by Francisco de Goya, from Prado thin black margin.jpg',
  great_wave: 'File:Tsunami by hokusai 19th century.jpg',
  fall_of_icarus: 'File:Pieter Bruegel de Oude - De val van Icarus.jpg',
  grande_jatte: 'File:A Sunday on La Grande Jatte, Georges Seurat, 1884.jpg',
  olympia: 'File:Edouard Manet - Olympia - Google Art Project 3.jpg',
};

const plain = (v) =>
  v ? String(v).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : '';

async function api(titles) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.searchParams.set('action', 'query');
  url.searchParams.set('titles', titles.join('|'));
  url.searchParams.set('prop', 'imageinfo');
  url.searchParams.set('iiprop', 'url|extmetadata');
  url.searchParams.set('iiurlwidth', String(WIDTH));
  url.searchParams.set('format', 'json');
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`commons api ${res.status}`);
  return res.json();
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(dirname(CREDITS), { recursive: true });

  const byTitle = new Map(
    Object.entries(SOURCES).map(([id, title]) => [title, id]),
  );
  const data = await api([...byTitle.keys()]);
  const credits = {};
  let bytes = 0;

  for (const page of Object.values(data.query.pages)) {
    const id = byTitle.get(page.title);
    const info = page.imageinfo?.[0];
    if (!id || !info) {
      console.error(`MISS  ${page.title}`);
      continue;
    }

    const meta = info.extmetadata ?? {};
    const licence = plain(meta.LicenseShortName?.value);

    // Hard gate. Anything not public domain does not get written, however
    // famous it is or however much a question wants it.
    if (!/public domain/i.test(licence)) {
      console.error(`SKIP  ${id}: licence is "${licence}", not public domain`);
      continue;
    }

    const res = await fetch(info.thumburl, { headers: { 'User-Agent': UA } });
    if (!res.ok) {
      console.error(`FAIL  ${id}: ${res.status}`);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(join(OUT_DIR, `${id}.jpg`), buf);
    bytes += buf.length;

    credits[id] = {
      title: plain(meta.ObjectName?.value) || page.title.replace(/^File:/, ''),
      artist: plain(meta.Artist?.value),
      licence,
      source: info.descriptionurl,
      width: info.thumbwidth,
      height: info.thumbheight,
    };

    console.log(
      `OK    ${id.padEnd(22)} ${info.thumbwidth}x${info.thumbheight}  ${(buf.length / 1024).toFixed(0)} KB`,
    );
  }

  writeFileSync(CREDITS, `${JSON.stringify(credits, null, 2)}\n`, 'utf8');
  console.log(
    `\n${Object.keys(credits).length} works, ${(bytes / 1024 / 1024).toFixed(2)} MB total`,
  );
  console.log(`credits -> ${CREDITS}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
