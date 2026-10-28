import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  RESERVED_ROUTES,
  createRegionHandler,
  nextRegionOrder,
  parseCreateRegionInput,
  reservedSlugReason,
  slugifyRegionName,
  type CreateRegionDeps,
} from '../../functions/src/adminCreateRegion';
import {
  REGION_IDS,
  STATIC_REGION_IDS,
  isRegionId,
  mergeFeedRegions,
  registerCustomRegionDocs,
  regionNameOf,
  countryOfRegion,
} from '../../functions/src/regions';
import { buildMappingRegisters } from '../../functions/src/regionMapping';
import { parseStaffRole, validateModeratorRegionIds } from '../../functions/src/staffRoles';
import { RESERVED_USERNAMES } from '../../src/utils/username';
import { mergeRegions, registerCustomRegions } from '../../src/utils/regions';
import { COMBINED_VIEWS, LEGACY_REGION_ALIASES } from '../../functions/src/regions';

type Doc = Record<string, unknown>;

const call = (uid: string | null, data?: unknown) => ({ auth: uid ? { uid } : null, data });

function makeWorld({
  regionDocs = [] as Array<{ id: string; data: Doc }>,
  usernameTaken = false,
} = {}) {
  const commit = vi.fn(async () => {});
  const deps: CreateRegionDeps = {
    readRoleDoc: async (uid) =>
      uid === 'admin'
        ? { role: 'Admin' }
        : uid === 'mod'
          ? { role: 'RegionModerator', regionIds: ['tirol'] }
          : null,
    listRegionDocs: async () => regionDocs,
    usernameTaken: async () => usernameTaken,
    commit,
  };
  return { deps, commit };
}

afterEach(() => {
  registerCustomRegionDocs([]);
  registerCustomRegions([]);
});

describe('slugifyRegionName', () => {
  it.each([
    ['Allgäu', 'allgaeu'],
    ['Oberes Mittelrheintal', 'oberes-mittelrheintal'],
    ['  Höhe & Tiefe!  ', 'hoehe-tiefe'],
    ['Straße', 'strasse'],
    ['Côte d’Azur', 'cote-d-azur'],
  ])('%s -> %s', (name, slug) => {
    expect(slugifyRegionName(name)).toBe(slug);
  });
  it('cuts long names without a trailing dash', () => {
    const slug = slugifyRegionName('a'.repeat(39) + ' bbbb');
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('parseCreateRegionInput', () => {
  it('needs a name of 2-60 characters and AT, DE or CH', () => {
    expect(() => parseCreateRegionInput({ name: 'x', country: 'DE' })).toThrow();
    expect(() => parseCreateRegionInput({ name: 'a'.repeat(61), country: 'DE' })).toThrow();
    expect(() => parseCreateRegionInput({ name: 'Allgäu', country: 'FR' })).toThrow();
    expect(() => parseCreateRegionInput(undefined)).toThrow();
  });
  it('trims, collapses spaces and defaults the phrase', () => {
    expect(parseCreateRegionInput({ name: '  Ober   Allgäu ', country: 'DE' })).toEqual({
      name: 'Ober Allgäu',
      country: 'DE',
      inPhrase: 'in Ober Allgäu',
    });
    expect(
      parseCreateRegionInput({ name: 'Allgäu', country: 'DE', inPhrase: ' im Allgäu ' }).inPhrase
    ).toBe('im Allgäu');
  });
});

describe('reservedSlugReason', () => {
  it('refuses regions, combined views, the retired Allgäu and app routes', () => {
    for (const slug of ['tirol', 'oesterreich', 'alle-tribes', 'allgaeu', 'admin', 'profil']) {
      expect(reservedSlugReason(slug)).toBe('slug-reserved');
    }
  });
  it('refuses names that leave no usable address', () => {
    expect(reservedSlugReason('')).toBe('invalid-name');
    expect(reservedSlugReason('-')).toBe('invalid-name');
  });
  it('accepts a free address', () => {
    expect(reservedSlugReason('allgaeu-schwaben')).toBeNull();
  });
  it('keeps RESERVED_ROUTES in sync with the reserved usernames', () => {
    const regionLike = new Set([
      ...STATIC_REGION_IDS,
      ...Object.keys(LEGACY_REGION_ALIASES),
      ...COMBINED_VIEWS.map((v) => v.slug),
    ]);
    const plain = [...RESERVED_USERNAMES].filter((n) => !regionLike.has(n)).sort();
    expect([...RESERVED_ROUTES].sort()).toEqual(plain);
  });
});

describe('nextRegionOrder', () => {
  it('sorts behind every region of the country', () => {
    const regions = buildMappingRegisters([]);
    const maxDe = Math.max(...regions.filter((r) => r.country === 'DE').map((r) => r.order));
    const order = nextRegionOrder(regions, 'DE');
    expect(order).toBeGreaterThan(maxDe);
    expect(order).toBeLessThan(maxDe + 1);
  });
});

describe('createRegionHandler', () => {
  const input = { name: 'Allgäu-Schwaben', country: 'DE', inPhrase: 'im Allgäu' };

  it('creates an empty, inactive region for a Super-Admin', async () => {
    const { deps, commit } = makeWorld();
    const result = await createRegionHandler(call('admin', input), deps);
    expect(result).toEqual({ regionId: 'allgaeu-schwaben', name: 'Allgäu-Schwaben' });
    expect(commit).toHaveBeenCalledTimes(1);
    const args = (commit.mock.calls[0] as unknown as [Doc])[0];
    expect(args).toMatchObject({
      actorUid: 'admin',
      regionId: 'allgaeu-schwaben',
      region: {
        name: 'Allgäu-Schwaben',
        slug: 'allgaeu-schwaben',
        active: false,
        bezirke: [],
        custom: true,
        country: 'DE',
        inPhrase: 'im Allgäu',
        forPhrase: 'Allgäu-Schwaben',
        subdivisionLabel: 'Landkreis',
        timezone: 'Europe/Berlin',
      },
    });
  });

  it('uses Bezirk and the local timezone in Austria and Switzerland', async () => {
    const at = makeWorld();
    await createRegionHandler(call('admin', { name: 'Walgau', country: 'AT' }), at.deps);
    expect((at.commit.mock.calls[0] as unknown as [Doc])[0].region).toMatchObject({
      subdivisionLabel: 'Bezirk',
      timezone: 'Europe/Vienna',
    });
    const ch = makeWorld();
    await createRegionHandler(call('admin', { name: 'Bodensee Ost', country: 'CH' }), ch.deps);
    expect((ch.commit.mock.calls[0] as unknown as [Doc])[0].region).toMatchObject({
      timezone: 'Europe/Zurich',
    });
  });

  it('is for Super-Admins only', async () => {
    const { deps, commit } = makeWorld();
    await expect(createRegionHandler(call('mod', input), deps)).rejects.toMatchObject({
      code: 'permission-denied',
    });
    await expect(createRegionHandler(call(null, input), deps)).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    expect(commit).not.toHaveBeenCalled();
  });

  it('refuses reserved addresses, taken names and addresses used by a profile', async () => {
    const reserved = makeWorld();
    await expect(
      createRegionHandler(call('admin', { name: 'Tirol', country: 'AT' }), reserved.deps)
    ).rejects.toMatchObject({ details: { reason: 'slug-reserved' } });

    const taken = makeWorld({
      regionDocs: [
        {
          id: 'allgaeu-schwaben',
          data: { custom: true, name: 'allgäu-schwaben', country: 'DE', bezirke: [] },
        },
      ],
    });
    await expect(createRegionHandler(call('admin', input), taken.deps)).rejects.toMatchObject({
      code: 'already-exists',
    });

    const profile = makeWorld({ usernameTaken: true });
    await expect(createRegionHandler(call('admin', input), profile.deps)).rejects.toMatchObject({
      details: { reason: 'slug-reserved' },
    });
    for (const w of [reserved, taken, profile]) expect(w.commit).not.toHaveBeenCalled();
  });
});

describe('custom regions on the server', () => {
  const docs = [
    {
      id: 'allgaeu-schwaben',
      custom: true,
      name: 'Allgäu-Schwaben',
      country: 'DE',
      active: true,
      order: 100.001,
      bezirke: ['Roth'],
    },
    { id: 'tirol', custom: true, name: 'Fake', country: 'AT' },
    { id: 'kein-land', custom: true, name: 'X', country: 'FR' },
    { id: 'nicht-custom', name: 'Y', country: 'DE' },
  ];

  it('registers only valid custom docs, and forgets them again', () => {
    registerCustomRegionDocs(docs);
    expect(isRegionId('allgaeu-schwaben')).toBe(true);
    for (const id of ['kein-land', 'nicht-custom']) expect(isRegionId(id)).toBe(false);
    expect(REGION_IDS).toEqual([...STATIC_REGION_IDS, 'allgaeu-schwaben']);
    expect(regionNameOf('allgaeu-schwaben')).toBe('Allgäu-Schwaben');
    expect(countryOfRegion('allgaeu-schwaben')).toBe('DE');
    registerCustomRegionDocs([]);
    expect(isRegionId('allgaeu-schwaben')).toBe(false);
    expect(REGION_IDS).toEqual([...STATIC_REGION_IDS]);
  });

  it('lets a moderator of a created region keep their rights', () => {
    registerCustomRegionDocs(docs);
    expect(parseStaffRole({ role: 'RegionModerator', regionIds: ['allgaeu-schwaben'] })).toEqual({
      kind: 'regionModerator',
      regionIds: ['allgaeu-schwaben'],
    });
    expect(validateModeratorRegionIds(['allgaeu-schwaben', 'tirol'])).toEqual([
      'tirol',
      'allgaeu-schwaben',
    ]);
  });

  it('the feed register and the mapping register include the region like the client', () => {
    const feed = mergeFeedRegions(docs);
    const fn = feed.find((r) => r.id === 'allgaeu-schwaben');
    expect(fn).toMatchObject({
      name: 'Allgäu-Schwaben',
      country: 'DE',
      active: true,
      bezirke: ['Roth'],
      timezone: 'Europe/Berlin',
    });
    const client = mergeRegions(docs).find((r) => r.id === 'allgaeu-schwaben');
    expect(client).toMatchObject({
      name: fn!.name,
      country: fn!.country,
      active: fn!.active,
      bezirke: fn!.bezirke,
      timezone: fn!.timezone,
    });
    const mapping = buildMappingRegisters(docs.map((d) => ({ id: d.id, data: d })));
    expect(mapping.find((r) => r.id === 'allgaeu-schwaben')).toMatchObject({
      country: 'DE',
      active: true,
      order: 100.001,
      bezirke: ['Roth'],
    });
    expect(mapping.map((r) => r.id)).not.toContain('kein-land');
  });
});
