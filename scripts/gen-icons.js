// Generates the PWA app icons as flat PNGs, no image-library dependency:
// hand-rolled PNG encoder (IHDR/IDAT/IEND + CRC32) over a pixel buffer we
// paint with plain math (gradient background + a checkmark glyph).
// Run once: node scripts/gen-icons.js
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0; // filter: none
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Distance from point (px,py) to segment (x1,y1)-(x2,y2), for a stroked checkmark.
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq ? ((px - x1) * dx + (py - y1) * dy) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const ex = x1 + t * dx, ey = y1 + t * dy;
  return Math.hypot(px - ex, py - ey);
}

function lerp(a, b, t) { return a + (b - a) * t; }

// scale: 1 = checkmark fills most of the canvas; smaller for maskable safe zone.
function paintIcon(size, scale = 1) {
  const buf = Buffer.alloc(size * size * 4);
  const c1 = [0x4d, 0x7f, 0xff]; // accent blue
  const c2 = [0x8b, 0x7b, 0xf0]; // accent violet
  const strokeW = size * 0.09 * scale;
  const cx = size / 2, cy = size / 2;
  const s = (size * 0.5) * scale; // half-extent of the check glyph
  // check glyph points, centered
  const p1 = [cx - s * 0.55, cy + s * 0.02];
  const p2 = [cx - s * 0.12, cy + s * 0.42];
  const p3 = [cx + s * 0.62, cy - s * 0.38];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = (x + y) / (size * 2);
      const r = lerp(c1[0], c2[0], t), g = lerp(c1[1], c2[1], t), b = lerp(c1[2], c2[2], t);
      const d = Math.min(
        distToSegment(x, y, p1[0], p1[1], p2[0], p2[1]),
        distToSegment(x, y, p2[0], p2[1], p3[0], p3[1])
      );
      const idx = (y * size + x) * 4;
      if (d <= strokeW / 2) {
        buf[idx] = 255; buf[idx + 1] = 255; buf[idx + 2] = 255; buf[idx + 3] = 255;
      } else {
        buf[idx] = Math.round(r); buf[idx + 1] = Math.round(g); buf[idx + 2] = Math.round(b); buf[idx + 3] = 255;
      }
    }
  }
  return buf;
}

const outDir = path.join(__dirname, "..", "public");
const targets = [
  { file: "icon-192.png", size: 192, scale: 1 },
  { file: "icon-512.png", size: 512, scale: 1 },
  { file: "icon-512-maskable.png", size: 512, scale: 0.72 }, // padded for Android's mask crop
];
for (const { file, size, scale } of targets) {
  const png = encodePNG(size, size, paintIcon(size, scale));
  fs.writeFileSync(path.join(outDir, file), png);
  console.log(`wrote ${file} (${png.length} bytes)`);
}
