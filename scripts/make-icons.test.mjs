// The icon generator produces a real PNG. Cheap to check and worth checking:
// the previous tray icon was silently empty because nothing looked at it.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { ICON_PATH, leafPng } from './make-icons.mjs';

const ok = (label, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
  if (!cond) process.exitCode = 1;
};

const HERE = path.dirname(fileURLToPath(import.meta.url));
execFileSync(process.execPath, [path.join(HERE, 'make-icons.mjs')], { stdio: 'ignore' });

const png = fs.readFileSync(ICON_PATH);
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

ok('make-icons writes the packaging icon', png.length > 0, `${png.length} bytes`);
ok('it starts with the PNG signature', png.subarray(0, 8).equals(SIGNATURE));
ok('the header says 256x256 RGBA',
   png.readUInt32BE(16) === 256 && png.readUInt32BE(20) === 256 &&
   png[24] === 8 && png[25] === 6);
ok('it ends with IEND', png.subarray(png.length - 8, png.length - 4).toString('ascii') === 'IEND');

// Inflate the pixel data back out: proves the chunk lengths and the deflate
// stream agree, which a signature check alone would not.
const idatStart = png.indexOf(Buffer.from('IDAT', 'ascii'));
const idatLength = png.readUInt32BE(idatStart - 4);
const pixels = zlib.inflateSync(png.subarray(idatStart + 4, idatStart + 4 + idatLength));
ok('the pixel data inflates to one filter byte per row plus RGBA',
   pixels.length === 256 * (256 * 4 + 1), String(pixels.length));

const at = (x, y) => {
  const i = y * (256 * 4 + 1) + 1 + x * 4;
  return [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
};
ok('the leaf is opaque in the middle and clear in the corner',
   at(128, 128)[3] === 255 && at(1, 1)[3] === 0);
ok('the highlight sits above the body',
   at(128, 88)[1] > at(128, 170)[1], `${at(128, 88)} vs ${at(128, 170)}`);

const tray = leafPng(32);
ok('the tray size encodes too',
   tray.subarray(0, 8).equals(SIGNATURE) && tray.readUInt32BE(16) === 32);
