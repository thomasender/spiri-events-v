// Shows, sets or clears the launch plan ("launch drip") of ONE regional Instagram account
// in instagram_private/region_<regionId> (server-only doc). Run by Thomas, never by the app.
//
//   node scripts/instagram-region-launch.mjs <regionId> [--show]
//   node scripts/instagram-region-launch.mjs <regionId> --set --start 2026-11-25T12:00+01:00 \
//        [--days 3] [--window 08:00-20:00] [--tz Europe/Berlin] [--dry-run]
//   node scripts/instagram-region-launch.mjs <regionId> --clear [--dry-run]
//
// Set the plan BEFORE switching the account on (--enable in instagram-set-region-account.mjs):
// with a plan, switching on starts no automatic backfill, and before the start the region
// posts nothing. --set refuses a plan that has already started; --clear removes plan and
// progress. Never prints the token. Uses scripts/service-account.json (production).
// Docs: docs/instagram-regions.md
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import {
  LAUNCH_FIELDS,
  buildLaunchPlanFields,
  describeLaunch,
  parseLaunchArgs,
} from './lib/instagramRegionLaunch.mjs';

try {
  const args = parseLaunchArgs(process.argv.slice(2));
  const sa = JSON.parse(readFileSync('scripts/service-account.json', 'utf8'));
  initializeApp({ credential: cert(sa), projectId: 'spirieventsvbg' });
  const ref = getFirestore().doc(`instagram_private/region_${args.regionId}`);
  const snap = await ref.get();

  if (args.action === 'show') {
    console.log(describeLaunch(args.regionId, snap.exists ? snap.data() : null));
  } else if (!snap.exists) {
    throw new Error(
      `instagram_private/region_${args.regionId} existiert nicht; zuerst instagram-set-region-account.mjs ausführen.`
    );
  } else if (args.action === 'set') {
    if (snap.get('launchStartedAt')) {
      throw new Error('Der Launch läuft schon. Erst --clear, dann neu setzen.');
    }
    const fields = buildLaunchPlanFields(args);
    const write = { ...fields, launchStartAt: Timestamp.fromDate(fields.launchStartAt) };
    if (args.dryRun) {
      console.log(
        `Dry run: würde setzen: Start ${fields.launchStartAt.toISOString()}, ${fields.launchDays} Tage, ${fields.launchWindowStart}-${fields.launchWindowEnd} ${fields.launchTimezone}.`
      );
    } else {
      await ref.set(write, { merge: true });
      console.log(describeLaunch(args.regionId, (await ref.get()).data()));
    }
  } else if (args.action === 'clear') {
    if (args.dryRun) {
      console.log(`Dry run: würde ${LAUNCH_FIELDS.join(', ')} entfernen.`);
    } else {
      await ref.update(Object.fromEntries(LAUNCH_FIELDS.map((f) => [f, FieldValue.delete()])));
      console.log(describeLaunch(args.regionId, (await ref.get()).data()));
    }
  }
} catch (err) {
  console.error(`Fehler: ${err instanceof Error ? err.message : 'unbekannt'}`);
  process.exitCode = 1;
}
