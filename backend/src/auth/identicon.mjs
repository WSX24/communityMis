import crypto from "node:crypto";
import zlib from "node:zlib";

/**
 * Generate a deterministic identicon PNG buffer from a username.
 * Creates a symmetric 5x5 pixel grid with colored background and foreground.
 */
export function generateIdenticon(username, size) {
  size = size || 256;
  var hash = crypto.createHash("sha256").update(username).digest();
  var gridSize = 5;
  var cellSize = Math.floor(size / gridSize);
  var actualSize = cellSize * gridSize;

  // Derive colors from hash (HSL with fixed saturation/lightness)
  var hue = (hash[0] * 360) / 256;
  var fg = hslToRgb(hue, 0.65, 0.55);
  var bg = hslToRgb(hue, 0.25, 0.90);

  // Build symmetric 5x3 grid, mirror to 5x5
  var cells = [];
  for (var row = 0; row < gridSize; row++) {
    cells[row] = [];
    for (var col = 0; col < 3; col++) {
      cells[row][col] = hash[3 + row * 3 + col] > 127;
    }
    cells[row][3] = cells[row][1];
    cells[row][4] = cells[row][0];
  }

  // Fill entire image with background color
  var rawData = Buffer.alloc(actualSize * actualSize * 4);
  for (var y = 0; y < actualSize; y++) {
    for (var x = 0; x < actualSize; x++) {
      var off = (y * actualSize + x) * 4;
      rawData[off] = bg[0]; rawData[off+1] = bg[1];
      rawData[off+2] = bg[2]; rawData[off+3] = 255;
    }
  }

  // Paint foreground cells
  for (var row = 0; row < gridSize; row++) {
    for (var col = 0; col < gridSize; col++) {
      if (!cells[row][col]) continue;
      for (var y = row * cellSize; y < (row + 1) * cellSize; y++) {
        for (var x = col * cellSize; x < (col + 1) * cellSize; x++) {
          var off = (y * actualSize + x) * 4;
          rawData[off] = fg[0]; rawData[off+1] = fg[1];
          rawData[off+2] = fg[2]; rawData[off+3] = 255;
        }
      }
    }
  }

  return encodePNG(actualSize, actualSize, rawData);
}

function hslToRgb(h, s, l) {
  h /= 360;
  var a = s * Math.min(l, 1 - l);
  function f(n) { var k = (n + h * 12) % 12; return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255); }
  return [f(0), f(8), f(4)];
}

function encodePNG(width, height, rgba) {
  var stride = 1 + width * 4;
  var rawScanlines = Buffer.alloc(height * stride);
  for (var y = 0; y < height; y++) {
    rawScanlines[y * stride] = 0;
    rgba.copy(rawScanlines, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  var compressed = zlib.deflateSync(rawScanlines);
  var signature = Buffer.from([137,80,78,71,13,10,26,10]);
  var ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width,0); ihdrData.writeUInt32BE(height,4);
  ihdrData[8]=8; ihdrData[9]=6; ihdrData[10]=0; ihdrData[11]=0; ihdrData[12]=0;
  return Buffer.concat([signature,makeChunk("IHDR",ihdrData),makeChunk("IDAT",compressed),makeChunk("IEND",Buffer.alloc(0))]);
}

function makeChunk(type, data) {
  var len=Buffer.alloc(4); len.writeUInt32BE(data.length,0);
  var tb=Buffer.from(type,"ascii");
  var crc=pngCRC32(Buffer.concat([tb,data]));
  var cb=Buffer.alloc(4); cb.writeUInt32BE(crc,0);
  return Buffer.concat([len,tb,data,cb]);
}

function pngCRC32(buf) {
  var c=0xffffffff;
  for(var i=0;i<buf.length;i++){c^=buf[i];for(var j=0;j<8;j++){c=c&1?(c>>>1)^0xedb88320:c>>>1;}}
  return (c^0xffffffff)>>>0;
}