// Writes the Canva kit for the Instagram templates: per template one example
// (with sample text + photo) and one text-free layer file.
// Uses public/hero.jpeg as sample photo. Reads/posts nothing.
//
//   npm --prefix functions run build
//   node scripts/instagram-canva-kit.mjs [outDir]   (default: ./tmp-canva-kit)
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const {
  KIT_TEMPLATES,
  renderKitTemplate,
} = require('../functions/lib/instagram/instagramCanvaKit');

const outDir = process.argv[2] ?? 'tmp-canva-kit';
mkdirSync(outDir, { recursive: true });
const photo = readFileSync('public/hero.jpeg');

for (const t of KIT_TEMPLATES) {
  const { example, layers } = await renderKitTemplate(t, photo);
  writeFileSync(`${outDir}/${t.id}_beispiel.jpg`, example);
  writeFileSync(`${outDir}/${t.id}_ohne-text.png`, layers);
  console.log('geschrieben:', t.id);
}
