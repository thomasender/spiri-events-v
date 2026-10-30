/**
 * Payment failures (Mollie) are reported into the existing Verwaltung
 * "Feedback" inbox: a `feedback/{id}` doc shows up there as new and
 * `onFeedbackCreated` mails the admins. No new admin system.
 *
 * Only technical ids (cst_/tr_/sub_) and the Mollie error go in; never the
 * donor's name, e-mail or the API key.
 */

import { logger } from 'firebase-functions';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

export const PAYMENT_ALERT_NAME = 'System: Zahlungen (Mollie)';
const MAX_DESCRIPTION = 1000;

export type PaymentAlertStep =
  | 'monatliche-spende-start'
  | 'einmalige-spende-start'
  | 'abo-anlegen'
  | 'webhook'
  | 'rechnungen-abgleich';

const STEP_LABELS: Record<PaymentAlertStep, string> = {
  'monatliche-spende-start': 'Monatliche Spende konnte nicht gestartet werden',
  'einmalige-spende-start': 'Einmalige Spende konnte nicht gestartet werden',
  'abo-anlegen': 'Monatliches Abo wurde nach der ersten Zahlung NICHT angelegt',
  webhook: 'Zahlungsbestätigung von Mollie konnte nicht verarbeitet werden',
  'rechnungen-abgleich':
    'Die Mollie-Rechnungen (Gebühren) konnten nicht in die Finanzen übernommen werden',
};

export interface PaymentAlertInput {
  step: PaymentAlertStep;
  error: unknown;
  amount?: number | string | null;
  // EUR when missing (CHF for donations to Swiss regions).
  currency?: string | null;
  ids?: Record<string, string | null | undefined>;
  pageUrl?: string | null;
}

export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const status = (error as Error & { status?: number }).status;
    return status && !error.message.includes(String(status))
      ? `${error.message} [${status}]`
      : error.message;
  }
  return typeof error === 'string' ? error : 'unbekannter Fehler';
}

export function buildPaymentAlert(input: PaymentAlertInput): Record<string, unknown> {
  const lines = [
    `Zahlungsfehler: ${STEP_LABELS[input.step]}.`,
    `Fehler: ${describeError(input.error)}`,
  ];
  if (input.amount !== undefined && input.amount !== null && input.amount !== '') {
    lines.push(`Betrag: ${input.amount} ${input.currency || 'EUR'}`);
  }
  const ids = Object.entries(input.ids ?? {}).filter(([, v]) => typeof v === 'string' && v);
  if (ids.length > 0) {
    lines.push(`Mollie: ${ids.map(([k, v]) => `${k}=${v}`).join(', ')}`);
  }
  if (input.step === 'abo-anlegen') {
    lines.push(
      'Die erste Monatszahlung wurde bezahlt. Bitte im Mollie-Dashboard prüfen, ob das Abo fehlt.'
    );
  }
  const description = lines.join('\n').slice(0, MAX_DESCRIPTION);
  const alert: Record<string, unknown> = {
    description,
    name: PAYMENT_ALERT_NAME,
    status: 'new',
  };
  if (input.pageUrl) alert.pageUrl = input.pageUrl;
  return alert;
}

/**
 * Writes the alert. `alertId` dedupes Mollie webhook retries: the same id
 * is created once (one mail), later attempts are ignored.
 */
export async function reportPaymentFailure(
  input: PaymentAlertInput & { alertId?: string }
): Promise<void> {
  try {
    const data = { ...buildPaymentAlert(input), createdAt: FieldValue.serverTimestamp() };
    const col = getFirestore().collection('feedback');
    if (input.alertId) {
      await col.doc(input.alertId).create(data);
    } else {
      await col.add(data);
    }
  } catch (err) {
    const code = (err as { code?: unknown })?.code;
    // 6 = ALREADY_EXISTS: this failure was already reported.
    if (code === 6 || code === 'already-exists') return;
    logger.error('Could not write payment alert', { step: input.step, err: describeError(err) });
  }
}
