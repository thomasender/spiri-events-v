import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import type { FirestoreLikeDb } from './mollieWebhookLogic';
import { fetchAllInvoices, syncInvoicesToLedger } from './mollieInvoicesLogic';
import { reportPaymentFailure } from './paymentAlerts';

// Read-only organization access token (invoices.read), not the payment API key.
export const MOLLIE_ORG_TOKEN = defineSecret('MOLLIE_ORG_TOKEN');

const REGION = 'europe-west3';

/**
 * Daily check for new Mollie invoices (they appear once a month); each one is
 * booked into the ledger as an expense. Daily instead of monthly so a missed
 * run heals itself, and because booking is create-only it never double-books
 * or overwrites an edited entry. Never touches the donation flow.
 */
export const syncMollieInvoices = onSchedule(
  {
    region: REGION,
    schedule: 'every day 06:00',
    timeZone: 'Europe/Vienna',
    secrets: [MOLLIE_ORG_TOKEN],
  },
  async () => {
    const token = MOLLIE_ORG_TOKEN.value();
    if (!token) {
      logger.warn('MOLLIE_ORG_TOKEN is not configured; skipping Mollie invoice sync');
      return;
    }
    try {
      const invoices = await fetchAllInvoices(token);
      const summary = await syncInvoicesToLedger({
        db: getFirestore() as unknown as FirestoreLikeDb,
        invoices,
      });
      if (summary.booked > 0) logger.info('Booked Mollie invoices into the ledger', summary);
    } catch (err) {
      logger.error('Mollie invoice sync failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      // One alert per month while it keeps failing (token revoked/expired).
      await reportPaymentFailure({
        step: 'rechnungen-abgleich',
        error: err,
        alertId: `mollie_invoices_${new Date().toISOString().slice(0, 7)}`,
      });
    }
  }
);
