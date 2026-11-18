// Prints the event import's outreach mail (functions/src/importOutreachMail.ts)
// with sample data, for review. Sends nothing, touches no Firebase project.
//
//   node scripts/render-import-outreach-mail.mjs          plain text
//   node scripts/render-import-outreach-mail.mjs --html   HTML
//   node scripts/render-import-outreach-mail.mjs --test   with the "[TEST]" subject
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));

// The module is TypeScript (and imports other functions modules): bundle it in memory.
const result = await build({
  entryPoints: [resolve(root, 'functions/src/importOutreachMail.ts')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent',
});
const code = result.outputFiles[0].text;
const { renderOutreachMail, IMPORT_RETENTION_DAYS } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
);

const now = new Date('2026-11-18T10:00:00Z');
const day = 24 * 60 * 60 * 1000;
const origin = 'https://tribe-vbg-staging.web.app';
const token = 'BEISPIEL_TOKEN_0123456789abcdefghijklmnopq';
const mail = renderOutreachMail({
  to: 'info@yoga-beispiel.at',
  organizerName: 'Yogaverein Beispiel',
  website: 'https://www.yoga-beispiel.at',
  contactEmail: 'info@yoga-beispiel.at',
  regionName: 'Tirol',
  events: [
    { title: 'Kakaozeremonie', date: '2026-12-05', link: 'https://www.yoga-beispiel.at/kakao' },
    { title: 'Yin Yoga am Abend', date: '2026-12-12', link: 'https://www.yoga-beispiel.at/yin' },
  ],
  previewUrl: `${origin}/vorschau/import/${token}`,
  declineUrl: `${origin}/vorschau/import/${token}?aktion=ablehnen`,
  privacyUrl: `${origin}/datenschutz-import`,
  linkValidUntil: new Date(now.getTime() + 7 * day).toISOString(),
  deleteAfter: new Date(now.getTime() + IMPORT_RETENTION_DAYS * day).toISOString(),
  test: args.has('--test'),
});

console.log(`An: ${mail.to}`);
console.log(`Betreff: ${mail.subject}`);
console.log('');
console.log(args.has('--html') ? mail.html : mail.text);
