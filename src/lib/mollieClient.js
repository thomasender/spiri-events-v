import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import app from './firebase';
import {
  MIN_DONATION_AMOUNT,
  DONATION_AMOUNT_PRESETS,
  isValidDonationAmount,
} from './donationValidation';

export { MIN_DONATION_AMOUNT, DONATION_AMOUNT_PRESETS, isValidDonationAmount };
export { parseDonationAmount } from './donationValidation';

const useEmulators = import.meta.env.VITE_USE_EMULATORS === 'true';
const functions = getFunctions(app, 'europe-west3');

if (useEmulators) {
  connectFunctionsEmulator(functions, 'localhost', 5001);
}

const createSubscription = httpsCallable(functions, 'createMollieSubscription');
const createPayment = httpsCallable(functions, 'createMolliePayment');

function assertValidAmount(amount) {
  if (!isValidDonationAmount(amount)) {
    throw new Error(`Ungültiger Spendenbetrag: mindestens ${MIN_DONATION_AMOUNT.toFixed(2)} €`);
  }
}

/**
 * @param {number} amount donation amount in EUR (≥ MIN_DONATION_AMOUNT)
 * @param {string|null} [name] optional donor name
 * @returns {Promise<{checkoutUrl: string, paymentId: string}>}
 */
export async function startOneTimeDonation(amount, name = null) {
  assertValidAmount(amount);
  const result = await createPayment({ amount, name });
  return result.data;
}

/**
 * @param {number} amount donation amount in EUR (≥ MIN_DONATION_AMOUNT)
 * @param {string|null} [name] optional donor name
 * @returns {Promise<{checkoutUrl: string, customerId: string, subscriptionId: string}>}
 */
export async function startMonthlyDonation(amount, name = null) {
  assertValidAmount(amount);
  const result = await createSubscription({ amount, name });
  return result.data;
}
