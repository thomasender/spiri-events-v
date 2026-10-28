/**
 * Super-Admin callable that creates a NEW region (UI: Verwaltung -> "Zuordnung",
 * "Neue Region anlegen"). The region starts inactive and empty; its districts
 * are assigned afterwards with adminSaveRegionMapping, it is switched on in the
 * "Regionen" tab like every other region.
 *
 *   adminCreateRegion({ name, country, inPhrase? })
 *
 * What it writes (one batch, Admin SDK, so firestore.rules do not apply):
 * - `regions/{slug}` with `custom: true` and the wording the generated register
 *   carries for the built-in regions (country, inPhrase, forPhrase, ...);
 * - `app_settings/customRegions` { ids }, the list firestore.rules reads to accept
 *   the new id on events, profiles, moderators and donors (the rules cannot list
 *   the regions collection);
 * - an `admin_audit_log` entry (`createRegion`).
 *
 * The slug is derived from the name (umlauts transliterated). It must not clash
 * with a region, a combined view, a reserved route or an existing username,
 * because region addresses share the top-level URL space with profiles.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { initializeApp, getApps } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { appCheckOptions, logMissingAppCheck } from './appCheck';
import { assertSuperAdmin, readRoleDoc, type RoleDocReader } from './staffRoles';
import { ALLOWED_ORIGINS } from './allowedOrigins';
import { AUDIT_LOG_COLLECTION } from './adminModerators';
import { ensureCustomRegions } from './customRegions';
import { COMBINED_VIEWS, LEGACY_REGION_ALIASES, REGION_IDS } from './regions';
import { buildMappingRegisters, type MappingRegion } from './regionMapping';

if (getApps().length === 0) {
  initializeApp();
}

type Doc = Record<string, unknown>;

export const CUSTOM_REGIONS_DOC = 'customRegions';
export const NAME_MIN = 2;
export const NAME_MAX = 60;
export const PHRASE_MAX = 80;
const SLUG_MAX = 40;

/**
 * Top-level routes of the app that no region address may shadow. Synced copy of
 * the plain names in RESERVED_USERNAMES (src/utils/username.js), guarded by
 * tests/lib/functionsRegions.spec.ts. Region ids and combined views are checked
 * separately.
 */
export const RESERVED_ROUTES: readonly string[] = [
  'admin',
  'profil',
  'profile',
  'login',
  'registrieren',
  'register',
  'event',
  'events',
  'calendar',
  'verzeichnis',
  'favoriten',
  'chat',
  'postfach',
  'kalender',
  'spenden',
  'spenden-danke',
  'ueber-uns',
  'about',
  'datenschutz',
  'impressum',
  'auth-action',
  'login-anleitungen',
  'api',
  'static',
  'public',
  'assets',
  'austria',
  'online',
  'regionen',
  'region',
];

const COUNTRY_DEFAULTS: Record<string, { timezone: string; subdivisionLabel: string }> = {
  AT: { timezone: 'Europe/Vienna', subdivisionLabel: 'Bezirk' },
  DE: { timezone: 'Europe/Berlin', subdivisionLabel: 'Landkreis' },
  CH: { timezone: 'Europe/Zurich', subdivisionLabel: 'Bezirk' },
};

export interface CreateRegionInput {
  name: string;
  country: 'AT' | 'DE' | 'CH';
  inPhrase: string;
}

export interface CreateRegionResult {
  regionId: string;
  name: string;
}

export interface CreateRegionDeps {
  readRoleDoc: RoleDocReader;
  /** All `regions/{id}` docs. */
  listRegionDocs: () => Promise<Array<{ id: string; data: Doc }>>;
  /** True when a user already has this username (the address would be taken). */
  usernameTaken: (slug: string) => Promise<boolean>;
  /** Writes the region doc, the id list for the rules and the audit entry in one batch. */
  commit: (args: {
    actorUid: string;
    regionId: string;
    region: Doc;
    order: number;
  }) => Promise<void>;
}

interface CallableRequest {
  auth?: { uid?: string } | null;
  data?: unknown;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');

/** "Oberes Mittelrheintal" -> "oberes-mittelrheintal"; umlauts and ß are transliterated. */
export function slugifyRegionName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, '');
}

export function parseCreateRegionInput(raw: unknown): CreateRegionInput {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Doc;
  const name = str(data.name);
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    throw new HttpsError('invalid-argument', 'The name must have 2 to 60 characters.', {
      reason: 'invalid-name',
    });
  }
  if (data.country !== 'AT' && data.country !== 'DE' && data.country !== 'CH') {
    throw new HttpsError('invalid-argument', 'country must be AT, DE or CH.', {
      reason: 'invalid-country',
    });
  }
  const inPhrase = str(data.inPhrase) || `in ${name}`;
  if (inPhrase.length > PHRASE_MAX) {
    throw new HttpsError('invalid-argument', 'The phrase is too long.', {
      reason: 'invalid-phrase',
    });
  }
  return { name, country: data.country, inPhrase };
}

/** Why a slug cannot be used as a new region address, or null when it is free. */
export function reservedSlugReason(slug: string): 'invalid-name' | 'slug-reserved' | null {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length < 2) return 'invalid-name';
  if (
    REGION_IDS.includes(slug) ||
    slug in LEGACY_REGION_ALIASES ||
    COMBINED_VIEWS.some((v) => v.slug === slug) ||
    RESERVED_ROUTES.includes(slug)
  ) {
    return 'slug-reserved';
  }
  return null;
}

/** `order` that sorts the new region behind every region of its country. */
export function nextRegionOrder(regions: readonly MappingRegion[], country: string): number {
  const orders = regions.filter((r) => r.country === country).map((r) => r.order);
  const max = orders.length ? Math.max(...orders) : regions.length;
  return Math.round((max + 0.001) * 1000) / 1000;
}

export async function createRegionHandler(
  request: CallableRequest,
  deps: CreateRegionDeps
): Promise<CreateRegionResult> {
  const actorUid = request.auth?.uid;
  await assertSuperAdmin(actorUid, deps.readRoleDoc);
  const input = parseCreateRegionInput(request.data);

  const slug = slugifyRegionName(input.name);
  const reason = reservedSlugReason(slug);
  if (reason) {
    throw new HttpsError('failed-precondition', 'This name cannot be used.', { reason });
  }

  const regions = buildMappingRegisters(await deps.listRegionDocs());
  const lower = input.name.toLowerCase();
  if (regions.some((r) => r.name.toLowerCase() === lower)) {
    throw new HttpsError('already-exists', 'A region with this name exists already.', {
      reason: 'name-taken',
    });
  }
  if (await deps.usernameTaken(slug)) {
    throw new HttpsError('failed-precondition', 'The address is used by a profile.', {
      reason: 'slug-reserved',
    });
  }

  const defaults = COUNTRY_DEFAULTS[input.country];
  const order = nextRegionOrder(regions, input.country);
  await deps.commit({
    actorUid: actorUid as string,
    regionId: slug,
    order,
    region: {
      name: input.name,
      slug,
      active: false,
      bezirke: [],
      contactEmail: '',
      seo: { title: '', description: '' },
      timezone: defaults.timezone,
      custom: true,
      country: input.country,
      inPhrase: input.inPhrase,
      forPhrase: input.name,
      demonym: '',
      subdivisionLabel: defaults.subdivisionLabel,
    },
  });
  return { regionId: slug, name: input.name };
}

// ── Firebase wiring ──────────────────────────────────────────────────────

const deps: CreateRegionDeps = {
  readRoleDoc,
  async listRegionDocs() {
    const snap = await getFirestore().collection('regions').get();
    return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
  },
  async usernameTaken(slug) {
    const snap = await getFirestore()
      .collection('users')
      .where('username', '==', slug)
      .limit(1)
      .get();
    return !snap.empty;
  },
  async commit({ actorUid, regionId, region, order }) {
    const db = getFirestore();
    const batch = db.batch();
    batch.create(db.collection('regions').doc(regionId), {
      ...region,
      order,
      // An empty list only counts as "assigned" with this marker (see mergeRegions).
      mappingUpdatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    batch.set(
      db.collection('app_settings').doc(CUSTOM_REGIONS_DOC),
      { ids: FieldValue.arrayUnion(regionId), updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    batch.create(db.collection(AUDIT_LOG_COLLECTION).doc(), {
      action: 'createRegion',
      actorUid,
      regionId,
      name: region.name,
      country: region.country,
      createdAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
  },
};

export const adminCreateRegion = onCall(
  { region: 'europe-west3', cors: ALLOWED_ORIGINS, ...appCheckOptions() },
  async (request): Promise<CreateRegionResult> => {
    logMissingAppCheck('adminCreateRegion', request);
    const result = await createRegionHandler(request, deps);
    await ensureCustomRegions(true);
    logger.info('adminCreateRegion', { actorUid: request.auth?.uid, regionId: result.regionId });
    return result;
  }
);
