/**
 * Generates the PWA / native launcher icons into public/icons/.
 *
 * There is no brand yet, so the mark is deliberately plain: a buzzer dot in
 * --accent (#f2994a) on the --bg field (#0f1216), with a thin accent ring
 * around it so the shape still reads as a button rather than a blob at 48px.
 *
 * Written as a raw PNG encoder on top of node:zlib because the project has no
 * image dependency and this does not justify adding one. Re-run with
 * `node scripts/gen-icons.mjs` if the palette changes.
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const BG = [0x0f, 0x12, 0x16];
const ACCENT = [0xf2, 0x99, 0x4a];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Encodes an RGB pixel buffer (size*size*3) as an 8-bit truecolour PNG. */
function png(size, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    const dst = y * (size * 3 + 1);
    raw[dst] = 0; // filter: none
    rgb.copy(raw, dst + 1, y * size * 3, (y + 1) * size * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/**
 * The mark: a filled dot plus a ring, both centred.
 *
 * `scale` is the fraction of the canvas the ring's outer edge may occupy. The
 * maskable variant passes a smaller scale so the whole mark sits inside the
 * 80% safe zone a circular or squircle mask can clip to.
 */
function draw(size, scale) {
  const rgb = Buffer.alloc(size * size * 3);
  const c = (size - 1) / 2;
  const ringOuter = (size * scale) / 2;
  const ringInner = ringOuter - Math.max(1, size * scale * 0.09);
  const dot = ringOuter * 0.58;
  // Antialias by sampling the distance field against a half-pixel band.
  const aa = 0.75;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c);
      // Coverage of the solid dot, and of the ring annulus.
      const inDot = clamp((dot - d) / aa + 0.5);
      const inRing =
        clamp((ringOuter - d) / aa + 0.5) * clamp((d - ringInner) / aa + 0.5);
      const cover = Math.max(inDot, inRing);
      const px = mix(BG, ACCENT, cover);
      const o = (y * size + x) * 3;
      rgb[o] = px[0];
      rgb[o + 1] = px[1];
      rgb[o + 2] = px[2];
    }
  }
  return rgb;
}

function clamp(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

mkdirSync(OUT, { recursive: true });

const files = [
  // [filename, pixel size, mark scale]
  ['icon-192.png', 192, 0.72],
  ['icon-512.png', 512, 0.72],
  // Maskable: the mark stays inside the central 80% safe zone.
  ['icon-maskable-512.png', 512, 0.5],
  // iOS applies its own rounded-rect mask and never a circle, so the
  // apple-touch-icon can sit between the two.
  ['apple-touch-icon-180.png', 180, 0.62],
];

for (const [name, size, scale] of files) {
  writeFileSync(join(OUT, name), png(size, draw(size, scale)));
  process.stdout.write(`${name}  ${size}x${size}\n`);
}
