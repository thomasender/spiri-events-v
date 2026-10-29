/**
 * Mollie fees -> ledger (admin tab "Finanzen"). Mollie bills its fees monthly
 * as invoices; each invoice becomes one expense entry with the id
 * `mollie_invoice_<invoiceId>`. Pure logic, shared by the scheduled function
 * (mollieInvoices.ts), the import script and the Vitest specs.
 *
 * Needs the read-only organization access token (invoices.read): the normal
 * API key cannot read invoices.
 */

import { LEDGER_COLLECTION, MOLLIE_DONATION_CURRENCY } from './mollieWebhookLogic';
import type { FirestoreLikeDb } from './mollieWebhookLogic';

export const MOLLIE_INVOICES_URL = 'https://api.mollie.com/v2/invoices?limit=250';
export const MOLLIE_FEES_CATEGORY = 'Gebühren';

export interface MollieInvoice {
  id: string;
  reference?: string | null;
  status?: string | null;
  issuedAt?: string | null;
  grossAmount?: { value?: string; currency?: string };
  lines?: Array<{ period?: string | null }>;
}

export function ledgerIdForInvoice(invoiceId: string): string {
  return `mollie_invoice_${invoiceId}`;
}

/** "2026-09" -> "09/2026"; several periods are joined, none falls back to the issue month. */
export function invoicePeriodLabel(invoice: MollieInvoice): string {
  const periods = new Set<string>();
  for (const line of invoice.lines ?? []) {
    if (typeof line.period === 'string' && /^\d{4}-\d{2}$/.test(line.period)) {
      periods.add(line.period);
    }
  }
  if (periods.size === 0 && /^\d{4}-\d{2}/.test(invoice.issuedAt ?? '')) {
    periods.add((invoice.issuedAt as string).slice(0, 7));
  }
  return [...periods]
    .sort()
    .map((p) => `${p.slice(5)}/${p.slice(0, 4)}`)
    .join(', ');
}

/**
 * Books one Mollie invoice as an expense (gross amount). Create-only, so an
 * entry an admin edited is never overwritten. Throws on a database error
 * (the caller decides), returns why nothing was written otherwise.
 */
export async function recordLedgerExpenseFromInvoice({
  db,
  invoice,
  now = () => new Date(),
}: {
  db: FirestoreLikeDb;
  invoice: MollieInvoice;
  now?: () => Date;
}): Promise<{ written: boolean; reason?: string }> {
  if (!invoice.id) return { written: false, reason: 'no-id' };
  if (invoice.grossAmount?.currency !== MOLLIE_DONATION_CURRENCY) {
    return { written: false, reason: 'wrong-currency' };
  }
  const amount = Math.round(Number(invoice.grossAmount?.value) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return { written: false, reason: 'no-amount' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(invoice.issuedAt ?? '')) {
    return { written: false, reason: 'no-date' };
  }

  const ref = db.collection(LEDGER_COLLECTION).doc(ledgerIdForInvoice(invoice.id));
  if ((await ref.get()).exists) return { written: false, reason: 'exists' };

  const period = invoicePeriodLabel(invoice);
  const timestamp = now();
  await ref.set(
    {
      type: 'expense',
      date: invoice.issuedAt,
      amount,
      description: `Mollie-Gebühren ${period}`.trim(),
      category: MOLLIE_FEES_CATEGORY,
      note: invoice.reference ? `Rechnung ${invoice.reference}` : null,
      source: 'mollie',
      mollieInvoiceId: invoice.id,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    { merge: false }
  );
  return { written: true };
}

export async function fetchAllInvoices(
  token: string,
  fetchImpl: typeof fetch = fetch
): Promise<MollieInvoice[]> {
  const invoices: MollieInvoice[] = [];
  let url: string | null = MOLLIE_INVOICES_URL;
  while (url) {
    const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      throw new Error(
        `Mollie invoices answered ${res.status}: ${(await res.text()).slice(0, 200)}`
      );
    }
    const body = (await res.json()) as {
      _embedded?: { invoices?: MollieInvoice[] };
      _links?: { next?: { href?: string } | null };
    };
    invoices.push(...(body._embedded?.invoices ?? []));
    url = body._links?.next?.href ?? null;
  }
  return invoices;
}

export interface InvoiceSyncSummary {
  total: number;
  booked: number;
  skipped: Record<string, number>;
}

/** Books every invoice that is not in the ledger yet. Idempotent. */
export async function syncInvoicesToLedger({
  db,
  invoices,
  now,
}: {
  db: FirestoreLikeDb;
  invoices: MollieInvoice[];
  now?: () => Date;
}): Promise<InvoiceSyncSummary> {
  const summary: InvoiceSyncSummary = { total: invoices.length, booked: 0, skipped: {} };
  const oldestFirst = [...invoices].sort((a, b) =>
    String(a.issuedAt ?? '').localeCompare(String(b.issuedAt ?? ''))
  );
  for (const invoice of oldestFirst) {
    const result = await recordLedgerExpenseFromInvoice({ db, invoice, now });
    if (result.written) summary.booked += 1;
    else {
      const reason = result.reason ?? 'unknown';
      summary.skipped[reason] = (summary.skipped[reason] ?? 0) + 1;
    }
  }
  return summary;
}
