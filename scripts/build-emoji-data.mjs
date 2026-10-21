// Builds src/data/emojiIndex.json, the search index of the chat emoji picker
// (German names and keywords plus :shortcodes), from the emojibase-data dev
// dependency. Commit the result; run it again after updating emojibase-data:
//   npm run emoji:build
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = dirname(require.resolve('emojibase-data/de/compact.json'));
const read = (rel) => JSON.parse(readFileSync(resolve(root, '..', rel), 'utf8'));

const de = read('de/compact.json');
const github = read('en/shortcodes/github.json');
const cldrDe = read('de/shortcodes/cldr.json');

const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);

// Entries without a group are skin-tone / hair components, not emoji to pick.
const entries = de
  .filter((e) => e.group !== undefined)
  .sort((a, b) => a.order - b.order)
  .map((e) => {
    const codes = [...new Set([...asList(github[e.hexcode]), ...asList(cldrDe[e.hexcode])])];
    return [e.unicode, e.label, e.tags ?? [], codes];
  });

const out = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src/data/emojiIndex.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(entries));
console.log(`Wrote ${entries.length} emoji to ${out}`);
