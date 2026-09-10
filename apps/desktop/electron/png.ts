import zlib from 'node:zlib';

/**
 * A minimal PNG encoder, and the app's leaf drawn with it.
 *
 * `nativeImage.createFromDataURL` accepts PNG and JPEG only, so the SVG data
 * URL the tray used to be built from produced an empty image: on Windows and
 * macOS the tray icon was invisible, and "hide to tray during a session" left
 * no way back into the app. Forty lines of encoder is cheaper than a binary
 * asset in the repo and a build step to keep it in sync with the artwork.
 *
 * `scripts/make-icons.mjs` is the same routine in plain JS, for the 256px
 * icon electron-builder needs at package time. Keep the two in step.
 */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = -1;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([head, body, crc]);
}

/** RGBA bytes, row-major, to a PNG. Colour type 6, 8 bits, no interlacing. */
export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  // Each scanline is prefixed with its filter byte; 0 means "store as is".
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4)
      .copy(raw, y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

type RGB = [number, number, number];

const LEAF: RGB = [0x2f, 0x7d, 0x5a];
const STEM: RGB = [0x11, 0x22, 0x33];
const HIGHLIGHT: RGB = [0x7f, 0xd4, 0xa3];

/**
 * The leaf, drawn at any size: a filled disc, a stem, and a smaller lighter
 * disc on top -- the shapes the tray SVG had. Sampled 3x3 per pixel, because
 * a hard-edged circle at 16 logical pixels reads as a blob.
 */
export function leafPng(size: number): Buffer {
  const rgba = new Uint8Array(size * size * 4);
  const u = size / 32; // the artwork was drawn on a 32x32 grid
  const disc = (cx: number, cy: number, r: number, color: RGB) =>
    ({ cx: cx * u, cy: cy * u, r: r * u, color });
  const shapes = [disc(16, 16, 13, LEAF), disc(16, 11, 6, HIGHLIGHT)];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let [r, g, b, a] = [0, 0, 0, 0];
      for (let sy = 0; sy < 3; sy++) {
        for (let sx = 0; sx < 3; sx++) {
          const px = x + (sx + 0.5) / 3;
          const py = y + (sy + 0.5) / 3;
          let hit: RGB | null = null;
          // Painter's order: base leaf, then the stem, then the highlight.
          if (Math.hypot(px - shapes[0]!.cx, py - shapes[0]!.cy) <= shapes[0]!.r) hit = LEAF;
          if (Math.abs(px - 16 * u) <= u && py >= 11 * u && py <= 25 * u) hit = STEM;
          if (Math.hypot(px - shapes[1]!.cx, py - shapes[1]!.cy) <= shapes[1]!.r) hit = HIGHLIGHT;
          if (!hit) continue;
          r += hit[0]; g += hit[1]; b += hit[2]; a += 255;
        }
      }
      const i = (y * size + x) * 4;
      if (a === 0) continue;
      const covered = a / 255;
      rgba[i] = Math.round(r / covered);
      rgba[i + 1] = Math.round(g / covered);
      rgba[i + 2] = Math.round(b / covered);
      rgba[i + 3] = Math.round(a / 9);
    }
  }
  return encodePng(size, size, rgba);
}
