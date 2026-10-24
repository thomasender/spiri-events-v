// Stores the Instagram account of ONE region in instagram_private/region_<regionId>
// (server-only doc, firestore.rules denies every client). Run by Thomas, never by the app.
//
//   IG_TOKEN=<long-lived token> node scripts/instagram-set-region-account.mjs <regionId> [--user-id <igUserId>] [--enable|--disable] [--dry-run]
//   pbpaste | node scripts/instagram-set-region-account.mjs <regionId> ...     (token on stdin)
//
// The token is read from the env var IG_TOKEN or stdin, NEVER from argv, and is never
// printed. It is validated with GET /me?fields=user_id,username first; a --user-id that
// does not match the token aborts. expiresAt = now + 60 days. Without --enable/--disable
// a new doc starts disabled (dark launch) and an existing doc keeps its `enabled` value.
// Uses scripts/service-account.json (production), like scripts/instagram-admin.mjs.
// Docs: docs/instagram-regions.md
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import {
  GRAPH_ME_URL,
  assertRegionId,
  buildAccountFields,
  parseArgs,
  parseMeResponse,
} from './lib/instagramRegionAccount.mjs';

async function readToken() {
  const fromEnv = process.env.IG_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  if (process.stdin.isTTY) return '';
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data.trim();
}

try {
  const args = parseArgs(process.argv.slice(2));
  const regionId = assertRegionId(args.regionId);
  const accessToken = await readToken();
  if (!accessToken) {
    throw new Error('Kein Token: IG_TOKEN setzen oder den Token über stdin übergeben.');
  }

  const url = `${GRAPH_ME_URL}?${new URLSearchParams({ fields: 'user_id,username', access_token: accessToken })}`;
  const response = await fetch(url);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    // Never echo the request URL (it contains the token).
    throw new Error(
      `Token-Prüfung fehlgeschlagen (HTTP ${response.status}): ${body?.error?.message ?? response.statusText}`
    );
  }
  const { userId, username } = parseMeResponse(body, args.userId);
  console.log(`Token gültig: @${username || '?'} (user_id ${userId}) für Region "${regionId}".`);

  const sa = JSON.parse(readFileSync('scripts/service-account.json', 'utf8'));
  initializeApp({ credential: cert(sa), projectId: 'spirieventsvbg' });
  const db = getFirestore();
  const ref = db.doc(`instagram_private/region_${regionId}`);
  const existing = await ref.get();

  const fields = buildAccountFields({
    userId,
    accessToken,
    now: new Date(),
    enabled: args.enable ?? (existing.exists ? undefined : false),
  });
  const write = {
    ...fields,
    expiresAt: Timestamp.fromDate(fields.expiresAt),
    refreshedAt: Timestamp.fromDate(fields.refreshedAt),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (args.dryRun) {
    console.log(
      `Dry run: würde instagram_private/region_${regionId} schreiben (Ablauf ${fields.expiresAt.toISOString()}, enabled ${fields.enabled ?? '(unverändert)'}).`
    );
  } else {
    await ref.set(write, { merge: true });
    const enabled = (await ref.get()).get('enabled') === true;
    console.log(
      `Gespeichert. Läuft ab: ${fields.expiresAt.toISOString()}. Region ist ${enabled ? 'AKTIV (Backfill startet bei Wechsel auf aktiv)' : 'noch AUS (mit --enable einschalten)'}.`
    );
  }
} catch (err) {
  console.error(`Fehler: ${err instanceof Error ? err.message : 'unbekannt'}`);
  process.exitCode = 1;
}
