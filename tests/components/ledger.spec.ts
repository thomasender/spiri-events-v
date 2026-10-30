import { describe, it, expect } from 'vitest';
import {
  parseLedgerAmount,
  validateLedgerFields,
  ledgerTotals,
  ledgerYears,
  entriesOfYear,
  sortLedger,
  ledgerToCsv,
  formatLedgerDate,
  formatLedgerAmount,
} from '../../src/utils/ledger';

describe('parseLedgerAmount', () => {
  it('reads German and plain notation', () => {
    expect(parseLedgerAmount('12,50')).toBe(12.5);
    expect(parseLedgerAmount('1.234,50 €')).toBe(1234.5);
    expect(parseLedgerAmount('12.5')).toBe(12.5);
    expect(parseLedgerAmount(7)).toBe(7);
  });
  it('rejects junk', () => {
    expect(parseLedgerAmount('')).toBeNull();
    expect(parseLedgerAmount('abc')).toBeNull();
    expect(parseLedgerAmount('1,2,3')).toBeNull();
    expect(parseLedgerAmount('-5')).toBeNull();
  });
});

describe('validateLedgerFields', () => {
  const ok = { type: 'expense', date: '2026-10-29', amount: '12,5', description: ' Miete ' };
  it('normalises valid input', () => {
    expect(validateLedgerFields({ ...ok, category: ' ', note: '' })).toEqual({
      type: 'expense',
      date: '2026-10-29',
      amount: 12.5,
      description: 'Miete',
      category: null,
      note: null,
    });
  });
  it.each([
    [{ type: 'x' }, /Einnahme oder Ausgabe/],
    [{ date: '2026-02-31' }, /Datum/],
    [{ date: '29.10.2026' }, /Datum/],
    [{ amount: '0' }, /Betrag/],
    [{ amount: '' }, /Betrag/],
    [{ description: '  ' }, /Beschreibung/],
  ])('rejects %j', (patch, message) => {
    expect(() => validateLedgerFields({ ...ok, ...patch })).toThrow(message);
  });
});

describe('totals and filters', () => {
  const entries = [
    { id: 'a', type: 'income', date: '2026-03-01', amount: 0.1 },
    { id: 'b', type: 'income', date: '2026-03-02', amount: 0.2 },
    { id: 'c', type: 'expense', date: '2025-12-31', amount: 0.05 },
  ];
  it('sums in cents without float drift', () => {
    expect(ledgerTotals(entries)).toEqual({
      income: 0.3,
      expense: 0.05,
      balance: 0.25,
      other: {},
    });
  });
  it('keeps CHF entries out of the euro totals and sums them separately', () => {
    const withChf = [
      ...entries,
      { id: 'd', type: 'income', date: '2026-03-03', amount: 10, currency: 'CHF' },
    ];
    expect(ledgerTotals(withChf)).toEqual({
      income: 0.3,
      expense: 0.05,
      balance: 0.25,
      other: { CHF: 10 },
    });
    expect(formatLedgerAmount(withChf[3])).toBe('10,00 CHF');
    expect(formatLedgerAmount(entries[0])).toMatch(/ €$/);
  });
  it('lists years newest first and always the current one', () => {
    expect(ledgerYears(entries, 2027)).toEqual(['2027', '2026', '2025']);
    expect(ledgerYears([], 2026)).toEqual(['2026']);
  });
  it('filters by year, "all" keeps everything', () => {
    expect(entriesOfYear(entries, '2025').map((e) => e.id)).toEqual(['c']);
    expect(entriesOfYear(entries, 'all')).toHaveLength(3);
  });
  it('sorts newest first', () => {
    expect(sortLedger(entries).map((e) => e.id)).toEqual(['b', 'a', 'c']);
  });
});

describe('ledgerToCsv', () => {
  it('writes German CSV, signs expenses and neutralises formulas', () => {
    const csv = ledgerToCsv([
      {
        id: '1',
        type: 'income',
        date: '2026-10-29',
        amount: 25,
        description: 'Spende',
        source: 'mollie',
      },
      {
        id: '2',
        type: 'expense',
        date: '2026-10-01',
        amount: 12.5,
        description: '=SUM(A1)',
        note: 'a;b "c"',
      },
    ]);
    const lines = csv.replace('﻿', '').split('\r\n');
    expect(lines[0]).toBe('Datum;Art;Betrag;Währung;Beschreibung;Kategorie;Notiz;Quelle');
    expect(lines[1]).toBe(
      `${formatLedgerDate('2026-10-01')};Ausgabe;-12,50;EUR;'=SUM(A1);;"a;b ""c""";manuell`
    );
    expect(lines[2]).toBe('29.10.2026;Einnahme;25,00;EUR;Spende;;;Mollie');
  });
});
