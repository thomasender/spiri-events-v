import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import app from './firebase';

const useEmulators = import.meta.env.VITE_USE_EMULATORS === 'true';
const functions = getFunctions(app, 'europe-west3');

if (useEmulators) {
  connectFunctionsEmulator(functions, 'localhost', 5001);
}

const createSubscription = httpsCallable(functions, 'createMollieSubscription');

export const DONATION_AMOUNTS = [1.9, 6.9, 12.9];

/**
 * @param {number} amount one of DONATION_AMOUNTS (EUR)
 * @param {string|null} [name] optional customer name
 * @returns {Promise<{checkoutUrl: string, customerId: string, subscriptionId: string}>}
 */
export async function startDonation(amount, name = null) {
  if (!DONATION_AMOUNTS.includes(amount)) {
    throw new Error(`Ungültiger Spendenbetrag: ${amount}`);
  }
  const result = await createSubscription({ amount, name });
  return result.data;
}
