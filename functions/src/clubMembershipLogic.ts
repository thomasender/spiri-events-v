/**
 * Vereinsmitgliedschaft "Pioniere" (Trello 6af620c0): pure constants and checks,
 * shared by the callables (clubMembership.ts), the Mollie webhook
 * (mollieWebhookLogic.ts) and the Vitest specs. No firebase-admin import here, so
 * the webhook logic stays importable without Firebase.
 *
 * Data: `club_memberships/{uid}` (server-only writes, owner + Super-Admin read):
 *   status      'pending'   checkout started, first payment not paid yet (no member)
 *               'active'    member (first payment paid, or created by a Super-Admin)
 *               'cancelled' gekündigt: Mollie subscription deleted, membership runs
 *                           until `paidUntil` (clubMember stays until then)
 *               'ended'     no member any more
 *   source      'web' (wizard + Mollie) | 'manual' (paper form, Super-Admin)
 *   amount, currency ('EUR'), mollieCustomerId, mollieSubscriptionId,
 *   statutesAcceptedAt, statutesVersion, privacyAcceptedAt, paidUntil (YYYY-MM-DD,
 *   the day the next monthly payment is due), joinedAt, cancelledAt, endedAt, ...
 */

export const MEMBERSHIP_COLLECTION = 'club_memberships';
export const MEMBERSHIP_SETTINGS_DOC = 'membership';

/** Payment / customer / subscription metadata `type` of a membership. */
export const MEMBERSHIP_PAYMENT_TYPE = 'membership';

export const MIN_MEMBERSHIP_AMOUNT = 3;
export const MAX_MEMBERSHIP_AMOUNT = 1000;
/** KEEP IN SYNC with src/utils/clubMembership.js. */
export const MEMBERSHIP_AMOUNT_PRESETS: readonly number[] = [3.9, 12.9, 17.9];
export const MEMBERSHIP_CURRENCY = 'EUR';

export const MEMBERSHIP_PAYMENT_DESCRIPTION = 'Pioniere Mitgliedsbeitrag tribe Vorarlberg';
export const MEMBERSHIP_SUBSCRIPTION_DESCRIPTION =
  'Monatlicher Pioniere Mitgliedsbeitrag tribe Vorarlberg';
export const MEMBERSHIP_LEDGER_CATEGORY = 'Mitgliedsbeitrag';
export const MEMBERSHIP_LEDGER_DESCRIPTION = 'Mitgliedsbeitrag Pioniere via Mollie (monatlich)';

/** Ticks of the wizard, all required. KEEP IN SYNC with src/utils/clubMembership.js. */
export const MEMBERSHIP_REQUIRED_CONSENTS: readonly string[] = ['statuten', 'datenschutz'];

export const MEMBER_NAME_MIN = 2;
export const MEMBER_NAME_MAX = 80;

export type MembershipStatus = 'pending' | 'active' | 'cancelled' | 'ended';
export type MembershipMode = 'off' | 'admins' | 'all';

export interface MembershipSettings {
  mode: MembershipMode;
  statutesUrl: string;
  statutesVersion: string;
}

/** app_settings/membership -> settings; a missing doc or unknown mode means off. */
export function parseMembershipSettings(data: unknown): MembershipSettings {
  const d = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const mode = d.mode === 'admins' || d.mode === 'all' ? d.mode : 'off';
  const statutesUrl = typeof d.statutesUrl === 'string' ? d.statutesUrl.trim() : '';
  const statutesVersion = typeof d.statutesVersion === 'string' ? d.statutesVersion.trim() : '';
  return { mode, statutesUrl, statutesVersion };
}

/** A monthly amount in EUR: at least 3 €, at most 1000 €, whole cents. */
export function isValidMembershipAmount(value: unknown): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  if (value < MIN_MEMBERSHIP_AMOUNT || value > MAX_MEMBERSHIP_AMOUNT) return false;
  return Math.abs(Math.round(value * 100) - value * 100) < 1e-6;
}

export function normalizeMemberName(raw: unknown): string | null {
  const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (name.length < MEMBER_NAME_MIN || name.length > MEMBER_NAME_MAX) return null;
  return name;
}

/** Exactly the required ticks, each once. */
export function hasAllMembershipConsents(raw: unknown): boolean {
  if (!Array.isArray(raw) || !raw.every((c) => typeof c === 'string')) return false;
  const set = new Set(raw as string[]);
  return (
    set.size === raw.length &&
    set.size === MEMBERSHIP_REQUIRED_CONSENTS.length &&
    MEMBERSHIP_REQUIRED_CONSENTS.every((c) => set.has(c))
  );
}

/**
 * Still a member on `today` (YYYY-MM-DD, Vienna)? Active always; gekündigt until
 * the paid period is over; pending (not paid yet) and ended never.
 */
export function isMembershipRunning(
  doc: { status?: unknown; paidUntil?: unknown } | null | undefined,
  today: string
): boolean {
  if (!doc) return false;
  if (doc.status === 'active') return true;
  if (doc.status !== 'cancelled') return false;
  return typeof doc.paidUntil === 'string' && doc.paidUntil > today;
}

/** A gekündigt membership whose paid period is over on `today`. */
export function isMembershipDueToEnd(
  doc: { status?: unknown; paidUntil?: unknown } | null | undefined,
  today: string
): boolean {
  if (!doc || doc.status !== 'cancelled') return false;
  return typeof doc.paidUntil !== 'string' || doc.paidUntil <= today;
}

/** The later of two YYYY-MM-DD dates (null-safe). */
export function laterDate(a: unknown, b: string): string {
  return typeof a === 'string' && a > b ? a : b;
}

/**
 * Vorteile der Pioniere-Mitgliedschaft (Entwurf, von Peter zu prüfen). Shown in
 * the wizard and in the confirmation mail. KEEP IN SYNC with MEMBERSHIP_BENEFITS
 * in src/utils/clubMembership.js (tests/lib/clubMembership.spec.ts compares both).
 */
export const MEMBERSHIP_BENEFITS: readonly string[] = [
  'Du nimmst an ausgewählten Vereinsveranstaltungen teil.',
  'Du trägst den Tribe mit: Dein Beitrag finanziert Webhosting, Technik und Flyer.',
  'Dein Profilfoto bekommt das Pioniere-Abzeichen.',
];

/** "12,90 €" */
export function formatMembershipAmount(value: number | string): string {
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(n)) return `${value} €`;
  return `${n.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}
