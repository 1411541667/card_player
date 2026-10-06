// Rasterizes src/launcher-icon.svg into src/launcher-icon.png so that
// scripts/make-launcher-icon.ps1 (System.Drawing) has a bitmap source to build
// the multi-size launcher.ico from.
//
// Run this after editing the SVG, then re-run the ICO generator:
//   node scripts/render-launcher-icon.mjs
//   powershell -ExecutionPolicy Bypass -File scripts/make-launcher-icon.ps1
//
// Uses the Chromium that Playwright already ships for the e2e suite, so no
// extra image dependency is added to the project. Imported from @playwright/test
// because that is the package this project declares (playwright is only a
// transitive dependency).
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svgPath = path.join(root, 'src', 'launcher-icon.svg');
const pngPath = path.join(root, 'src', 'launcher-icon.png');

// 512 keeps the 256px ICO frame crisp and leaves headroom for future sizes.
const SIZE = 512;

const svg = await readFile(svgPath, 'utf8');

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const png = await page.evaluate(
    async ({ svg, size }) => {
      const image = await new Promise((resolve, reject) => {
        const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error('Failed to load launcher icon SVG'));
        element.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      context.clearRect(0, 0, size, size);
      context.drawImage(image, 0, 0, size, size);
      return canvas.toDataURL('image/png').split(',')[1];
    },
    { svg, size: SIZE },
  );
  await writeFile(pngPath, Buffer.from(png, 'base64'));
  console.log(`Rendered ${path.relative(root, pngPath)} (${SIZE}x${SIZE})`);
} finally {
  await browser.close();
}
