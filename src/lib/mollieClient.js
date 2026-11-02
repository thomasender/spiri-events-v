import { callable } from './firebase';
import {
  MIN_DONATION_AMOUNT,
  DONATION_AMOUNT_PRESETS,
  isValidDonationAmount,
} from './donationValidation';

export { MIN_DONATION_AMOUNT, DONATION_AMOUNT_PRESETS, isValidDonationAmount };
export { parseDonationAmount } from './donationValidation';

// Same Functions instance as everywhere else (lib/firebase.js, emulator included), loaded on
// the first donation.
const createSubscription = callable('createMollieSubscription');
const createPayment = callable('createMolliePayment');

function assertValidAmount(amount) {
  if (!isValidDonationAmount(amount)) {
    throw new Error(`Ungültiger Spendenbetrag: mindestens ${MIN_DONATION_AMOUNT.toFixed(2)} €`);
  }
}

/**
 * @param {number} amount donation amount in EUR (≥ MIN_DONATION_AMOUNT)
 * @param {{ name?: string|null, displayOnConsent?: boolean, comment?: string|null, regionId?: string|null }} [options]
 * @returns {Promise<{checkoutUrl: string, paymentId: string}>}
 */
export async function startOneTimeDonation(amount, options = {}) {
  assertValidAmount(amount);
  const { name = null, displayOnConsent = false, comment = null, regionId = null } = options;
  const result = await createPayment({ amount, name, displayOnConsent, comment, regionId });
  return result.data;
}

/**
 * @param {number} amount donation amount in EUR (≥ MIN_DONATION_AMOUNT)
 * @param {{ name?: string|null, displayOnConsent?: boolean, comment?: string|null, regionId?: string|null }} [options]
 * @returns {Promise<{checkoutUrl: string, customerId: string, paymentId: string}>}
 */
export async function startMonthlyDonation(amount, options = {}) {
  assertValidAmount(amount);
  const { name = null, displayOnConsent = false, comment = null, regionId = null } = options;
  const result = await createSubscription({ amount, name, displayOnConsent, comment, regionId });
  return result.data;
}
