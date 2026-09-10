// Writes apps/desktop/build/icon.png, which is where electron-builder looks
// for the application icon. Wired as the desktop package's "prepackage", so a
// packaged build cannot go out without one.
//
// The encoder is the same routine as apps/desktop/electron/png.ts, in plain JS
// because this runs straight from node with no build step. Keep the two in
// step -- they draw the same leaf, at different sizes.
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([head, body, crc]);
}

/** RGBA bytes, row-major, to a PNG. Colour type 6, 8 bits, no interlacing. */
export function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4)
      .copy(raw, y * stride + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const LEAF = [0x2f, 0x7d, 0x5a];
const STEM = [0x11, 0x22, 0x33];
const HIGHLIGHT = [0x7f, 0xd4, 0xa3];

/** The leaf: a filled disc, a stem, a smaller lighter disc. Sampled 3x3. */
export function leafPng(size) {
  const rgba = new Uint8Array(size * size * 4);
  const u = size / 32;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < 3; sy++) {
        for (let sx = 0; sx < 3; sx++) {
          const px = x + (sx + 0.5) / 3;
          const py = y + (sy + 0.5) / 3;
          let hit = null;
          if (Math.hypot(px - 16 * u, py - 16 * u) <= 13 * u) hit = LEAF;
          if (Math.abs(px - 16 * u) <= u && py >= 11 * u && py <= 25 * u) hit = STEM;
          if (Math.hypot(px - 16 * u, py - 11 * u) <= 6 * u) hit = HIGHLIGHT;
          if (!hit) continue;
          r += hit[0]; g += hit[1]; b += hit[2]; a += 255;
        }
      }
      if (a === 0) continue;
      const i = (y * size + x) * 4;
      const covered = a / 255;
      rgba[i] = Math.round(r / covered);
      rgba[i + 1] = Math.round(g / covered);
      rgba[i + 2] = Math.round(b / covered);
      rgba[i + 3] = Math.round(a / 9);
    }
  }
  return encodePng(size, size, rgba);
}

export const ICON_PATH = path.join(HERE, '..', 'apps', 'desktop', 'build', 'icon.png');

export function writeIcons() {
  fs.mkdirSync(path.dirname(ICON_PATH), { recursive: true });
  fs.writeFileSync(ICON_PATH, leafPng(256));
  return ICON_PATH;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(`wrote ${writeIcons()}`);
}
