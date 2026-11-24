// German texts for the refusals of `sendOutreachMail` (functions/src/importConsent.ts).
// The backend answers `failed-precondition` with `details.reason` and a message like
// "Outreach refused: blocklisted." The Super-Admin should read a sentence, not that.

export const OUTREACH_REFUSAL_TEXTS = {
  blocklisted: 'Diese Adresse oder Domain steht auf der Sperrliste. Es wird nichts gesendet.',
  'already-sent': 'An diesen Veranstalter wurde schon eine Mail gesendet. Es gibt nur eine Mail.',
  'consent-not-none': 'Dieser Veranstalter wurde schon angeschrieben oder hat schon geantwortet.',
  'no-contact': 'Es ist keine Kontaktadresse hinterlegt.',
  'no-events': 'Es gibt noch keine angenommenen Events dieses Veranstalters.',
  'disabled-in-production':
    'Der Versand an echte Veranstalter ist ausgeschaltet. Schalte ihn oben ein.',
  'test-recipient-required': 'Hier geht nur eine Testmail. Bitte eine Testadresse eintragen.',
  'bad-test-recipient': 'Die Testadresse ist keine gültige E-Mail-Adresse.',
  'daily-limit': 'Das Tageslimit ist erreicht. Morgen geht es weiter, oder erhöhe das Limit oben.',
};

/** The reason code of a refusal (details.reason, else parsed from the message). */
export function outreachRefusalReason(err) {
  const fromDetails = err?.details?.reason;
  if (typeof fromDetails === 'string') return fromDetails;
  const match = /refused:\s*([a-z-]+)/i.exec(err?.message ?? '');
  return match ? match[1].toLowerCase() : null;
}

/** One German sentence for any error of the outreach mail. */
export function outreachErrorText(err) {
  const reason = outreachRefusalReason(err);
  if (reason && OUTREACH_REFUSAL_TEXTS[reason]) return OUTREACH_REFUSAL_TEXTS[reason];
  return 'Die Mail konnte nicht gesendet werden. Bitte versuche es später noch einmal.';
}

/** "2026-11-24" in Vienna (same as `outreachDayKey` in the backend), for today's counter doc. */
export function viennaDayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Vienna',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
