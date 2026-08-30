import { describe, it, expect } from 'vitest';
import {
  CURRENCIES,
  DEFAULT_CURRENCY,
  isSupportedCurrency,
  normalizeCurrency,
  getCurrencySymbol,
  getCurrencyLabel,
  formatPriceWithCurrency,
} from '../../src/utils/currency';

describe('CURRENCIES', () => {
  it('contains EUR and CHF with stable shape', () => {
    expect(Array.isArray(CURRENCIES)).toBe(true);
    const codes = CURRENCIES.map((c) => c.code);
    expect(codes).toContain('EUR');
    expect(codes).toContain('CHF');
    for (const currency of CURRENCIES) {
      expect(typeof currency.code).toBe('string');
      expect(typeof currency.symbol).toBe('string');
      expect(typeof currency.label).toBe('string');
      expect(currency.symbol.length).toBeGreaterThan(0);
      expect(currency.label.length).toBeGreaterThan(0);
    }
  });
});

describe('DEFAULT_CURRENCY', () => {
  it('is EUR (backwards-compatible default for existing data)', () => {
    expect(DEFAULT_CURRENCY).toBe('EUR');
  });
});

describe('isSupportedCurrency', () => {
  it('returns true for known codes', () => {
    expect(isSupportedCurrency('EUR')).toBe(true);
    expect(isSupportedCurrency('CHF')).toBe(true);
  });

  it('returns false for unknown / empty / nullish values', () => {
    expect(isSupportedCurrency('USD')).toBe(false);
    expect(isSupportedCurrency('SFR')).toBe(false);
    expect(isSupportedCurrency('')).toBe(false);
    expect(isSupportedCurrency(null)).toBe(false);
    expect(isSupportedCurrency(undefined)).toBe(false);
  });
});

describe('normalizeCurrency', () => {
  it('passes through supported currency codes', () => {
    expect(normalizeCurrency('EUR')).toBe('EUR');
    expect(normalizeCurrency('CHF')).toBe('CHF');
  });

  it('falls back to DEFAULT_CURRENCY for unsupported values', () => {
    expect(normalizeCurrency('USD')).toBe(DEFAULT_CURRENCY);
    expect(normalizeCurrency('SFR')).toBe(DEFAULT_CURRENCY);
    expect(normalizeCurrency('')).toBe(DEFAULT_CURRENCY);
    expect(normalizeCurrency(null)).toBe(DEFAULT_CURRENCY);
    expect(normalizeCurrency(undefined)).toBe(DEFAULT_CURRENCY);
  });
});

describe('getCurrencySymbol', () => {
  it('returns € for EUR and CHF for CHF', () => {
    expect(getCurrencySymbol('EUR')).toBe('€');
    expect(getCurrencySymbol('CHF')).toBe('CHF');
  });

  it('falls back to the default currency symbol for unknown codes', () => {
    expect(getCurrencySymbol('USD')).toBe(getCurrencySymbol(DEFAULT_CURRENCY));
    expect(getCurrencySymbol(undefined)).toBe(getCurrencySymbol(DEFAULT_CURRENCY));
  });
});

describe('getCurrencyLabel', () => {
  it('returns the human-readable label for supported currencies', () => {
    expect(getCurrencyLabel('EUR')).toContain('Euro');
    expect(getCurrencyLabel('CHF')).toContain('Schweizer Franken');
  });
});

describe('formatPriceWithCurrency', () => {
  it('formats integer fees with the EUR symbol', () => {
    expect(formatPriceWithCurrency(25, 'EUR')).toBe('25 €');
  });

  it('formats decimal fees with the EUR symbol', () => {
    expect(formatPriceWithCurrency(15.5, 'EUR')).toBe('15.50 €');
  });

  it('formats CHF fees with the CHF suffix', () => {
    expect(formatPriceWithCurrency(40, 'CHF')).toBe('40 CHF');
    expect(formatPriceWithCurrency(12.35, 'CHF')).toBe('12.35 CHF');
  });

  it('formats string fees coerced to numbers', () => {
    expect(formatPriceWithCurrency('18', 'EUR')).toBe('18 €');
  });

  it('returns empty string for zero / negative / invalid amounts', () => {
    expect(formatPriceWithCurrency(0, 'EUR')).toBe('');
    expect(formatPriceWithCurrency(-5, 'EUR')).toBe('');
    expect(formatPriceWithCurrency(null, 'EUR')).toBe('');
    expect(formatPriceWithCurrency('not-a-number', 'EUR')).toBe('');
  });

  it('falls back to DEFAULT_CURRENCY for unsupported currency codes', () => {
    expect(formatPriceWithCurrency(10, 'USD')).toBe('10 €');
    expect(formatPriceWithCurrency(10, undefined)).toBe('10 €');
  });
});
