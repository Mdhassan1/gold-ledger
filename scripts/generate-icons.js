const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buffer) {
  let crc = ~0;
  for (let index = 0; index < buffer.length; index += 1) {
    crc ^= buffer[index];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const name = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
  return Buffer.concat([length, name, data, crc]);
}

function png(width, height, paint) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = paint(x, y, width, height);
      const offset = row + 1 + x * 4;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function coin(x, y, width, height, { background = null, foreground = [214, 173, 96, 255], mono = false } = {}) {
  const cx = width / 2;
  const cy = height / 2;
  const radius = width * 0.31;
  const dx = x - cx + 0.5;
  const dy = y - cy + 0.5;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance > radius) {
    return background || [0, 0, 0, 0];
  }
  if (mono) return [255, 255, 255, 255];
  if (distance > radius * 0.78) return [140, 101, 36, 255];
  const bar = Math.abs(dy) < radius * 0.12 && Math.abs(dx) < radius * 0.42;
  const stem = Math.abs(dx) < radius * 0.1 && dy > -radius * 0.34 && dy < radius * 0.34;
  if (bar || stem) return [28, 20, 8, 255];
  return foreground;
}

const assets = path.join(__dirname, '..', 'assets');
fs.writeFileSync(path.join(assets, 'icon.png'), png(1024, 1024, (x, y, w, h) => coin(x, y, w, h, { background: [11, 17, 32, 255] })));
fs.writeFileSync(path.join(assets, 'android-icon-background.png'), png(1024, 1024, () => [11, 17, 32, 255]));
fs.writeFileSync(path.join(assets, 'android-icon-foreground.png'), png(1024, 1024, (x, y, w, h) => coin(x, y, w, h)));
fs.writeFileSync(path.join(assets, 'android-icon-monochrome.png'), png(1024, 1024, (x, y, w, h) => coin(x, y, w, h, { mono: true })));
fs.writeFileSync(path.join(assets, 'splash-icon.png'), png(512, 512, (x, y, w, h) => coin(x, y, w, h)));
fs.writeFileSync(path.join(assets, 'favicon.png'), png(64, 64, (x, y, w, h) => coin(x, y, w, h, { background: [11, 17, 32, 255] })));
console.log('Wrote GoldLedger icons.');
