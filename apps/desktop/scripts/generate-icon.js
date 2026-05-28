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

// Nytt fargesett: charcoal-bg med hvit S. Mer nøytralt enn navy/gull.
const NAVY = { r: 31, g: 31, b: 31 };   // charcoal bg (variabel-navn beholdt for kompatibilitet)
const GOLD = { r: 255, g: 255, b: 255 }; // (ubrukt nå, S-bokstaven er hvit)
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
  // Sakspilot-ikon: bold hvit "S" på charcoal bakgrunn.
  // S-formen tegnes som to halvsirkler stablet — øverste vendt høyre,
  // nederste vendt venstre. Sammen gir det en geometrisk S.
  const cx = size / 2;

  // Sentrum + radier for de to halvsirklene
  const topCy = size * 0.36;
  const botCy = size * 0.64;
  const outerR = size * 0.22;
  const innerR = size * 0.115;

  // Avstand fra sentrum av topp-halvsirkel
  const dTop = Math.hypot(x - cx, y - topCy);
  const dBot = Math.hypot(x - cx, y - botCy);

  // Topp-halvsirkel: åpen mot bunn-høyre (kvadrant 4 vendt mot oss)
  // → ring (outerR > d > innerR) hvor IKKE (x > cx AND y > topCy)
  const inTopRing = dTop <= outerR && dTop >= innerR;
  const topOpening = x > cx && y > topCy;
  if (inTopRing && !topOpening) return WHITE;

  // Bunn-halvsirkel: åpen mot topp-venstre (kvadrant 2)
  // → ring hvor IKKE (x < cx AND y < botCy)
  const inBotRing = dBot <= outerR && dBot >= innerR;
  const botOpening = x < cx && y < botCy;
  if (inBotRing && !botOpening) return WHITE;

  // Resten = bakgrunn
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
