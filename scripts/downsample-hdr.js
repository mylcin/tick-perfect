// Halves a Radiance .hdr image (box filter in linear light) and writes it
// back run-length encoded, optionally capping every texel's brightest
// channel first (keeping its hue). The studio HDRI was made in two steps:
//
//   node scripts/downsample-hdr.js studio_small_03_1k.hdr studio-512.hdr
//   node scripts/downsample-hdr.js studio-512.hdr \
//     src/assets/studio-small-03.hdr --cap 12
//
// The scene captures it into a 256 cube, so 256×128 draws the watch the
// same as 512×256 did, at a quarter of the download. Its bare bulbs peak
// above 3000 where the room is below 1; capped at 12 they still shape the
// highlights without flaring off every polished edge, and the page needn't
// cap them.

import { readFileSync, writeFileSync } from 'node:fs';

const [input, output, flag, value] = process.argv.slice(2);
const cap = flag === '--cap' ? Number(value) : Infinity;
if (!input || !output || (flag !== undefined && !(cap > 0))) {
  console.error(
    'Usage: node scripts/downsample-hdr.js <input.hdr> <output.hdr> [--cap <radiance>]'
  );
  process.exit(1);
}

const { width, height, pixels } = readHdr(readFileSync(input));
capRadiance(pixels, cap);
const half = downsample(width, height, pixels);
writeFileSync(output, writeHdr(width / 2, height / 2, half));
console.log(
  `${input} ${width}×${height} → ${output} ${width / 2}×${height / 2}`
);

function readHdr(buffer) {
  let offset = 0;
  const readLine = () => {
    const end = buffer.indexOf(0x0a, offset);
    const line = buffer.toString('ascii', offset, end);
    offset = end + 1;
    return line;
  };

  if (!readLine().startsWith('#?')) throw new Error('Not a Radiance file');
  for (let line = readLine(); line !== ''; line = readLine()) {
    if (line.startsWith('FORMAT=') && line !== 'FORMAT=32-bit_rle_rgbe') {
      throw new Error(`Unsupported ${line}`);
    }
  }
  const match = /^-Y (\d+) \+X (\d+)$/.exec(readLine());
  if (!match) throw new Error('Unsupported resolution line');
  const height = Number(match[1]);
  const width = Number(match[2]);

  const pixels = new Float32Array(width * height * 3);
  const scanline = new Uint8Array(width * 4);
  for (let y = 0; y < height; y++) {
    if (buffer[offset] !== 2 || buffer[offset + 1] !== 2) {
      throw new Error('Only new-style run-length encoded files are supported');
    }
    offset += 4;
    for (let channel = 0; channel < 4; channel++) {
      let x = 0;
      while (x < width) {
        let count = buffer[offset++];
        if (count > 128) {
          count -= 128;
          scanline.fill(
            buffer[offset++],
            channel * width + x,
            channel * width + x + count
          );
        } else {
          scanline.set(
            buffer.subarray(offset, offset + count),
            channel * width + x
          );
          offset += count;
        }
        x += count;
      }
    }
    for (let x = 0; x < width; x++) {
      const exponent = scanline[3 * width + x];
      const scale = exponent === 0 ? 0 : 2 ** (exponent - 136);
      const index = (y * width + x) * 3;
      for (let channel = 0; channel < 3; channel++) {
        const mantissa = scanline[channel * width + x];
        pixels[index + channel] = exponent === 0 ? 0 : (mantissa + 0.5) * scale;
      }
    }
  }
  return { width, height, pixels };
}

function capRadiance(pixels, max) {
  for (let index = 0; index < pixels.length; index += 3) {
    const peak = Math.max(pixels[index], pixels[index + 1], pixels[index + 2]);
    if (peak <= max) continue;
    for (let channel = 0; channel < 3; channel++) {
      pixels[index + channel] *= max / peak;
    }
  }
}

function downsample(width, height, pixels) {
  const halfWidth = width / 2;
  const result = new Float32Array(halfWidth * (height / 2) * 3);
  for (let y = 0; y < height / 2; y++) {
    for (let x = 0; x < halfWidth; x++) {
      for (let channel = 0; channel < 3; channel++) {
        let sum = 0;
        for (const [dx, dy] of [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ]) {
          sum += pixels[((2 * y + dy) * width + 2 * x + dx) * 3 + channel];
        }
        result[(y * halfWidth + x) * 3 + channel] = sum / 4;
      }
    }
  }
  return result;
}

function writeHdr(width, height, pixels) {
  const chunks = [
    Buffer.from(
      `#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`,
      'ascii'
    ),
  ];
  const rgbe = new Uint8Array(width * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 3;
      const [r, g, b] = [pixels[index], pixels[index + 1], pixels[index + 2]];
      const max = Math.max(r, g, b);
      if (max < 1e-32) {
        rgbe[x] =
          rgbe[width + x] =
          rgbe[2 * width + x] =
          rgbe[3 * width + x] =
            0;
        continue;
      }
      const exponent = Math.floor(Math.log2(max)) + 1;
      const scale = 256 / 2 ** exponent;
      rgbe[x] = Math.min(255, Math.floor(r * scale));
      rgbe[width + x] = Math.min(255, Math.floor(g * scale));
      rgbe[2 * width + x] = Math.min(255, Math.floor(b * scale));
      rgbe[3 * width + x] = exponent + 128;
    }
    chunks.push(Buffer.from([2, 2, width >> 8, width & 0xff]));
    for (let channel = 0; channel < 4; channel++) {
      chunks.push(
        encodeRuns(rgbe.subarray(channel * width, (channel + 1) * width))
      );
    }
  }
  return Buffer.concat(chunks);
}

// Runs of 3+ equal bytes become (128 + length, value); everything else is
// stored as literal blocks of up to 128 bytes.
function encodeRuns(values) {
  const out = [];
  let index = 0;
  while (index < values.length) {
    let run = 1;
    while (
      run < 127 &&
      index + run < values.length &&
      values[index + run] === values[index]
    ) {
      run++;
    }
    if (run >= 3) {
      out.push(128 + run, values[index]);
      index += run;
      continue;
    }
    const start = index;
    while (index < values.length && index - start < 128) {
      const ahead = values[index];
      if (
        index + 2 < values.length &&
        values[index + 1] === ahead &&
        values[index + 2] === ahead
      ) {
        break;
      }
      index++;
    }
    out.push(index - start, ...values.subarray(start, index));
  }
  return Buffer.from(out);
}
