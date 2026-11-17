// Nutzungsbedingungen (`/nutzungsbedingungen`, text in src/pages/LegalPage.jsx).
// Registration stores `termsAcceptedAt` (server time) and `termsVersion` on
// `users/{uid}` as proof of consent. Bump the version together with the
// "Stand" date whenever the text changes in substance, so a later re-consent
// can tell who agreed to which version. Accounts from before the terms have
// neither field and are not asked again.
export const TERMS_VERSION = '2026-11';
export const TERMS_LAST_UPDATED = 'November 2026';
export const TERMS_PATH = '/nutzungsbedingungen';

// The two fields a new account stores with its profile doc.
export function termsAcceptanceFields(timestamp) {
  return { termsAcceptedAt: timestamp, termsVersion: TERMS_VERSION };
}
