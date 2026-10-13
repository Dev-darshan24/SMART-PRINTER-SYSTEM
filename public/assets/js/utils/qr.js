/**
 * Standard ISO/IEC 18004 QR Code Model 2 Generator (Pure Vanilla JavaScript)
 * Generates authentic, standard black-and-white QR code matrices client-side.
 * Works completely offline with zero external dependencies and zero CORS issues.
 */

// Galois Field GF(256) tables with primitive polynomial 0x11D (285)
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(function initGaloisField() {
  let val = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = val;
    GF_EXP[i + 255] = val;
    GF_LOG[val] = i;
    val = (val << 1) ^ (val >= 128 ? 0x11D : 0);
  }
})();

function gfMul(x, y) {
  if (x === 0 || y === 0) return 0;
  return GF_EXP[GF_LOG[x] + GF_LOG[y]];
}

// Compute Reed-Solomon generator polynomial for given degree
function rsGeneratorPoly(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = [1];
    for (let j = 0; j < poly.length; j++) {
      next[j] = gfMul(poly[j], GF_EXP[i]);
    }
    next.push(0);
    const result = new Array(next.length).fill(0);
    for (let j = 0; j < poly.length; j++) {
      result[j] ^= poly[j];
      result[j + 1] ^= next[j];
    }
    poly = result;
  }
  return poly;
}

// Compute Reed-Solomon error correction codewords
function rsComputeRemainder(data, numEcCodewords) {
  const gen = rsGeneratorPoly(numEcCodewords);
  const rem = new Array(numEcCodewords).fill(0);
  for (const b of data) {
    const factor = b ^ rem[0];
    for (let i = 0; i < numEcCodewords - 1; i++) {
      rem[i] = rem[i + 1] ^ gfMul(factor, gen[i + 1]);
    }
    rem[numEcCodewords - 1] = gfMul(factor, gen[numEcCodewords]);
  }
  return rem;
}

// Version table parameters for EC Level M (1 through 10)
const VERSION_SPECS = [
  null,
  // v1: 21x21, total 26, data 16, ec 10, 1 block
  { version: 1, size: 21, dataCodewords: 16, ecCodewords: 10, blocks: [{ count: 1, data: 16, ec: 10 }], alignments: [] },
  // v2: 25x25, total 44, data 28, ec 16, 1 block
  { version: 2, size: 25, dataCodewords: 28, ecCodewords: 16, blocks: [{ count: 1, data: 28, ec: 16 }], alignments: [6, 18] },
  // v3: 29x29, total 70, data 44, ec 26, 1 block
  { version: 3, size: 29, dataCodewords: 44, ecCodewords: 26, blocks: [{ count: 1, data: 44, ec: 26 }], alignments: [6, 22] },
  // v4: 33x33, total 100, data 64, ec 36, 2 blocks
  { version: 4, size: 33, dataCodewords: 64, ecCodewords: 18, blocks: [{ count: 2, data: 32, ec: 18 }], alignments: [6, 26] },
  // v5: 37x37, total 134, data 86, ec 48, 2 blocks
  { version: 5, size: 37, dataCodewords: 86, ecCodewords: 24, blocks: [{ count: 2, data: 43, ec: 24 }], alignments: [6, 30] },
  // v6: 41x41, total 172, data 108, ec 32, 4 blocks
  { version: 6, size: 41, dataCodewords: 108, ecCodewords: 16, blocks: [{ count: 4, data: 27, ec: 16 }], alignments: [6, 34] },
  // v7: 45x45, total 196, data 124, ec 36, 4 blocks
  { version: 7, size: 45, dataCodewords: 124, ecCodewords: 18, blocks: [{ count: 4, data: 31, ec: 18 }], alignments: [6, 22, 38] },
  // v8: 49x49, total 242, data 154, ec 44, 4 blocks (2x38, 2x39)
  { version: 8, size: 49, dataCodewords: 154, ecCodewords: 22, blocks: [{ count: 2, data: 38, ec: 22 }, { count: 2, data: 39, ec: 22 }], alignments: [6, 24, 42] },
  // v9: 53x53, total 292, data 182, ec 44, 5 blocks
  { version: 9, size: 53, dataCodewords: 182, ecCodewords: 22, blocks: [{ count: 3, data: 36, ec: 22 }, { count: 2, data: 37, ec: 22 }], alignments: [6, 26, 46] },
  // v10: 57x57, total 346, data 216, ec 52, 5 blocks
  { version: 10, size: 57, dataCodewords: 216, ecCodewords: 26, blocks: [{ count: 4, data: 43, ec: 26 }, { count: 1, data: 44, ec: 26 }], alignments: [6, 28, 50] }
];

// Pick appropriate QR version for the given byte length
function selectVersion(byteLength) {
  for (let v = 1; v <= 10; v++) {
    const spec = VERSION_SPECS[v];
    // Byte mode overhead: 4-bit mode indicator + 8-bit character count = 12 bits -> 2 bytes
    if (spec.dataCodewords >= byteLength + 2) {
      return spec;
    }
  }
  return VERSION_SPECS[10];
}

// Encode text into bits using standard 8-bit Byte Mode
function encodeData(text, spec) {
  const utf8Bytes = [];
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    if (code < 0x80) {
      utf8Bytes.push(code);
    } else if (code < 0x800) {
      utf8Bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else {
      utf8Bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }

  // 1. Bitstream builder
  const bits = [];
  const appendBits = (val, length) => {
    for (let i = length - 1; i >= 0; i--) {
      bits.push((val >> i) & 1);
    }
  };

  // Mode indicator: 0100 for Byte Mode
  appendBits(0b0100, 4);
  // Character count indicator: 8 bits for versions 1-9
  appendBits(utf8Bytes.length, 8);
  // Data bytes
  for (const b of utf8Bytes) {
    appendBits(b, 8);
  }

  // Terminator bits (up to 4 zeroes)
  const maxBits = spec.dataCodewords * 8;
  const termBits = Math.min(4, maxBits - bits.length);
  for (let i = 0; i < termBits; i++) bits.push(0);

  // Pad to byte boundary
  while (bits.length % 8 !== 0) bits.push(0);

  // Convert bits to codewords
  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byteVal = 0;
    for (let j = 0; j < 8; j++) {
      byteVal = (byteVal << 1) | bits[i + j];
    }
    codewords.push(byteVal);
  }

  // Pad bytes alternating 0xEC (236) and 0x11 (17)
  const padPatterns = [0xEC, 0x11];
  let padIdx = 0;
  while (codewords.length < spec.dataCodewords) {
    codewords.push(padPatterns[padIdx % 2]);
    padIdx++;
  }

  // Partition codewords into blocks and generate error correction
  const blocks = [];
  let cwOffset = 0;
  for (const bSpec of spec.blocks) {
    for (let i = 0; i < bSpec.count; i++) {
      const dataBlock = codewords.slice(cwOffset, cwOffset + bSpec.data);
      cwOffset += bSpec.data;
      const ecBlock = rsComputeRemainder(dataBlock, bSpec.ec);
      blocks.push({ data: dataBlock, ec: ecBlock });
    }
  }

  // Interleave data codewords
  const finalSequence = [];
  const maxDataLen = Math.max(...blocks.map(b => b.data.length));
  for (let i = 0; i < maxDataLen; i++) {
    for (const b of blocks) {
      if (i < b.data.length) finalSequence.push(b.data[i]);
    }
  }

  // Interleave EC codewords
  const maxEcLen = Math.max(...blocks.map(b => b.ec.length));
  for (let i = 0; i < maxEcLen; i++) {
    for (const b of blocks) {
      if (i < b.ec.length) finalSequence.push(b.ec[i]);
    }
  }

  return finalSequence;
}

// Generate the 2D boolean QR Matrix (true = black, false = white)
export function generateQrMatrix(text) {
  const safeText = String(text || 'SmartPrint');
  const spec = selectVersion(safeText.length);
  const size = spec.size;

  // Initialize matrix with null (unallocated)
  const matrix = Array.from({ length: size }, () => Array(size).fill(null));
  const isFunction = Array.from({ length: size }, () => Array(size).fill(false));

  const setModule = (r, c, val, func = true) => {
    matrix[r][c] = val;
    if (func) isFunction[r][c] = true;
  };

  // 1. Draw standard 7x7 Finder Patterns at top-left, top-right, bottom-left
  const drawFinder = (top, left) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const isCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        setModule(top + r, left + c, isBorder || isCenter);
      }
    }
    // White separator around finder
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const mr = top + r;
        const mc = left + c;
        if (mr >= 0 && mr < size && mc >= 0 && mc < size) {
          if (matrix[mr][mc] === null) {
            setModule(mr, mc, false);
          }
        }
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // 2. Draw standard Alignment Patterns for version >= 2
  if (spec.alignments.length > 0) {
    const coords = spec.alignments;
    for (const r of coords) {
      for (const c of coords) {
        // Skip finders
        if (
          (r < 9 && c < 9) ||
          (r < 9 && c >= size - 9) ||
          (r >= size - 9 && c < 9)
        ) continue;

        for (let ar = -2; ar <= 2; ar++) {
          for (let ac = -2; ac <= 2; ac++) {
            const isBorder = Math.abs(ar) === 2 || Math.abs(ac) === 2;
            const isCenter = ar === 0 && ac === 0;
            setModule(r + ar, c + ac, isBorder || isCenter);
          }
        }
      }
    }
  }

  // 3. Draw standard Timing Patterns (row 6 and col 6)
  for (let i = 8; i < size - 8; i++) {
    if (matrix[6][i] === null) setModule(6, i, i % 2 === 0);
    if (matrix[i][6] === null) setModule(i, 6, i % 2 === 0);
  }

  // 4. Dark Module
  setModule(4 * spec.version + 9, 8, true);

  // 5. Reserve format information areas
  for (let i = 0; i < 9; i++) {
    if (matrix[8][i] === null) setModule(8, i, false);
    if (matrix[i][8] === null) setModule(i, 8, false);
  }
  for (let i = size - 8; i < size; i++) {
    if (matrix[8][i] === null) setModule(8, i, false);
    if (matrix[i][8] === null) setModule(i, 8, false);
  }

  // 6. Encode data sequence
  const dataBytes = encodeData(safeText, spec);
  const dataBits = [];
  for (const b of dataBytes) {
    for (let i = 7; i >= 0; i--) {
      dataBits.push((b >> i) & 1);
    }
  }

  // 7. Place data bits in standard zigzag 2-column paths (right to left)
  let bitIdx = 0;
  let upward = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--; // Skip vertical timing line

    const rows = [];
    if (upward) {
      for (let r = size - 1; r >= 0; r--) rows.push(r);
    } else {
      for (let r = 0; r < size; r++) rows.push(r);
    }
    upward = !upward;

    for (const r of rows) {
      for (let c = right; c >= right - 1; c--) {
        if (!isFunction[r][c]) {
          const bit = bitIdx < dataBits.length ? dataBits[bitIdx++] : 0;
          matrix[r][c] = bit === 1;
        }
      }
    }
  }

  // 8. Apply standard Mask Pattern 0: (r + c) % 2 === 0
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!isFunction[r][c]) {
        if ((r + c) % 2 === 0) {
          matrix[r][c] = !matrix[r][c];
        }
      }
    }
  }

  // 9. Format Information for EC Level M (00) and Mask 0 (000)
  // Format string: 101010000010010 (BCH 15,5 with mask 101010000010010)
  const formatBits = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];
  // Apply format bits around top-left
  const tlCoords = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
    [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
  ];
  for (let i = 0; i < 15; i++) {
    const [r, c] = tlCoords[i];
    matrix[r][c] = formatBits[i] === 1;
  }

  // Apply format bits around top-right & bottom-left
  for (let i = 0; i < 8; i++) {
    matrix[size - 1 - i][8] = formatBits[i] === 1;
  }
  for (let i = 0; i < 7; i++) {
    matrix[8][size - 7 + i] = formatBits[8 + i] === 1;
  }

  return matrix;
}

// Render normal black-and-white QR code directly onto a Canvas 2D Context
export function drawNormalQrToCanvas(ctx, text, x, y, size) {
  const matrix = generateQrMatrix(text);
  const modCount = matrix.length;
  const modSize = size / modCount;

  // Background white fill
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, size, size);

  // Normal solid black QR modules
  ctx.fillStyle = '#000000';
  for (let r = 0; r < modCount; r++) {
    for (let c = 0; c < modCount; c++) {
      if (matrix[r][c]) {
        // Pixel-crisp module alignment
        const px = Math.round(x + c * modSize);
        const py = Math.round(y + r * modSize);
        const pw = Math.round(x + (c + 1) * modSize) - px;
        const ph = Math.round(y + (r + 1) * modSize) - py;
        ctx.fillRect(px, py, pw, ph);
      }
    }
  }
}

// Generate data URL for an <img> element
export function generateNormalQrDataUrl(text, size = 320) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  drawNormalQrToCanvas(ctx, text, 0, 0, size);
  return canvas.toDataURL('image/png');
}
