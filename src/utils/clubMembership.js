// Vereinsmitgliedschaft "Pioniere" (Trello 6af620c0): amounts, ticks and texts of
// the wizard on /pioniere. The server checks everything again
// (functions/src/clubMembershipLogic.ts); KEEP the constants IN SYNC
// (tests/lib/clubMembership.spec.ts compares them).

export const MIN_MEMBERSHIP_AMOUNT = 3;
export const MAX_MEMBERSHIP_AMOUNT = 1000;
export const MEMBERSHIP_AMOUNT_PRESETS = [3.9, 12.9, 17.9];
export const MEMBERSHIP_REQUIRED_CONSENTS = ['statuten', 'datenschutz'];
export const MEMBER_NAME_MIN = 2;
export const MEMBER_NAME_MAX = 80;

export const MEMBERSHIP_PRIVACY_PATH = '/datenschutz#vereinsmitglieder';

// Entwurf, von Peter zu prüfen.
export const MEMBERSHIP_BENEFITS = [
  'Du nimmst an ausgewählten Vereinsveranstaltungen teil.',
  'Du trägst den Tribe mit: Dein Beitrag finanziert Webhosting, Technik und Flyer.',
  'Dein Profilfoto bekommt das Pioniere-Abzeichen.',
];

export const MEMBERSHIP_MODES = ['off', 'admins', 'all'];

/** "12,90" / "12.9" / 12.9 -> 12.9; anything else NaN. */
export function parseMembershipAmount(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? input : NaN;
  if (typeof input !== 'string') return NaN;
  const normalized = input.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return NaN;
  return Number(normalized);
}

/** At least 3 €, at most 1000 €, whole cents. */
export function isValidMembershipAmount(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  if (value < MIN_MEMBERSHIP_AMOUNT || value > MAX_MEMBERSHIP_AMOUNT) return false;
  return Math.abs(Math.round(value * 100) - value * 100) < 1e-6;
}

export function isValidMemberName(name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return trimmed.length >= MEMBER_NAME_MIN && trimmed.length <= MEMBER_NAME_MAX;
}

/** "12,90 €" */
export function formatEuro(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  return `${value.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

/** app_settings/membership -> { mode, statutesUrl, statutesVersion }; missing = off. */
export function parseMembershipSettings(data) {
  const d = data && typeof data === 'object' ? data : {};
  return {
    mode: MEMBERSHIP_MODES.includes(d.mode) ? d.mode : 'off',
    statutesUrl: typeof d.statutesUrl === 'string' ? d.statutesUrl.trim() : '',
    statutesVersion: typeof d.statutesVersion === 'string' ? d.statutesVersion.trim() : '',
  };
}

/** Who sees the sign-up under the flag: 'all' everybody, 'admins' only Super-Admins. */
export function canSeeMembership({ mode, isAdmin }) {
  return mode === 'all' || (mode === 'admins' && Boolean(isAdmin));
}

/** Without a Statuten link only Super-Admins may pay (testing, with a placeholder notice). */
export function canPayMembership({ statutesUrl, isAdmin }) {
  return Boolean(statutesUrl) || Boolean(isAdmin);
}

/** Today in Vienna, YYYY-MM-DD. */
export function viennaToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Vienna',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Still a member: active, or gekündigt until the paid month is over. */
export function isMembershipRunning(membership, today = viennaToday()) {
  if (!membership) return false;
  if (membership.status === 'active') return true;
  return (
    membership.status === 'cancelled' &&
    typeof membership.paidUntil === 'string' &&
    membership.paidUntil > today
  );
}

/** "12. Dezember 2026" for YYYY-MM-DD. */
export function formatMembershipDate(iso) {
  if (typeof iso !== 'string') return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('de-AT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** German message for a failed callable. */
export function membershipErrorMessage(err) {
  const code = String(err?.code || '').replace(/^functions\//, '');
  switch (code) {
    case 'already-exists':
      return 'Du bist bereits Pionier:in. Deine Mitgliedschaft findest du in deinem Profil.';
    case 'failed-precondition':
      return 'Die Anmeldung ist gerade nicht geöffnet. Bitte versuche es später noch einmal.';
    case 'invalid-argument':
      return 'Bitte prüfe deinen Namen, den Betrag (mindestens 3 €) und die beiden Häkchen.';
    case 'unauthenticated':
      return 'Bitte melde dich zuerst an.';
    case 'resource-exhausted':
      return 'Zu viele Versuche. Bitte warte ein paar Minuten.';
    case 'unavailable':
      return err?.message || 'Die Anmeldung konnte gerade nicht gestartet werden.';
    default:
      return 'Das hat leider nicht geklappt. Bitte versuche es später noch einmal.';
  }
}
