// Draws public/grain.png, the faint noise laid over the backdrop so its
// gradient dithers instead of banding in 8-bit colour. Seeded, so it comes
// out the same every time:
//
//   node scripts/render-grain.js

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { crc32, deflateSync } from 'node:zlib';

const FILE = path.resolve(import.meta.dirname, '..', 'public', 'grain.png');
const SIZE = 128;
/**
 * The strongest speck, out of 255: about 3%, a level or two either way on
 * any studio's backdrop. Enough to break up the rings, too little to see.
 */
const MAX_ALPHA = 8;

/** A small seeded generator (mulberry32). */
function random(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

// Grey and alpha: each pixel a white or black speck of its own strength, so
// it lightens and darkens alike and the backdrop's colour stays put.
const next = random(0x7e1c);
const rows = [];
for (let y = 0; y < SIZE; y++) {
  const row = Buffer.alloc(1 + SIZE * 2);
  for (let x = 0; x < SIZE; x++) {
    row[1 + x * 2] = next() < 0.5 ? 0 : 255;
    row[2 + x * 2] = Math.floor(next() * (MAX_ALPHA + 1));
  }
  rows.push(row);
}

const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8; // bits per sample
header[9] = 4; // grey with alpha
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
writeFileSync(FILE, png);
console.log(
  `grain.png ${String(SIZE)}×${String(SIZE)}, ${String(png.length)} bytes`
);
