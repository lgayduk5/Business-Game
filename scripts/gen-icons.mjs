// Procedurally draws the app icons (no image assets are checked in or fetched).
// A tiny software rasteriser renders a rising bar chart inside a brass ring on
// banker's green, then encodes PNGs with Node's built-in zlib.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(out, { recursive: true });

const crcTable = new Uint32Array(256).map((_, n) => {
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
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const INK = [10, 31, 26];
const GREEN = [18, 58, 47];
const BRASS = [214, 170, 88];
const BRASS_HI = [244, 214, 140];
const MINT = [126, 214, 170];

/** Colour of the icon at unit coordinates (0..1). `pad` shrinks the art for maskable icons. */
function shade(u, v, pad, rounded) {
  // rounded-square mask (skipped for maskable/apple icons, which the OS masks itself)
  if (rounded) {
    const r = 0.22;
    const dx = Math.max(Math.abs(u - 0.5) - (0.5 - r), 0);
    const dy = Math.max(Math.abs(v - 0.5) - (0.5 - r), 0);
    if (Math.hypot(dx, dy) > r) return null;
  }
  let col = mix(GREEN, INK, Math.min(1, Math.hypot(u - 0.3, v - 0.2) * 1.05));
  const x = (u - 0.5) / (1 - pad * 2) + 0.5;
  const y = (v - 0.5) / (1 - pad * 2) + 0.5;
  // brass ring
  const d = Math.hypot(x - 0.5, y - 0.5);
  if (d > 0.385 && d < 0.425) col = mix(BRASS, BRASS_HI, Math.max(0, 0.5 - y) * 1.6);
  // four rising bars
  const bars = [0.2, 0.31, 0.27, 0.44];
  for (let i = 0; i < 4; i++) {
    const bx = 0.275 + i * 0.118;
    if (x > bx && x < bx + 0.085 && y < 0.7 && y > 0.7 - bars[i]) {
      col = i === 3 ? mix(BRASS, BRASS_HI, (0.7 - y) / bars[i]) : mix(MINT, GREEN, 0.35 + (y - 0.3) * 0.5);
    }
  }
  // baseline
  if (x > 0.25 && x < 0.75 && y > 0.715 && y < 0.735) col = BRASS;
  return col;
}

function render(size, { pad = 0, rounded = true } = {}) {
  const ss = 3; // supersampling for anti-aliased edges
  const buf = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = shade((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size, pad, rounded);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a += 1; }
        }
      }
      const i = (py * size + px) * 4;
      if (a) { buf[i] = r / a; buf[i + 1] = g / a; buf[i + 2] = b / a; }
      buf[i + 3] = Math.round((a / (ss * ss)) * 255);
    }
  }
  return png(size, buf);
}

writeFileSync(join(out, 'icon-192.png'), render(192));
writeFileSync(join(out, 'icon-512.png'), render(512));
writeFileSync(join(out, 'maskable-512.png'), render(512, { pad: 0.12, rounded: false }));
writeFileSync(join(out, 'apple-touch-icon.png'), render(180, { pad: 0.04, rounded: false }));
writeFileSync(join(out, 'favicon-48.png'), render(48));
console.log('icons written to public/icons');
