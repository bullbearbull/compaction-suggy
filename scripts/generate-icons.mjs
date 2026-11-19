import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const iconsDir = path.join(rootDir, "packages", "browser-extension", "public", "icons");

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function sdRoundedBox(px, py, bx, by, r) {
  const qx = Math.abs(px) - bx + r;
  const qy = Math.abs(py) - by + r;
  return (
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
    Math.min(Math.max(qx, qy), 0) -
    r
  );
}

function renderIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const samples = 4; // 4x4 supersampling for crisp edges
  const stroke = 0.085;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let rAcc = 0;
      let gAcc = 0;
      let bAcc = 0;
      let aAcc = 0;

      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const u = (x + (sx + 0.5) / samples) / size; // [0, 1]
          const v = (y + (sy + 0.5) / samples) / size; // [0, 1]
          const cx = u - 0.5;
          const cy = v - 0.5;

          const boxDist = sdRoundedBox(cx, cy, 0.46, 0.46, 0.22);
          if (boxDist > 0) continue;

          // Subtle diagonal emerald gradient (#0d9488 -> #10b981)
          const grad = Math.min(1, Math.max(0, (u + v) * 0.5));
          let r = 13 + (20 - 13) * grad;
          let g = 148 + (184 - 148) * grad;
          let b = 122 + (143 - 122) * grad;

          // Top right-pointing arrow: (0.24, 0.36) -> (0.74, 0.36) + head
          const dTopShaft = distToSegment(u, v, 0.24, 0.37, 0.72, 0.37);
          const dTopHead1 = distToSegment(u, v, 0.58, 0.24, 0.74, 0.37);
          const dTopHead2 = distToSegment(u, v, 0.58, 0.50, 0.74, 0.37);

          // Bottom left-pointing arrow: (0.76, 0.63) -> (0.28, 0.63) + head
          const dBotShaft = distToSegment(u, v, 0.28, 0.63, 0.76, 0.63);
          const dBotHead1 = distToSegment(u, v, 0.42, 0.50, 0.26, 0.63);
          const dBotHead2 = distToSegment(u, v, 0.42, 0.76, 0.26, 0.63);

          const minGlyphDist = Math.min(
            dTopShaft,
            dTopHead1,
            dTopHead2,
            dBotShaft,
            dBotHead1,
            dBotHead2,
          );

          if (minGlyphDist <= stroke * 0.55) {
            r = 255;
            g = 255;
            b = 255;
          }

          rAcc += r;
          gAcc += g;
          bAcc += b;
          aAcc += 255;
        }
      }

      const n = samples * samples;
      const idx = (y * size + x) * 4;
      const alpha = aAcc / n;
      if (alpha > 0) {
        rgba[idx] = Math.round(rAcc / (aAcc / 255));
        rgba[idx + 1] = Math.round(gAcc / (aAcc / 255));
        rgba[idx + 2] = Math.round(bAcc / (aAcc / 255));
        rgba[idx + 3] = Math.round(alpha);
      }
    }
  }

  return encodePng(size, size, rgba);
}

fs.mkdirSync(iconsDir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const png = renderIcon(size);
  fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), png);
}
console.log(`Generated extension PNG icons in ${path.relative(rootDir, iconsDir)}`);
