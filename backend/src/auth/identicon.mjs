import crypto from "node:crypto";
import zlib from "node:zlib";

/**
 * Generate a deterministic identicon PNG buffer from a username.
 * Creates a symmetric 5×5 pixel grid pattern, scaled to the target size.
 * @param {string} username
 * @param {number} size - output PNG size in pixels (square)
 * @returns {Buffer} PNG image data
 */
export function generateIdenticon(username, size = 256) {
  // Deterministic hash from username
  const hash = crypto.createHash("sha256").update(username).digest();

  // 5×5 grid, each cell scales to fill the total size
  const gridSize = 5;
  const cellSize = Math.floor(size / gridSize);
  const actualSize = cellSize * gridSize;

  // Pick a color from the hash
  const r = hash[0];
  const g = hash[1];
  const b = hash[2];

  // Build a symmetric 5×3 grid then mirror to 5×5
  const cells = [];
  for (let row = 0; row < gridSize; row++) {
    cells[row] = [];
    for (let col = 0; col < 3; col++) {
      const idx = 3 + row * 3 + col;
      cells[row][col] = hash[idx] > 127; // filled cell when byte > 127
    }
    // Mirror right side from left
    cells[row][3] = cells[row][1];
    cells[row][4] = cells[row][0];
  }

  // Raw RGBA pixel data
  const rawData = Buffer.alloc(actualSize * actualSize * 4, 0);

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      if (!cells[row][col]) continue;
      for (let y = row * cellSize; y < (row + 1) * cellSize; y++) {
        for (let x = col * cellSize; x < (col + 1) * cellSize; x++) {
          const offset = (y * actualSize + x) * 4;
          rawData[offset] = r;
          rawData[offset + 1] = g;
          rawData[offset + 2] = b;
          rawData[offset + 3] = 255;
        }
      }
    }
  }

  return encodePNG(actualSize, actualSize, rawData);
}

// ── Minimal PNG encoder ──────────────────────────────────────────────

function encodePNG(width, height, rgba) {
  // Build scanlines: 1-byte filter + pixel data per row
  const stride = 1 + width * 4;
  const rawScanlines = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    rawScanlines[y * stride] = 0; // filter: None
    rgba.copy(rawScanlines, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }

  const compressed = zlib.deflateSync(rawScanlines);

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]); // PNG magic

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 6;  // color type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const ihdr = makeChunk("IHDR", ihdrData);
  const idat = makeChunk("IDAT", compressed);
  const iend = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);

  const typeBuf = Buffer.from(type, "ascii");
  const crc = pngCRC32(Buffer.concat([typeBuf, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);

  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function pngCRC32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
