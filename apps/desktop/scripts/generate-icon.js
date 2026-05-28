/**
 * Generer tray-ikon for Sakspilot.
 *
 * Bruker bare Node sin innebygde zlib for å lage en gyldig PNG —
 * ingen eksterne avhengigheter. Lager både 16x16 og 32x32 versjon.
 *
 * Kjøres automatisk av "npm install" via postinstall-skriptet.
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const NAVY = { r: 30, g: 58, b: 95 };
const GOLD = { r: 184, g: 134, b: 11 };
const WHITE = { r: 255, g: 255, b: 255 };

function createSakspilotIconPNG(size) {
  // Generer pixel-data: navy bakgrunn med et gull "pilot-triangel" i midten
  const pixels = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = (y * size + x) * 4;
      const color = pickColor(x, y, size);
      pixels[px] = color.r;
      pixels[px + 1] = color.g;
      pixels[px + 2] = color.b;
      pixels[px + 3] = 255;
    }
  }

  // Pakk inn med PNG-filterbyte (0 = none) per rad
  const filtered = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const inOff = y * size * 4;
    const outOff = y * (1 + size * 4);
    filtered[outOff] = 0; // filter: none
    pixels.copy(filtered, outOff + 1, inOff, inOff + size * 4);
  }

  return buildPNG(size, size, filtered);
}

function pickColor(x, y, size) {
  // Sakspilot-ikon: gull pilot-trekant med hvit kompassnål inni.
  // Matcher web-PWA-ikonet i apps/web/public/icon-512.svg.
  const cx = size / 2;
  const top = size * 0.16;
  const bot = size * 0.78;

  // Trekantens halvbredde øker lineært fra topp til bunn
  const halfWidthAtY = ((y - top) / (bot - top)) * (size * 0.42);

  if (y >= top && y <= bot && Math.abs(x - cx) <= halfWidthAtY) {
    // Hvit nål (diamond-form) i midten av trekanten
    const needleTop = size * 0.27;
    const needleBot = size * 0.66;
    if (y >= needleTop && y <= needleBot) {
      // Diamond: bredest på midten, smal i topp og bunn
      const mid = (needleTop + needleBot) / 2;
      const halfHeight = (needleBot - needleTop) / 2;
      const needleHalfWidth =
        (1 - Math.abs(y - mid) / halfHeight) * (size * 0.05);
      if (Math.abs(x - cx) <= needleHalfWidth) {
        return WHITE;
      }
    }
    // Hvit tip-prikk over nålen
    const dotY = size * 0.21;
    const dotR = size * 0.03;
    if (Math.hypot(x - cx, y - dotY) <= dotR) {
      return WHITE;
    }
    // Hvit outline rundt trekanten (tynn)
    const distFromEdge = halfWidthAtY - Math.abs(x - cx);
    if (distFromEdge < size * 0.012 || y - top < size * 0.012 || bot - y < size * 0.012) {
      return WHITE;
    }
    return GOLD;
  }
  return NAVY;
}

function buildPNG(width, height, rawWithFilter) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const idatData = zlib.deflateSync(rawWithFilter);

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const typeAndData = Buffer.concat([typeBuf, data]);
  // Node 22+ har zlib.crc32 innebygd
  const crcVal = zlib.crc32 ? zlib.crc32(typeAndData) >>> 0 : crc32Fallback(typeAndData);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crcVal, 0);
  return Buffer.concat([len, typeAndData, crc]);
}

// CRC32 fallback hvis Node < 22
function crc32Fallback(buf) {
  let table = crc32Fallback._table;
  if (!table) {
    table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[i] = c;
    }
    crc32Fallback._table = table;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ── Skriv ut ─────────────────────────────────────────────
const outDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(outDir, { recursive: true });

const sizes = [16, 32, 64, 128, 256];
for (const size of sizes) {
  const png = createSakspilotIconPNG(size);
  const out = path.join(outDir, `tray-icon${size === 16 ? '' : `-${size}`}.png`);
  fs.writeFileSync(out, png);
  console.log(`✓ ${path.basename(out)} (${png.length} bytes)`);
}

// 256 brukes som hovedikon ved bygging av .exe
const main256 = createSakspilotIconPNG(256);
fs.writeFileSync(path.join(outDir, 'icon.png'), main256);
console.log('✓ icon.png (256x256 hovedikon)');
