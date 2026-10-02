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

function formatAmount(amount) {
  return Number.isInteger(amount) ? amount.toString() : amount.toFixed(2);
}

export function formatPriceWithCurrency(fee, code, feeMax) {
  const normalized = normalizeCurrency(code);
  const symbol = CURRENCY_BY_CODE[normalized].symbol;
  const amount = typeof fee === 'number' ? fee : Number(fee);

  if (!Number.isFinite(amount) || amount <= 0) {
    return '';
  }

  const formattedAmount = formatAmount(amount);

  // Treat 0, null, undefined, NaN, '' as "no upper bound" — anything other
  // than a strictly larger positive number means the user did not intend a
  // range, so we render the single price to stay backwards-compatible.
  const hasMax = feeMax !== null && feeMax !== undefined && feeMax !== '' && feeMax !== 0;
  if (hasMax) {
    const maxAmount = typeof feeMax === 'number' ? feeMax : Number(feeMax);
    if (Number.isFinite(maxAmount) && maxAmount > amount) {
      return `${formattedAmount}-${formatAmount(maxAmount)} ${symbol}`;
    }
  }

  return `${formattedAmount} ${symbol}`;
}
