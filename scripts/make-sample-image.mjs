// Creates non-sensitive sample images for testing uploads: samples/sample-cover.png (1200x630) and a second one.
// Pure Node.js: no image library needed.  Usage: npm run sample-image
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "samples");
mkdirSync(out, { recursive: true });

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

/** A diagonal gradient between two colours with a lighter band, so it is recognisable as a test image. */
function png(width, height, from, to) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const t = (x / width + y / height) / 2;
      const band = Math.abs(((x + y) % 160) - 80) < 6 ? 28 : 0;
      for (let c = 0; c < 3; c++) raw[row + 1 + x * 3 + c] = Math.min(255, Math.round(from[c] + (to[c] - from[c]) * t) + band);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

writeFileSync(path.join(out, "sample-cover.png"), png(1200, 630, [10, 53, 66], [23, 106, 144]));
writeFileSync(path.join(out, "sample-cover-2.png"), png(1200, 630, [47, 111, 79], [246, 241, 231]));
writeFileSync(path.join(out, "not-an-image.txt"), "This is a text file used to check that invalid uploads are refused.\n");
console.log(`Sample files written to ${out}`);
