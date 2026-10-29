#!/usr/bin/env node
// One-off import of the Mollie payment history into the income/expense ledger
// (admin tab "Finanzen", collection `ledger`) in PRODUCTION.
//
// Uses the very same booking logic as the live webhook (recordLedgerIncome):
// one doc per payment with id `mollie_<paymentId>`, create-only. So it is safe
// to run twice, it never overwrites an entry an admin edited, and it skips what
// the webhook already booked. Refunds and chargebacks are netted off.
//
//   MOLLIE_API_KEY=live_xxx node scripts/import-mollie-ledger.cjs          # dry run
//   MOLLIE_API_KEY=live_xxx node scripts/import-mollie-ledger.cjs --apply  # write
//
// Needs scripts/service-account.json (like the other prod scripts) and a fresh
// `npm --prefix functions run build` (it loads functions/lib). CommonJS on
// purpose: firebase-admin does not load cleanly under ESM here.
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { createRequire } = require('node:module');

const ROOT = join(__dirname, '..');
const MOLLIE_PAYMENTS_URL = 'https://api.mollie.com/v2/payments?limit=250';

async function fetchAllPayments(apiKey, fetchImpl = fetch) {
  const payments = [];
  let url = MOLLIE_PAYMENTS_URL;
  while (url) {
    const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok)
      throw new Error(`Mollie answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = await res.json();
    payments.push(...(body._embedded?.payments ?? []));
    url = body._links?.next?.href ?? null;
  }
  return payments;
}

// Wraps the real db: reads pass through, writes are only logged in a dry run.
function dryRunDb(db, planned) {
  return {
    collection: (name) => {
      const col = db.collection(name);
      return {
        doc: (id) => {
          const ref = col.doc(id);
          return {
            get: () => ref.get(),
            set: async (data) => {
              planned.push({ id, data });
            },
          };
        },
        orderBy: (...args) => col.orderBy(...args),
      };
    },
  };
}

async function importPayments({ payments, db, apply, recordLedgerIncome }) {
  const planned = [];
  const target = apply ? db : dryRunDb(db, planned);
  const summary = { total: payments.length, booked: 0, skipped: {}, sum: 0, adjusted: [] };
  // Oldest first, so the log reads like the books.
  const sorted = [...payments].sort((a, b) =>
    String(a.paidAt ?? a.createdAt).localeCompare(String(b.paidAt ?? b.createdAt))
  );
  for (const original of sorted) {
    // Net of refunds and chargebacks: a fully refunded payment drops out
    // (recordLedgerIncome skips amounts <= 0), a partly refunded one is booked
    // with what is left.
    const gross = Number(original.amount?.value ?? 0);
    const refunded = Number(original.amountRefunded?.value ?? 0);
    const charged = Number(original.amountChargedBack?.value ?? 0);
    const net = Math.round((gross - refunded - charged) * 100) / 100;
    const payment = { ...original, amount: { ...original.amount, value: net.toFixed(2) } };
    const result = await recordLedgerIncome({
      db: target,
      payment,
      onError: (err) => console.error(`  ! ${payment.id}:`, err),
    });
    if (result.written) {
      summary.booked += 1;
      summary.sum += net;
      if (net !== gross) summary.adjusted.push({ id: payment.id, gross, net });
    } else {
      const reason =
        result.reason === 'no-amount' && gross > 0
          ? 'fully-refunded'
          : (result.reason ?? 'unknown');
      summary.skipped[reason] = (summary.skipped[reason] ?? 0) + 1;
    }
  }
  return { summary, planned };
}

// Resolved from functions/, so functions/node_modules wins and the hoisted root
// copy is the fallback. Package-name require, because of firebase-admin's `exports`.
function requireAdmin(sub) {
  return createRequire(join(ROOT, 'functions', 'package.json'))(`firebase-admin/${sub}`);
}

async function main() {
  const apply = process.argv.includes('--apply');
  const apiKey = process.env.MOLLIE_API_KEY;
  if (!apiKey) throw new Error('MOLLIE_API_KEY is not set.');
  if (apiKey.startsWith('test_'))
    throw new Error('This is a TEST key: the live history needs the live_ key.');

  const { initializeApp, cert } = requireAdmin('app');
  const { getFirestore } = requireAdmin('firestore');
  const { recordLedgerIncome } = require(join(ROOT, 'functions/lib/mollieWebhookLogic.js'));
  const sa = JSON.parse(readFileSync(join(ROOT, 'scripts/service-account.json'), 'utf8'));
  initializeApp({ credential: cert(sa), projectId: sa.project_id });
  console.log(`Project: ${sa.project_id} · ${apply ? 'APPLY (writes)' : 'dry run (no writes)'}`);

  const payments = await fetchAllPayments(apiKey);
  const { summary, planned } = await importPayments({
    payments,
    db: getFirestore(),
    apply,
    recordLedgerIncome,
  });

  for (const { id, data } of planned) {
    console.log(
      `  + ${data.date}  ${String(data.amount).padStart(8)} €  ${data.description}  [${id}]`
    );
  }
  console.log(`\nMollie payments read: ${summary.total}`);
  console.log(
    `${apply ? 'Booked' : 'Would book'}: ${summary.booked} · ${summary.sum.toFixed(2)} € gross`
  );
  console.log('Skipped:', summary.skipped);
  if (summary.adjusted.length) {
    console.log('Booked net of a partial refund / chargeback:');
    for (const r of summary.adjusted) console.log('  ', r);
  }
  if (!apply) console.log('\nNothing written. Run again with --apply to book.');
}

module.exports = { fetchAllPayments, importPayments, dryRunDb };

if (require.main === module) {
  main().then(
    () => process.exit(0),
    (err) => {
      console.error(err.message ?? err);
      process.exit(1);
    }
  );
}
