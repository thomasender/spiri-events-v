#!/usr/bin/env node
/**
 * Verifies the mollieWebhook Cloud Function end-to-end against the
 * Firebase Functions emulator (or, with --production, against the
 * deployed cloud function).
 *
 * Builds a realistic Next-gen `payment.paid` event envelope with a
 * consent-cleared donor, signs the body with HMAC-SHA256, POSTs it
 * to the webhook URL, then waits for the corresponding donor
 * document to land in the Firestore emulator / production project.
 *
 * Usage:
 *   # Local emulator
 *   MOLLIE_WEBHOOK_SIGNING_SECRET=mysecret \
 *     node scripts/verify-mollie-webhook.mjs
 *
 *   # Production (careful: actually creates a donor entry)
 *   MOLLIE_WEBHOOK_SIGNING_SECRET=<secret-from-mollie> \
 *     node scripts/verify-mollie-webhook.mjs --production
 */

import { createHmac } from 'node:crypto';
import process from 'node:process';
import { setTimeout as wait } from 'node:timers/promises';
import {
  initializeApp,
  applicationDefault,
  cert,
} from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'spirieventsvbg';
const PRODUCTION_URL = 'https://europe-west3-spirieventsvbg.cloudfunctions.net/mollieWebhook';
const EMULATOR_URL = `http://127.0.0.1:5001/${PROJECT_ID}/europe-west3/mollieWebhook`;

const args = new Set(process.argv.slice(2));
const useProduction = args.has('--production');
const url = useProduction ? PRODUCTION_URL : EMULATOR_URL;
const secret = process.env.MOLLIE_WEBHOOK_SIGNING_SECRET;
if (!secret) {
  console.error('MOLLIE_WEBHOOK_SIGNING_SECRET is not set');
  process.exit(1);
}

// Use a unique payment id each run so the donor doc doesn't collide with a
// previous verification attempt.
const paymentId = `tr_verify_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
const donorName = `Verify Bot ${new Date().toISOString().slice(0, 16)}`;
const amountEUR = '7.50';

// Build the JSON the same way the server-side `JSON.stringify(...)` round-trip
// from `req.body` would produce. The server re-stringifies the parsed body
// for signature verification (Firebase v2 body-parser consumes the raw
// stream), so the signature must be computed against that canonical form.
const body = JSON.stringify(
  JSON.parse(
    JSON.stringify({
      resource: 'event',
      id: `event_${paymentId}`,
      type: 'payment.paid',
      entityId: paymentId,
      createdAt: new Date().toISOString(),
      _embedded: {
        entity: {
          id: paymentId,
          status: 'paid',
          amount: { currency: 'EUR', value: amountEUR },
          description: 'Einmalige Spende tribe Vorarlberg',
          metadata: {
            displayOnConsent: true,
            donorName,
          },
          createdAt: new Date().toISOString(),
          paidAt: new Date().toISOString(),
          sequenceType: 'one-off',
          subscriptionId: null,
        },
      },
    })
  )
);

const signature = createHmac('sha256', secret).update(body).digest('hex');

console.log(`POST ${url}`);
console.log(`paymentId: ${paymentId}`);
console.log(`signature: sha256=${signature.slice(0, 16)}…\n`);

const response = await fetch(url, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-mollie-signature': `sha256=${signature}`,
  },
  body,
});

console.log(`response: ${response.status} ${response.statusText}`);
const responseBody = await response.text();
console.log(`body: ${responseBody}\n`);

if (response.status !== 200) {
  console.error(`Webhook returned ${response.status} — signature rejected or handler errored.`);
  process.exit(1);
}

// Try to find the donor doc. In production we need a service account;
// in the emulator we use the well-known local project.
try {
  if (useProduction) {
    try {
      const { readFileSync } = await import('node:fs');
      const sa = JSON.parse(readFileSync('scripts/service-account.json', 'utf8'));
      initializeApp({ credential: cert(sa), projectId: PROJECT_ID });
    } catch (e) {
      console.warn(
        'No service-account.json found — skipping Firestore verification.',
        e.message
      );
      process.exit(0);
    }
  } else {
    initializeApp({ projectId: PROJECT_ID });
    // Point Firestore at the emulator when in --local mode.
    process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8181';
  }

  const db = getFirestore();
  const ref = db.collection('donors').doc(`donor_mollie_${paymentId}`);

  let attempt = 0;
  let snapshot;
  while (attempt < 10) {
    snapshot = await ref.get();
    if (snapshot.exists) break;
    await wait(500);
    attempt += 1;
  }

  if (!snapshot || !snapshot.exists) {
    console.error('Donor doc was NOT created within 5s — webhook succeeded but write did not happen.');
    process.exit(1);
  }

  const data = snapshot.data();
  console.log('donor doc written:');
  console.log(JSON.stringify(data, null, 2));

  if (data.source !== 'mollie' || data.name !== donorName || Number(data.amount) !== 7.5) {
    console.error('Donor doc has unexpected fields.');
    process.exit(1);
  }

  console.log('\nVerification PASSED.');
  process.exit(0);
} catch (err) {
  console.error('Verification failed unexpectedly:', err);
  process.exit(1);
}
