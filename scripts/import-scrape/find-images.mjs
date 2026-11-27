#!/usr/bin/env node
// Adds the picture link of each import candidate (docs/event-import.md, "Manual scraping").
//
//   node scripts/import-scrape/find-images.mjs --region berlin --project spirieventsvbg --allow-prod
//        dry run: lists what it would write
//   ... --organizer <id>   only the candidates of this import organizer
//   ... --apply        writes `imageUrl` on the candidates
//
// For each candidate without `imageUrl` the page of the event (`link`, else `sourceUrl`) is read politely
// (robots.txt, 6 s per host); og:image / twitter:image / the Event's JSON-LD image is taken, but ONLY when
// it is a URL on the organizer's own domain (isImageUrlAllowed). The link is only a link: nothing is
// downloaded or copied before the organizer consents (then `copyConsentedImages`, see the docs).
import { politeFetch } from './polite-fetch.mjs';
import { extractImageUrls } from '../../src/utils/importScrape.js';
import { isImageUrlAllowed } from '../../src/utils/eventImportServer.js';
import { IMPORT_CANDIDATES } from '../../src/utils/eventImport.js';
import { PROD_PROJECT_ID, STAGING_PROJECT_ID } from '../../src/utils/projectTargets.js';
import { createAdminRestClient, toFirestoreFields } from '../lib/adminRest.mjs';

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const region = arg('--region');
const projectId = arg('--project') ?? STAGING_PROJECT_ID;
const organizer = arg('--organizer');
const apply = args.includes('--apply');
if (!region) {
  console.error(
    'Usage: node scripts/import-scrape/find-images.mjs --region <id> [--organizer <id>] [--project tribe-vbg-staging | --project spirieventsvbg --allow-prod] [--apply]'
  );
  process.exit(2);
}
if (projectId === PROD_PROJECT_ID && !args.includes('--allow-prod')) {
  console.error('Production only with --allow-prod.');
  process.exit(2);
}
if (projectId !== PROD_PROJECT_ID && projectId !== STAGING_PROJECT_ID) {
  console.error(`Project "${projectId}" refused.`);
  process.exit(2);
}

const client = await createAdminRestClient({
  target: projectId === PROD_PROJECT_ID ? 'production' : 'staging',
  projectId,
});
console.log(`Ziel: ${projectId}${apply ? ' (schreibt)' : ' (Probelauf)'}, Region ${region}`);

const candidates = (await client.queryEqual(IMPORT_CANDIDATES, 'regionId', region)).filter(
  (d) =>
    d.data.status !== 'rejected' &&
    !d.data.imageUrl &&
    (!organizer || d.data.organizerRef === organizer)
);
const pages = new Map();
let found = 0;
for (const c of candidates) {
  const pageUrl = c.data.rawExtract?.link || c.data.sourceUrl;
  if (!pages.has(pageUrl)) {
    const r = await politeFetch(pageUrl);
    pages.set(pageUrl, r.ok ? extractImageUrls(r.body, r.url) : { error: r.reason });
  }
  const res = pages.get(pageUrl);
  const title = `${c.data.rawExtract?.date} ${String(c.data.rawExtract?.title).slice(0, 40)}`;
  if (res.error) {
    console.log(`—  ${title}: Seite nicht lesbar (${res.error})`);
    continue;
  }
  // allowed = on the organizer's own domain (judged against the page it was found on)
  const url = res.find(
    (u) => isImageUrlAllowed(u, c.data.sourceUrl) || isImageUrlAllowed(u, pageUrl)
  );
  if (!url) {
    console.log(
      `—  ${title}: kein eigenes Bild gefunden${res.length ? ` (nur Fremdhost: ${new URL(res[0]).host})` : ''}`
    );
    continue;
  }
  found += 1;
  console.log(`✓  ${title}: ${url}`);
  if (apply) {
    await client.commit([
      {
        update: {
          name: `${IMPORT_CANDIDATES}/${c.id}`,
          fields: toFirestoreFields({ imageUrl: url }),
        },
        updateMask: { fieldPaths: ['imageUrl'] },
      },
    ]);
  }
}
console.log(
  `\n${found} von ${candidates.length} Kandidaten mit Bild-Link${apply ? ' (geschrieben)' : ''}`
);
