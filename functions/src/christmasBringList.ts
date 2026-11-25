/**
 * Anonymous "what is already being brought" list of the Weihnachtsfeier page.
 *
 * Registrations (`site_pages/weihnachtsfeier/registrations/*`) are readable by
 * admins only. This trigger rebuilds `site_pages/weihnachtsfeier/summary/bring`
 * = { items: [{ label, count }] } after every registration change, so the public
 * page can show what is covered without ever exposing names or contacts. The
 * summary doc is written only here (Admin SDK); the rules forbid client writes.
 */
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  initializeApp();
}

export interface BringItem {
  label: string;
  count: number;
}

/** Counts items case-insensitively (first spelling wins), most often first. */
export function buildBringSummary(registrations: Array<{ bring?: unknown }>): BringItem[] {
  const counts = new Map<string, BringItem>();
  for (const reg of registrations) {
    if (!Array.isArray(reg.bring)) continue;
    for (const raw of reg.bring) {
      if (typeof raw !== 'string') continue;
      const label = raw.trim().slice(0, 80);
      if (!label) continue;
      const key = label.toLowerCase();
      const entry = counts.get(key) ?? { label, count: 0 };
      entry.count += 1;
      counts.set(key, entry);
    }
  }
  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label, 'de')
  );
}

export const onChristmasRegistrationWritten = onDocumentWritten(
  { region: 'europe-west3', document: 'site_pages/weihnachtsfeier/registrations/{regId}' },
  async () => {
    const db = getFirestore();
    const snap = await db.collection('site_pages/weihnachtsfeier/registrations').get();
    const items = buildBringSummary(snap.docs.map((d) => d.data()));
    await db
      .doc('site_pages/weihnachtsfeier/summary/bring')
      .set({ items, updatedAt: FieldValue.serverTimestamp() });
  }
);
