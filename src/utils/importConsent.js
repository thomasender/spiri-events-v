// Preview page of the event import (/vorschau/import/:token, docs/event-import.md):
// consent texts, formatting and the privacy helpers of the page. Pure, no
// Firebase imports.

/**
 * Version of the consent texts below. KEEP IN SYNC with CONSENT_WORDING_VERSION
 * in functions/src/importConsent.ts (tests/lib/importConsent.spec.ts compares
 * both). Bump it whenever the meaning of a text changes.
 */
export const CONSENT_WORDING_VERSION = '2026-11-v1';

/** Draft wording (not lawyer-approved yet). */
export const CONSENT_TEXTS = Object.freeze({
  event:
    'Ich bin berechtigt, für diese Organisation zu handeln, und bestätige die Richtigkeit der Angaben. tribe darf die Veranstaltungsdaten (Titel, Datum, Ort, Preis, Beschreibung, Link) auf tribe anzeigen, solange die Veranstaltung online ist oder bis zu meinem Widerruf.',
  images:
    'Ich bin Inhaber:in der Rechte an den Bildern oder habe die Erlaubnis der Rechteinhaber:in. Ich räume tribe das nicht-exklusive, unentgeltliche Recht ein, die Bilder zu speichern, in der Größe anzupassen und auf tribe (Website, App, Newsletter, Social-Media-Vorschau) öffentlich zugänglich zu machen, solange die Veranstaltung online ist oder bis zum Widerruf.',
  persons:
    'Auf den Bildern erkennbare Personen sind einverstanden, oder die Veröffentlichung ist aus anderem Grund zulässig.',
  revoke: 'Du kannst jederzeit widerrufen. tribe entfernt Inhalte dann.',
});

export const PREVIEW_PATH_PREFIX = '/vorschau';
/** Route of ImportPreviewPage; /vorschau/:token is the pre-entry preview (docs/pre-entries.md). */
export const IMPORT_PREVIEW_PATH = '/vorschau/import';
export const IMPORT_PRIVACY_PATH = '/datenschutz-import';
export const PREVIEW_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
/** Claim flow of ticket 7 (src/pages/ClaimEventsPage.jsx) for "Selbst verwalten". */
export const CLAIM_PATH = '/uebernehmen';

export function claimPathFor(token) {
  return `${CLAIM_PATH}?claim=${encodeURIComponent(token)}`;
}

/** `?aktion=ablehnen` (the decline link of the mail). */
export const DECLINE_PARAM = 'aktion';
export const DECLINE_VALUE = 'ablehnen';

/**
 * Path without private tokens, for analytics: `/vorschau/<token>` (pre-entries)
 * and `/vorschau/import/<token>` become `/vorschau`, so the link never reaches Google Analytics.
 */
export function redactPrivatePath(path) {
  const value = String(path ?? '');
  return /^\/vorschau(\/|$)/.test(value) ? PREVIEW_PATH_PREFIX : value;
}

/** Same for a full URL (page_location / page_referrer). */
export function redactPrivateUrl(url) {
  if (typeof url !== 'string') return url;
  const match = /^(https?:\/\/[^/]+)(\/.*)?$/.exec(url);
  if (!match) return url;
  return `${match[1]}${redactPrivatePath(match[2] ?? '')}`;
}

const SOCIAL_IMAGE_SELECTORS = [
  'meta[property="og:image"]',
  'meta[property="og:image:width"]',
  'meta[property="og:image:height"]',
  'meta[property="og:image:alt"]',
  'meta[name="twitter:image"]',
  'meta[name="twitter:image:alt"]',
];

function upsertMeta(doc, name, content) {
  let el = doc.head.querySelector(`meta[name="${name}"]`);
  const previous = el ? el.getAttribute('content') : null;
  if (!el) {
    el = doc.createElement('meta');
    el.setAttribute('name', name);
    doc.head.appendChild(el);
  }
  el.setAttribute('content', content);
  return () => {
    if (previous === null) el.remove();
    else el.setAttribute('content', previous);
  };
}

/**
 * Private page meta while the preview is open: `noindex, nofollow`, referrer
 * `no-referrer`, no social preview image. Returns the cleanup that restores
 * the previous state.
 */
export function applyPrivatePageMeta(doc = document) {
  const restoreRobots = upsertMeta(doc, 'robots', 'noindex, nofollow');
  const restoreReferrer = upsertMeta(doc, 'referrer', 'no-referrer');
  const removed = SOCIAL_IMAGE_SELECTORS.flatMap((sel) => [...doc.head.querySelectorAll(sel)]);
  removed.forEach((el) => el.remove());
  return () => {
    restoreRobots();
    restoreReferrer();
    removed.forEach((el) => doc.head.appendChild(el));
  };
}

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/** "Sa, 05.12.2026" for a YYYY-MM-DD date. */
export function formatPreviewDate(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd ?? ''));
  if (!m) return '';
  const weekday = WEEKDAYS[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()];
  return `${weekday}, ${m[3]}.${m[2]}.${m[1]}`;
}

/** "Sa, 05.12.2026, 18:00 bis 20:00 Uhr" */
export function formatPreviewWhen(event) {
  const date = formatPreviewDate(event.date);
  const end =
    event.endDate && event.endDate !== event.date ? ` bis ${formatPreviewDate(event.endDate)}` : '';
  if (!event.time) return `${date}${end}`;
  const until = event.endTime ? ` bis ${event.endTime}` : '';
  return `${date}${end}, ${event.time}${until} Uhr`;
}

/** Price line as the calendar shows it. */
export function formatPreviewPrice(event) {
  if (event.contribution === 'donation') return 'Freie Spende';
  if (event.contribution === 'unspecified') return 'Keine Angabe';
  if (event.contribution !== 'fee' || event.fee == null) return 'Kostenlos';
  const currency = event.priceCurrency || 'EUR';
  const max = event.feeMax != null && event.feeMax > event.fee ? `–${event.feeMax}` : '';
  return `${event.fee}${max} ${currency}`;
}

export function formatPreviewPlace(event) {
  if (event.isOnline) return 'Online';
  return [event.place, event.city].filter(Boolean).join(', ');
}

/** German message for an error of getImportPreview / submitImportConsent. */
export function previewErrorMessage(err) {
  const code = String(err?.code ?? '').replace(/^functions\//, '');
  const reason = err?.details?.reason;
  if (reason === 'wording-outdated') {
    return 'Diese Seite ist nicht mehr aktuell. Bitte lade sie neu und versuche es noch einmal.';
  }
  if (reason === 'declined') {
    return 'Du hast bereits abgelehnt. Wir haben deine Angaben gelöscht.';
  }
  if (reason === 'event-scope-required') {
    return 'Bitte bestätige zuerst das erste Häkchen.';
  }
  if (code === 'resource-exhausted') {
    return 'Zu viele Versuche in kurzer Zeit. Bitte warte ein paar Minuten.';
  }
  if (code === 'not-found' || code === 'invalid-argument') {
    return 'Dieser Link ist ungültig oder abgelaufen. Schreib uns gern an admin@thetribe.at, dann schicken wir dir einen neuen.';
  }
  return 'Das hat leider nicht geklappt. Bitte versuche es später noch einmal oder schreib uns an admin@thetribe.at.';
}
