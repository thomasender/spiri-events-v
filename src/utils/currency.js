export const CURRENCIES = [
  { code: 'EUR', symbol: '€', label: 'Euro (EUR)' },
  { code: 'CHF', symbol: 'CHF', label: 'Schweizer Franken (CHF)' },
];

export const DEFAULT_CURRENCY = 'EUR';

const CURRENCY_BY_CODE = CURRENCIES.reduce((acc, c) => {
  acc[c.code] = c;
  return acc;
}, {});

export function isSupportedCurrency(code) {
  return Boolean(CURRENCY_BY_CODE[code]);
}

export function normalizeCurrency(code) {
  return isSupportedCurrency(code) ? code : DEFAULT_CURRENCY;
}

export function getCurrencySymbol(code) {
  const currency = CURRENCY_BY_CODE[normalizeCurrency(code)];
  return currency.symbol;
}

export function getCurrencyLabel(code) {
  const currency = CURRENCY_BY_CODE[normalizeCurrency(code)];
  return currency.label;
}

export function formatPriceWithCurrency(fee, code) {
  const normalized = normalizeCurrency(code);
  const symbol = CURRENCY_BY_CODE[normalized].symbol;
  const amount = typeof fee === 'number' ? fee : Number(fee);

  if (!Number.isFinite(amount) || amount <= 0) {
    return '';
  }

  const formattedAmount = Number.isInteger(amount) ? amount.toString() : amount.toFixed(2);

  return `${formattedAmount} ${symbol}`;
}
