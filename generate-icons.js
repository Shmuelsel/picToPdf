/**
 * Generates PWA icons (192×192 and 512×512 PNG) using only pngjs.
 * Run once:  node generate-icons.js
 */

'use strict';
const fs   = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const ACC = [0, 200, 150];   // #00C896 teal
const BG  = [13, 13, 13];    // #0d0d0d
const DOC = [28, 28, 30];    // #1c1c1e

function buildIcon(size, maskable) {
  const png = new PNG({ width: size, height: size, filterType: -1 });
  const s   = size;

  // Key layout dimensions
  const pad  = maskable ? Math.floor(s * 0.12) : 0;
  const bx1  = pad + Math.floor(s * 0.08);
  const by1  = pad + Math.floor(s * 0.08);
  const bx2  = s - bx1;
  const by2  = s - by1;
  const bl   = Math.floor(s * 0.12);          // bracket arm length
  const bt   = Math.max(3, Math.floor(s * 0.025)); // bracket thickness
  const dX1  = pad + Math.floor(s * 0.27);
  const dX2  = s - dX1;
  const dY1  = pad + Math.floor(s * 0.19);
  const dY2  = s - pad - Math.floor(s * 0.20);
  const scanY = Math.floor((dY1 + dY2) / 2);
  const scanH = Math.max(2, Math.floor(s * 0.009));

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const idx = (s * y + x) << 2;  // * 4

      let r = BG[0], g = BG[1], b = BG[2], a = 255;

      // Document body
      if (x > dX1 && x < dX2 && y > dY1 && y < dY2) {
        [r, g, b] = DOC;
      }

      // Text line stubs inside document
      const lX1 = dX1 + Math.floor(s * 0.06);
      const lH  = Math.max(2, Math.floor(s * 0.038));
      const lG  = Math.floor(s * 0.048);
      const lW1 = Math.floor((dX2 - dX1) * 0.58);
      const lW2 = Math.floor((dX2 - dX1) * 0.40);
      for (let i = 0; i < 7; i++) {
        if (i === 4) continue; // gap
        const lY = dY1 + Math.floor(s * 0.12) + i * lG;
        const lW = (i % 3 === 2) ? lW2 : lW1;
        if (x >= lX1 && x < lX1 + lW && y >= lY && y < lY + lH) {
          r = 58; g = 58; b = 62;
        }
      }

      // Scan line (accent)
      if (x > dX1 + 4 && x < dX2 - 4 && y >= scanY && y < scanY + scanH) {
        [r, g, b] = ACC;
      }

      // Corner brackets
      const inTL =
        (x >= bx1 && x < bx1 + bl && y >= by1 && y < by1 + bt) ||
        (x >= bx1 && x < bx1 + bt && y >= by1 && y < by1 + bl);
      const inTR =
        (x >= bx2 - bl && x < bx2 && y >= by1 && y < by1 + bt) ||
        (x >= bx2 - bt && x < bx2 && y >= by1 && y < by1 + bl);
      const inBL =
        (x >= bx1 && x < bx1 + bl && y >= by2 - bt && y < by2) ||
        (x >= bx1 && x < bx1 + bt && y >= by2 - bl && y < by2);
      const inBR =
        (x >= bx2 - bl && x < bx2 && y >= by2 - bt && y < by2) ||
        (x >= bx2 - bt && x < bx2 && y >= by2 - bl && y < by2);

      if (inTL || inTR || inBL || inBR) [r, g, b] = ACC;

      png.data[idx]     = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = a;
    }
  }

  return PNG.sync.write(png);
}

// ── Run ───────────────────────────────────────────────────────────────────────
const outDir = path.join(__dirname, 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });

console.log('Generating PWA icons…');

[
  { file: 'icon-192.png',      size: 192, maskable: false },
  { file: 'icon-512.png',      size: 512, maskable: false },
  { file: 'icon-maskable.png', size: 512, maskable: true  },
].forEach(({ file, size, maskable }) => {
  const buf  = buildIcon(size, maskable);
  fs.writeFileSync(path.join(outDir, file), buf);
  console.log(`  ✓ ${file}  (${size}×${size}${maskable ? ', maskable' : ''})`);
});

console.log('\nDone! Icons saved to public/icons/');
