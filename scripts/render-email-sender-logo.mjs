import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const svgPath = resolve(repoRoot, 'public/logo-mark.svg');
const pngPath = resolve(repoRoot, 'public/email-sender-logo.png');

const SIZE = 512;

const svgMarkup = await readFile(svgPath, 'utf8');
const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:transparent}
  body{display:flex;align-items:center;justify-content:center;width:${SIZE}px;height:${SIZE}px}
  svg{width:${SIZE}px;height:${SIZE}px;display:block}
</style></head><body>${svgMarkup}</body></html>`;

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: SIZE, height: SIZE },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
await page.setContent(html, { waitUntil: 'load' });
const buffer = await page.locator('svg').screenshot({
  omitBackground: true,
  type: 'png',
});
await writeFile(pngPath, buffer);
await browser.close();

const stats = await import('node:fs').then(({ statSync }) => statSync(pngPath));
console.log(`Wrote ${pngPath} (${stats.size} bytes, ${SIZE}x${SIZE})`);
