import { describe, expect, it } from 'vitest';
import {
  importAcceptCandidateHandler,
  importRejectCandidateHandler,
  parseAcceptInput,
  parseRejectInput,
  type AcceptWrite,
  type ImportAdminDeps,
  type RejectWrite,
} from '../../functions/src/eventImportAdmin';
import { blocklistId } from '../../functions/src/eventImport';

type Doc = Record<string, unknown>;

const NOW = new Date('2026-11-18T10:00:00Z');
const ADMIN = { auth: { uid: 'admin1' } };

const candidateDoc = (over: Doc = {}): Doc => ({
  regionId: 'zuerich',
  organizerRef: 'soulcity-ch',
  sourceUrl: 'https://www.soulcity.ch/events/kakao',
  sourceType: 'llm',
  status: 'found',
  eventId: null,
  imageUrl: 'https://www.soulcity.ch/kakao.jpg',
  rawExtract: {
    title: 'Kakao-Zeremonie',
    date: '2026-12-01',
    time: '19:00',
    place: 'Studio 1',
    city: 'Zürich',
    bezirk: 'Stadt Zürich',
    contribution: 'fee',
    fee: 35,
    priceCurrency: 'CHF',
    description: 'Ein Abend mit Kakao.',
    link: 'https://www.soulcity.ch/events/kakao',
    category: 'Meditation',
  },
  ...over,
});
const organizerDoc = (over: Doc = {}): Doc => ({
  name: 'Soul City',
  website: 'https://www.soulcity.ch/',
  contactEmail: 'info@soulcity.ch',
  legalForm: 'company',
  regionId: 'zuerich',
  consent: 'none',
  syncMode: 'curated_once',
  ...over,
});

interface World {
  candidates: Record<string, Doc>;
  organizers: Record<string, Doc>;
  roles: Record<string, Doc>;
  curatorUid: string | null;
  blocked: string[];
  takenSlugs: string[];
  accepts: AcceptWrite[];
  rejects: RejectWrite[];
}

function setup(over: Partial<World> = {}) {
  const world: World = {
    candidates: { c1: candidateDoc() },
    organizers: { 'soulcity-ch': organizerDoc() },
    roles: { admin1: { role: 'Admin' }, mod1: { role: 'RegionModerator', regionIds: ['zuerich'] } },
    curatorUid: 'curator1',
    blocked: [],
    takenSlugs: [],
    accepts: [],
    rejects: [],
    ...over,
  };
  const deps: ImportAdminDeps = {
    readRoleDoc: async (uid: string) => world.roles[uid] ?? null,
    getCandidate: async (id) => world.candidates[id] ?? null,
    getOrganizer: async (id) => world.organizers[id] ?? null,
    readCuratorUid: async () => world.curatorUid,
    listBlockedIds: async () => new Set(world.blocked),
    isSlugTaken: async (slug) => world.takenSlugs.includes(slug),
    commitAccept: async (write) => {
      world.accepts.push(write);
      return { eventId: 'ev-new', created: true };
    },
    commitReject: async (write) => {
      world.rejects.push(write);
    },
    now: () => NOW,
  };
  return { world, deps };
}

const accept = (deps: ImportAdminDeps, data: unknown, request: Doc = ADMIN) =>
  importAcceptCandidateHandler({ ...request, data }, deps);

async function reason(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    const e = err as { code?: string; details?: { reason?: string } };
    return e.details?.reason ?? e.code ?? 'unknown';
  }
  return 'no-error';
}

describe('parse inputs', () => {
  it('needs a candidateId and (reject) a reason', () => {
    expect(() => parseAcceptInput({})).toThrow();
    expect(() => parseAcceptInput({ candidateId: 'a/b' })).toThrow();
    expect(() => parseAcceptInput({ candidateId: 'c1', force: 'yes' })).toThrow();
    expect(parseAcceptInput({ candidateId: ' c1 ' })).toEqual({ candidateId: 'c1', force: false });
    expect(() => parseRejectInput({ candidateId: 'c1' })).toThrow();
    expect(() => parseRejectInput({ candidateId: 'c1', reason: 'x'.repeat(501) })).toThrow();
    expect(parseRejectInput({ candidateId: 'c1', reason: ' kein Event ' })).toEqual({
      candidateId: 'c1',
      reason: 'kein Event',
    });
  });
});

describe('importAcceptCandidate', () => {
  it('creates a pending curated event owned by the curator, with slug, without consent or images', async () => {
    const { deps, world } = setup();
    const result = await accept(deps, { candidateId: 'c1' });
    expect(result).toMatchObject({ candidateId: 'c1', eventId: 'ev-new', created: true });
    expect(result.slug).toBe('kakao-zeremonie-meditation-in-zuerich-20261201');

    const [write] = world.accepts;
    expect(write.candidateId).toBe('c1');
    const e = write.eventData;
    expect(e).toMatchObject({
      status: 'pending',
      createdBy: 'curator1',
      regionId: 'zuerich',
      title: 'Kakao-Zeremonie',
      bezirk: 'Stadt Zürich',
      category: 'Meditation',
      slug: 'kakao-zeremonie-meditation-in-zuerich-20261201',
      instagramConsent: false,
      organizer: { name: 'Soul City', email: '' },
    });
    expect((e.curation as Doc).organizerRef).toBe('soulcity-ch');
    expect(e.curation as Doc).not.toHaveProperty('consentAt');
    for (const key of ['imageUrl', 'imageThumbUrl', 'imagePath', 'imageStoragePath']) {
      expect(e).not.toHaveProperty(key);
    }
    expect(write.audit).toMatchObject({
      action: 'importAcceptCandidate',
      actorUid: 'admin1',
      candidateId: 'c1',
      organizerRef: 'soulcity-ch',
      regionId: 'zuerich',
      force: false,
    });
  });

  it('picks a free slug when the first one is taken', async () => {
    const { deps, world } = setup({
      takenSlugs: ['kakao-zeremonie-meditation-in-zuerich-20261201'],
    });
    const result = await accept(deps, { candidateId: 'c1' });
    expect(result.slug).toBe('kakao-zeremonie-meditation-in-zuerich-20261201-2');
    expect(world.accepts[0].eventData.slug).toBe(result.slug);
  });

  it('is Super-Admin only', async () => {
    const { deps, world } = setup();
    expect(await reason(accept(deps, { candidateId: 'c1' }, {}))).toBe('unauthenticated');
    expect(await reason(accept(deps, { candidateId: 'c1' }, { auth: { uid: 'mod1' } }))).toBe(
      'permission-denied'
    );
    expect(await reason(accept(deps, { candidateId: 'c1' }, { auth: { uid: 'nobody' } }))).toBe(
      'permission-denied'
    );
    expect(world.accepts).toHaveLength(0);
  });

  it('refuses a blocked organizer (by mail or website domain) and a declined one', async () => {
    for (const blocked of ['info@soulcity.ch', 'soulcity.ch']) {
      const { deps, world } = setup({ blocked: [blocklistId(blocked)] });
      expect(await reason(accept(deps, { candidateId: 'c1' }))).toBe('blocked');
      expect(world.accepts).toHaveLength(0);
    }
    const declined = setup({
      organizers: { 'soulcity-ch': organizerDoc({ consent: 'declined' }) },
    });
    expect(await reason(accept(declined.deps, { candidateId: 'c1' }))).toBe('organizer-declined');
  });

  it('accepts individuals like everyone else (no pilot exclusion), without a name on the event', async () => {
    const { deps, world } = setup({
      candidates: { c1: candidateDoc({ pilotExcluded: true }) },
      organizers: { 'soulcity-ch': organizerDoc({ legalForm: 'individual' }) },
    });
    await accept(deps, { candidateId: 'c1' });
    expect(world.accepts).toHaveLength(1);
    // Individuals never get a name on the event.
    expect((world.accepts[0].eventData.organizer as Doc).name).toBe('');
  });

  it('refuses a blocked organizer', async () => {
    const { deps } = setup({
      blocked: [blocklistId('soulcity.ch')],
      candidates: { c1: candidateDoc() },
    });
    expect(await reason(accept(deps, { candidateId: 'c1' }))).toBe('blocked');
  });

  it('needs the curator account, an existing organizer and an open candidate', async () => {
    expect(await reason(accept(setup({ curatorUid: null }).deps, { candidateId: 'c1' }))).toBe(
      'no-curator'
    );
    expect(await reason(accept(setup({ organizers: {} }).deps, { candidateId: 'c1' }))).toBe(
      'organizer-missing'
    );
    expect(await reason(accept(setup().deps, { candidateId: 'nope' }))).toBe('not-found');
    for (const status of ['rejected']) {
      const { deps } = setup({ candidates: { c1: candidateDoc({ status }) } });
      expect(await reason(accept(deps, { candidateId: 'c1' }))).toBe('status');
    }
  });

  it('hands back the existing event when the candidate was accepted already', async () => {
    const { deps, world } = setup({
      candidates: { c1: candidateDoc({ status: 'published', eventId: 'ev-old' }) },
    });
    expect(await accept(deps, { candidateId: 'c1' })).toMatchObject({
      eventId: 'ev-old',
      created: false,
    });
    expect(world.accepts).toHaveLength(0);
  });

  it('turns an unusable candidate into invalid-argument', async () => {
    const { deps } = setup({ candidates: { c1: candidateDoc({ rawExtract: { title: 'x' } }) } });
    expect(await reason(accept(deps, { candidateId: 'c1' }))).toBe('invalid-argument');
  });
});

describe('importRejectCandidate', () => {
  const reject = (deps: ImportAdminDeps, data: unknown, request: Doc = ADMIN) =>
    importRejectCandidateHandler({ ...request, data }, deps);

  it('rejects an open candidate with reason and audit entry', async () => {
    const { deps, world } = setup();
    expect(await reject(deps, { candidateId: 'c1', reason: 'kein passendes Event' })).toEqual({
      candidateId: 'c1',
      changed: true,
    });
    expect(world.rejects[0]).toMatchObject({
      candidateId: 'c1',
      reason: 'kein passendes Event',
      audit: { action: 'importRejectCandidate', actorUid: 'admin1', regionId: 'zuerich' },
    });
  });

  it('is a no-op for an already rejected candidate and refuses published ones', async () => {
    const done = setup({ candidates: { c1: candidateDoc({ status: 'rejected' }) } });
    expect(await reject(done.deps, { candidateId: 'c1', reason: 'x' })).toMatchObject({
      changed: false,
    });
    expect(done.world.rejects).toHaveLength(0);
    const live = setup({ candidates: { c1: candidateDoc({ status: 'published', eventId: 'e' }) } });
    expect(await reason(reject(live.deps, { candidateId: 'c1', reason: 'x' }))).toBe('status');
  });

  it('is Super-Admin only', async () => {
    const { deps, world } = setup();
    expect(
      await reason(reject(deps, { candidateId: 'c1', reason: 'x' }, { auth: { uid: 'mod1' } }))
    ).toBe('permission-denied');
    expect(world.rejects).toHaveLength(0);
  });
});
