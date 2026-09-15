export const MIN_DONATION_AMOUNT = 5.0;

export const DONATION_AMOUNT_PRESETS = [5, 10, 20];

export function parseDonationAmount(input) {
  if (typeof input === 'number') {
    return Number.isFinite(input) ? input : NaN;
  }
  if (typeof input !== 'string') return NaN;
  const normalized = input.trim().replace(',', '.');
  if (normalized.length === 0) return NaN;
  return Number(normalized);
}

export function isValidDonationAmount(value) {
  return Number.isFinite(value) && value >= MIN_DONATION_AMOUNT;
}
