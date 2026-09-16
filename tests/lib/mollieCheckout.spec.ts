import { describe, it, expect } from 'vitest';
import { extractMollieCheckoutUrl } from '../../src/lib/mollieCheckout';

describe('extractMollieCheckoutUrl', () => {
  it('returns the checkout link from a Mollie _links.checkout.href', () => {
    const response = {
      id: 'tr_xxx',
      _links: {
        checkout: { href: 'https://www.mollie.com/checkout/abc', type: 'text/html' },
      },
    };
    expect(extractMollieCheckoutUrl(response)).toBe('https://www.mollie.com/checkout/abc');
  });

  it('returns null when _links is missing', () => {
    expect(extractMollieCheckoutUrl({ id: 'tr_xxx' })).toBeNull();
  });

  it('returns null when _links.checkout is missing', () => {
    expect(extractMollieCheckoutUrl({ id: 'tr_xxx', _links: {} })).toBeNull();
  });

  it('returns null when _links.checkout.href is not a string', () => {
    expect(
      extractMollieCheckoutUrl({
        id: 'tr_xxx',
        _links: { checkout: { href: null, type: 'text/html' } },
      })
    ).toBeNull();
  });

  it('returns null for null and undefined responses', () => {
    expect(extractMollieCheckoutUrl(null)).toBeNull();
    expect(extractMollieCheckoutUrl(undefined)).toBeNull();
  });

  it('returns null for non-object responses', () => {
    expect(extractMollieCheckoutUrl('string')).toBeNull();
    expect(extractMollieCheckoutUrl(42)).toBeNull();
  });
});
