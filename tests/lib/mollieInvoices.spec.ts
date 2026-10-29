import { describe, it, expect, vi } from 'vitest';
import {
  fetchAllInvoices,
  invoicePeriodLabel,
  ledgerIdForInvoice,
  recordLedgerExpenseFromInvoice,
  syncInvoicesToLedger,
} from '../../functions/src/mollieInvoicesLogic';

function makeDb(existing: Record<string, unknown> = {}) {
  const writes: Array<{ id: string; data: Record<string, unknown> }> = [];
  const db = {
    collection: (name: string) => {
      if (name !== 'ledger') throw new Error(`unexpected collection ${name}`);
      return {
        doc: (id: string) => ({
          async get() {
            return { exists: id in existing, get: () => undefined };
          },
          async set(data: Record<string, unknown>) {
            writes.push({ id, data });
          },
        }),
        orderBy: () => ({ get: async () => ({ exists: false, docs: [], get: () => undefined }) }),
      };
    },
  };
  return { db, writes };
}

const invoice = (over = {}) => ({
  id: 'inv_1',
  reference: 'MOL-NL-R2026.0001',
  status: 'paid',
  issuedAt: '2026-09-30',
  grossAmount: { value: '2.20', currency: 'EUR' },
  lines: [{ period: '2026-09' }, { period: '2026-09' }],
  ...over,
});

describe('recordLedgerExpenseFromInvoice', () => {
  it('books the gross amount as an expense on the issue date', async () => {
    const { db, writes } = makeDb();
    const r = await recordLedgerExpenseFromInvoice({ db, invoice: invoice() });
    expect(r.written).toBe(true);
    expect(writes[0].id).toBe(ledgerIdForInvoice('inv_1'));
    expect(writes[0].data).toMatchObject({
      type: 'expense',
      date: '2026-09-30',
      amount: 2.2,
      description: 'Mollie-Gebühren 09/2026',
      category: 'Gebühren',
      note: 'Rechnung MOL-NL-R2026.0001',
      source: 'mollie',
      mollieInvoiceId: 'inv_1',
    });
  });

  it('books open and overdue invoices too (the cost is incurred)', async () => {
    const { db, writes } = makeDb();
    await recordLedgerExpenseFromInvoice({ db, invoice: invoice({ status: 'open' }) });
    expect(writes).toHaveLength(1);
  });

  it('never overwrites an existing (possibly edited) entry', async () => {
    const { db, writes } = makeDb({ [ledgerIdForInvoice('inv_1')]: {} });
    const r = await recordLedgerExpenseFromInvoice({ db, invoice: invoice() });
    expect(r).toEqual({ written: false, reason: 'exists' });
    expect(writes).toHaveLength(0);
  });

  it.each([
    ['wrong currency', { grossAmount: { value: '2.20', currency: 'USD' } }, 'wrong-currency'],
    ['zero amount', { grossAmount: { value: '0.00', currency: 'EUR' } }, 'no-amount'],
    ['junk amount', { grossAmount: { value: 'x', currency: 'EUR' } }, 'no-amount'],
    ['missing date', { issuedAt: null }, 'no-date'],
  ])('skips %s', async (_label, patch, reason) => {
    const { db, writes } = makeDb();
    const r = await recordLedgerExpenseFromInvoice({ db, invoice: invoice(patch) });
    expect(r).toEqual({ written: false, reason });
    expect(writes).toHaveLength(0);
  });
});

describe('invoicePeriodLabel', () => {
  it('joins several periods and falls back to the issue month', () => {
    expect(
      invoicePeriodLabel(invoice({ lines: [{ period: '2026-10' }, { period: '2026-09' }] }))
    ).toBe('09/2026, 10/2026');
    expect(invoicePeriodLabel(invoice({ lines: [] }))).toBe('09/2026');
  });
});

describe('syncInvoicesToLedger', () => {
  it('books the missing ones oldest first and is idempotent', async () => {
    const { db, writes } = makeDb({ [ledgerIdForInvoice('inv_old')]: {} });
    const summary = await syncInvoicesToLedger({
      db,
      invoices: [
        invoice({ id: 'inv_new', issuedAt: '2026-10-31' }),
        invoice({ id: 'inv_old', issuedAt: '2026-08-31' }),
        invoice({ id: 'inv_mid', issuedAt: '2026-09-30' }),
      ],
    });
    expect(summary).toEqual({ total: 3, booked: 2, skipped: { exists: 1 } });
    expect(writes.map((w) => w.id)).toEqual([
      ledgerIdForInvoice('inv_mid'),
      ledgerIdForInvoice('inv_new'),
    ]);
  });
});

describe('fetchAllInvoices', () => {
  it('follows the pagination and sends the token', async () => {
    const pages = [
      {
        _embedded: { invoices: [invoice({ id: 'a' })] },
        _links: { next: { href: 'https://x/2' } },
      },
      { _embedded: { invoices: [invoice({ id: 'b' })] }, _links: { next: null } },
    ];
    let i = 0;
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => pages[i++] }));
    const all = await fetchAllInvoices('tok', fetchImpl as unknown as typeof fetch);
    expect(all.map((x) => x.id)).toEqual(['a', 'b']);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][1]).toEqual({ headers: { Authorization: 'Bearer tok' } });
  });

  it('throws on a refused token so the caller can alert', async () => {
    const fetchImpl = async () => ({ ok: false, status: 403, text: async () => 'Forbidden' });
    await expect(fetchAllInvoices('tok', fetchImpl as unknown as typeof fetch)).rejects.toThrow(
      /403/
    );
  });
});
