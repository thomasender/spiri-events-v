// Quick Firestore prod probe — list recent donors in production.
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const sa = JSON.parse(readFileSync('scripts/service-account.json', 'utf8'));
initializeApp({ credential: cert(sa), projectId: 'spirieventsvbg' });

const db = getFirestore();

const all = await db.collection('donors').orderBy('updatedAt', 'desc').limit(20).get();
console.log(`Found ${all.size} donor docs (most recent first):`);
for (const doc of all.docs) {
  const d = doc.data();
  console.log(JSON.stringify({
    id: doc.id,
    name: d.name ?? null,
    amount: d.amount ?? null,
    source: d.source ?? '(legacy)',
    molliePaymentId: d.molliePaymentId ?? null,
    mollieSubscriptionId: d.mollieSubscriptionId ?? null,
    createdAt: d.createdAt?.toDate?.()?.toISOString?.() ?? d.createdAt,
    updatedAt: d.updatedAt?.toDate?.()?.toISOString?.() ?? d.updatedAt,
  }, null, 2));
}

process.exit(0);
