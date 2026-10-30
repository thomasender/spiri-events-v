// Currency of a donation. Regions in Switzerland (country CH) take donations in
// Swiss francs, every other region in euros. The server decides the same way
// from the region (functions/src/mollieWebhookLogic.ts, donationCurrencyForRegion).
// Stored donations without `currency` are euros (everything before CHF existed).

export const DEFAULT_DONATION_CURRENCY = 'EUR';

const CURRENCIES = {
  EUR: { symbol: '€', name: 'Euro' },
  CHF: { symbol: 'CHF', name: 'Schweizer Franken' },
};

/** Currency for donations to a region of `country` ('AT' | 'DE' | 'CH'). */
export function donationCurrencyForCountry(country) {
  return country === 'CH' ? 'CHF' : DEFAULT_DONATION_CURRENCY;
}

/** Currency of a stored record (donor, ledger entry); missing/unknown -> EUR. */
export function donationCurrencyOf(record) {
  const value = record && typeof record === 'object' ? record.currency : record;
  return Object.hasOwn(CURRENCIES, value ?? '') ? value : DEFAULT_DONATION_CURRENCY;
}

export function currencySymbol(currency) {
  return CURRENCIES[donationCurrencyOf(currency)].symbol;
}

export function currencyName(currency) {
  return CURRENCIES[donationCurrencyOf(currency)].name;
}
