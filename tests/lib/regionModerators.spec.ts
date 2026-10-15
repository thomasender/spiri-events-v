import { describe, it, expect } from 'vitest';
import {
  parseStaffRole,
  validateModeratorRegionIds,
  profileModerationRegionIds,
  profileVisibleToModerator,
  profileEditableByModerator,
  assertStaff,
  assertSuperAdmin,
} from '../../functions/src/staffRoles';
import {
  setRegionModeratorHandler,
  listRegionModeratorsHandler,
  type AuditEntry,
  type RoleTransaction,
  type TargetUser,
} from '../../functions/src/adminModerators';
import {
  listMembersHandler,
  updateMemberHandler,
  type AuthRecord,
} from '../../functions/src/adminMembers';
import { isSuperAdminDoc } from '../../functions/src/adminEmails';
import { parseModeratorRegions, planModeratorPromotion } from '../../src/utils/staffRoles';

type Doc = Record<string, unknown>;

// In-memory admin_users + Auth. Transactions buffer their writes and apply
// them only if the callback succeeds, like Firestore.
function makeWorld(
  roles: Record<string, Doc> = {},
  users: Record<string, Partial<TargetUser>> = {}
) {
  const roleDocs = new Map<string, Doc>(Object.entries(roles));
  const authUsers = new Map<string, TargetUser>(
    Object.entries(users).map(([uid, u]) => [uid, { uid, ...u }])
  );
  const audit: AuditEntry[] = [];
  let writes = 0;
  const readRoleDoc = async (uid: string) => roleDocs.get(uid) ?? null;
  const deps = {
    readRoleDoc,
    getUser: async (uid: string) => authUsers.get(uid) ?? null,
    async runTransaction<T>(fn: (tx: RoleTransaction) => Promise<T>): Promise<T> {
      const pending: Array<() => void> = [];
      const tx: RoleTransaction = {
        getRoleDoc: readRoleDoc,
        setModerator: (uid, data) =>
          pending.push(() => roleDocs.set(uid, { role: 'RegionModerator', ...data })),
        deleteRoleDoc: (uid) => pending.push(() => roleDocs.delete(uid)),
        addAuditEntry: (entry) => pending.push(() => audit.push(entry)),
      };
      const result = await fn(tx);
      pending.forEach((w) => {
        writes += 1;
        w();
      });
      return result;
    },
  };
  return { roleDocs, audit, deps, writes: () => writes };
}

const ADMIN = { role: 'Admin' };
const call = (uid: string | null, data: unknown) => ({ auth: uid ? { uid } : null, data });

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ code });
}

describe('parseStaffRole', () => {
  it('recognises Super-Admins and moderators with valid regions only', () => {
    expect(parseStaffRole({ role: 'Admin' })).toEqual({ kind: 'superAdmin' });
    expect(
      parseStaffRole({ role: 'RegionModerator', regionIds: ['wien', 'tirol', 'bayern'] })
    ).toEqual({ kind: 'regionModerator', regionIds: ['tirol', 'wien'] });
    for (const doc of [
      null,
      {},
      { role: 'admin' },
      { role: 'User' },
      { role: 'RegionModerator' },
      { role: 'RegionModerator', regionIds: 'tirol' },
      { role: 'RegionModerator', regionIds: [] },
      { role: 'RegionModerator', regionIds: ['bayern'] },
    ]) {
      expect(parseStaffRole(doc)).toBeNull();
    }
  });
});

describe('validateModeratorRegionIds', () => {
  it('accepts up to all ten regions in canonical order, [] = revoke', () => {
    expect(validateModeratorRegionIds(['wien', 'tirol'])).toEqual(['tirol', 'wien']);
    expect(validateModeratorRegionIds([])).toEqual([]);
    expect(validateModeratorRegionIds(['allgaeu', 'steiermark'])).toEqual([
      'steiermark',
      'allgaeu',
    ]);
  });
  it('rejects unknown ids, duplicates, non-lists and too many entries', () => {
    for (const bad of [
      'tirol',
      null,
      ['bayern'],
      ['oesterreich'],
      ['Tirol'],
      ['tirol', 'tirol'],
      [5],
      Array(11).fill('tirol'),
    ]) {
      expect(() => validateModeratorRegionIds(bad)).toThrow();
    }
  });
});

describe('profile regions for moderators', () => {
  it('no profile = no region, legacy profile = Vorarlberg, malformed = none', () => {
    expect(profileModerationRegionIds(undefined)).toEqual([]);
    expect(profileModerationRegionIds({})).toEqual(['vorarlberg']);
    expect(profileModerationRegionIds({ directoryRegionIds: ['tirol', 'tirol'] })).toEqual([
      'tirol',
    ]);
    expect(profileModerationRegionIds({ directoryRegionIds: ['tirol', 'bayern'] })).toBeNull();
    expect(profileModerationRegionIds({ directoryRegionIds: 'tirol' })).toBeNull();
  });

  it('read: any overlap; write: entirely inside her regions', () => {
    const tirolWien = { directoryRegionIds: ['tirol', 'wien'] };
    expect(profileVisibleToModerator(tirolWien, ['tirol'])).toBe(true);
    expect(profileEditableByModerator(tirolWien, ['tirol'])).toBe(false);
    expect(profileEditableByModerator(tirolWien, ['tirol', 'wien'])).toBe(true);
    expect(profileEditableByModerator({ directoryRegionIds: [] }, ['tirol'])).toBe(false);
    expect(profileVisibleToModerator({ directoryRegionIds: [] }, ['tirol'])).toBe(false);
    expect(profileEditableByModerator(undefined, ['vorarlberg'])).toBe(false);
  });
});

describe('assertStaff / assertSuperAdmin', () => {
  const read = async (uid: string) =>
    ({ a: ADMIN, m: { role: 'RegionModerator', regionIds: ['tirol'] } })[uid] ?? null;

  it('Super-Admin passes both, moderator only assertStaff, others neither', async () => {
    await expect(assertSuperAdmin('a', read)).resolves.toBeUndefined();
    await expect(assertStaff('a', read)).resolves.toEqual({ kind: 'superAdmin' });
    await expect(assertStaff('m', read)).resolves.toEqual({
      kind: 'regionModerator',
      regionIds: ['tirol'],
    });
    await expectCode(assertSuperAdmin('m', read), 'permission-denied');
    await expectCode(assertStaff('u', read), 'permission-denied');
    await expectCode(assertStaff(undefined, read), 'unauthenticated');
  });
});

describe('adminSetRegionModerator', () => {
  const users = {
    admin: { email: 'admin@x.at' },
    admin2: { email: 'admin2@x.at' },
    claimAdmin: { email: 'c@x.at', customClaims: { role: 'Admin' } },
    user: { email: 'user@x.at' },
    mod: { email: 'mod@x.at' },
    odd: { email: 'odd@x.at' },
  };
  const world = () =>
    makeWorld(
      {
        admin: ADMIN,
        admin2: ADMIN,
        mod: { role: 'RegionModerator', regionIds: ['tirol'] },
        odd: { email: 'odd@x.at' },
      },
      users
    );

  it('only a Super-Admin may call it', async () => {
    const w = world();
    const data = { uid: 'user', regionIds: ['tirol'] };
    await expectCode(setRegionModeratorHandler(call(null, data), w.deps), 'unauthenticated');
    await expectCode(setRegionModeratorHandler(call('user', data), w.deps), 'permission-denied');
    await expectCode(setRegionModeratorHandler(call('mod', data), w.deps), 'permission-denied');
    // A token claim alone is not enough (same as the other admin callables).
    await expectCode(
      setRegionModeratorHandler(call('claimAdmin', data), w.deps),
      'permission-denied'
    );
    expect(w.roleDocs.has('user')).toBe(false);
    expect(w.audit).toEqual([]);
  });

  it('grants, changes and revokes, with one audit entry per change', async () => {
    const w = world();
    const grant = await setRegionModeratorHandler(
      call('admin', { uid: 'user', regionIds: ['steiermark', 'tirol'] }),
      w.deps
    );
    expect(grant).toEqual({
      uid: 'user',
      role: 'RegionModerator',
      regionIds: ['tirol', 'steiermark'],
      changed: true,
    });
    expect(w.roleDocs.get('user')).toEqual({
      role: 'RegionModerator',
      regionIds: ['tirol', 'steiermark'],
      email: 'user@x.at',
      updatedBy: 'admin',
    });

    await setRegionModeratorHandler(call('admin', { uid: 'user', regionIds: ['wien'] }), w.deps);
    expect(w.roleDocs.get('user')?.regionIds).toEqual(['wien']);

    const revoke = await setRegionModeratorHandler(
      call('admin2', { uid: 'user', regionIds: [] }),
      w.deps
    );
    expect(revoke).toEqual({ uid: 'user', role: null, regionIds: [], changed: true });
    expect(w.roleDocs.has('user')).toBe(false);

    expect(w.audit.map((e) => [e.action, e.actorUid, e.before, e.after])).toEqual([
      [
        'grantRegionModerator',
        'admin',
        null,
        { role: 'RegionModerator', regionIds: ['tirol', 'steiermark'] },
      ],
      [
        'updateRegionModerator',
        'admin',
        { role: 'RegionModerator', regionIds: ['tirol', 'steiermark'] },
        { role: 'RegionModerator', regionIds: ['wien'] },
      ],
      ['revokeRegionModerator', 'admin2', { role: 'RegionModerator', regionIds: ['wien'] }, null],
    ]);
    expect(w.audit.every((e) => e.targetUid === 'user' && e.targetEmail === 'user@x.at')).toBe(
      true
    );
  });

  it('is idempotent: same regions or revoking a non-moderator writes nothing', async () => {
    const w = world();
    const same = await setRegionModeratorHandler(
      call('admin', { uid: 'mod', regionIds: ['tirol'] }),
      w.deps
    );
    expect(same.changed).toBe(false);
    const none = await setRegionModeratorHandler(
      call('admin', { uid: 'user', regionIds: [] }),
      w.deps
    );
    expect(none).toEqual({ uid: 'user', role: null, regionIds: [], changed: false });
    expect(w.writes()).toBe(0);
  });

  it('never touches Super-Admins (doc or claim) or docs without a moderator role', async () => {
    const w = world();
    for (const uid of ['admin2', 'claimAdmin', 'odd']) {
      for (const regionIds of [['tirol'], []]) {
        await expectCode(
          setRegionModeratorHandler(call('admin', { uid, regionIds }), w.deps),
          'failed-precondition'
        );
      }
    }
    expect(w.roleDocs.get('admin2')).toEqual(ADMIN);
    expect(w.roleDocs.get('odd')).toEqual({ email: 'odd@x.at' });
    expect(w.audit).toEqual([]);
  });

  it('a Super-Admin cannot target herself (no self-demotion, so the last one stays)', async () => {
    const w = makeWorld({ admin: ADMIN }, users);
    for (const regionIds of [['tirol'], []]) {
      await expectCode(
        setRegionModeratorHandler(call('admin', { uid: 'admin', regionIds }), w.deps),
        'failed-precondition'
      );
    }
    expect(w.roleDocs.get('admin')).toEqual(ADMIN);
  });

  it('validates uid and regions before writing; unknown accounts are not found', async () => {
    const w = world();
    for (const data of [
      { uid: '', regionIds: ['tirol'] },
      { uid: 'a/b', regionIds: ['tirol'] },
      { uid: 5, regionIds: ['tirol'] },
      { uid: 'user', regionIds: ['bayern'] },
      { uid: 'user', regionIds: ['tirol', 'tirol'] },
      { uid: 'user', regionIds: 'tirol' },
      { uid: 'user' },
    ]) {
      await expectCode(setRegionModeratorHandler(call('admin', data), w.deps), 'invalid-argument');
    }
    await expectCode(
      setRegionModeratorHandler(call('admin', { uid: 'ghost', regionIds: ['tirol'] }), w.deps),
      'not-found'
    );
    expect(w.writes()).toBe(0);
  });
});

describe('adminListRegionModerators', () => {
  const deps = (roles: Record<string, Doc>) => ({
    readRoleDoc: async (uid: string) => roles[uid] ?? null,
    listModeratorDocs: async () =>
      Object.entries(roles)
        .filter(([, d]) => d.role === 'RegionModerator')
        .map(([uid, data]) => ({ uid, data })),
    getUsers: async (uids: string[]) =>
      uids.map((uid) => ({ uid, email: `${uid}@x.at`, displayName: uid.toUpperCase() })),
  });
  const roles = {
    admin: ADMIN,
    zed: { role: 'RegionModerator', regionIds: ['wien', 'tirol'] },
    amy: { role: 'RegionModerator', regionIds: ['steiermark'] },
  };

  it('lists moderators with name, e-mail and regions, for Super-Admins only', async () => {
    const res = await listRegionModeratorsHandler(call('admin', {}), deps(roles));
    expect(res.moderators).toEqual([
      {
        uid: 'amy',
        email: 'amy@x.at',
        displayName: 'AMY',
        disabled: false,
        regionIds: ['steiermark'],
        updatedAt: null,
      },
      {
        uid: 'zed',
        email: 'zed@x.at',
        displayName: 'ZED',
        disabled: false,
        regionIds: ['tirol', 'wien'],
        updatedAt: null,
      },
    ]);
    await expectCode(
      listRegionModeratorsHandler(call('zed', {}), deps(roles)),
      'permission-denied'
    );
    await expectCode(listRegionModeratorsHandler(call(null, {}), deps(roles)), 'unauthenticated');
  });
});

describe('adminListMembers by role', () => {
  const authUsers: AuthRecord[] = [
    { uid: 'tirol', email: 't@x.at', metadata: { lastSignInTime: '2026-01-01T00:00:00Z' } },
    { uid: 'tirolWien', email: 'tw@x.at' },
    { uid: 'legacy', email: 'l@x.at' },
    { uid: 'noProfile', email: 'n@x.at' },
    { uid: 'wien', email: 'w@x.at' },
  ];
  const docs: Record<string, Doc> = {
    'users/tirol/publicProfile/data': { displayName: 'T', directoryRegionIds: ['tirol'] },
    'users/tirol': { instagramConsentDefault: true, socialMedia: { instagram: '@t' } },
    'users/tirolWien/publicProfile/data': {
      displayName: 'TW',
      directoryRegionIds: ['tirol', 'wien'],
    },
    'users/legacy/publicProfile/data': { displayName: 'L' },
    'users/wien/publicProfile/data': { displayName: 'W', directoryRegionIds: ['wien'] },
    'admin_users/wien': { role: 'RegionModerator', regionIds: ['wien'] },
    'admin_users/legacy': { role: 'Admin' },
  };
  const roles: Record<string, Doc> = {
    admin: ADMIN,
    modTirol: { role: 'RegionModerator', regionIds: ['tirol'] },
    modVb: { role: 'RegionModerator', regionIds: ['vorarlberg'] },
  };
  const readPaths: string[][] = [];
  const deps = {
    readRoleDoc: async (uid: string) => roles[uid] ?? null,
    listAuthUsers: async () => authUsers,
    readDocs: async (paths: string[]) => {
      readPaths.push(paths);
      return new Map(paths.filter((p) => docs[p]).map((p) => [p, docs[p]]));
    },
  };

  it('Super-Admin: every member with all fields, as before', async () => {
    const res = await listMembersHandler(call('admin', {}), deps);
    expect(res.scope).toEqual({ role: 'Admin' });
    expect(res.members.map((m) => m.uid)).toEqual(authUsers.map((u) => u.uid));
    expect(res.members[0]).toMatchObject({
      email: 't@x.at',
      instagramConsent: true,
      instagramHandle: '@t',
      directoryRegionIds: ['tirol'],
    });
  });

  it('Super-Admin: each member carries the existing staff role (for the Moderation tab)', async () => {
    const withClaim = {
      ...deps,
      listAuthUsers: async () =>
        authUsers.map((u) =>
          u.uid === 'noProfile' ? { ...u, customClaims: { role: 'Admin' } } : u
        ),
    };
    const res = await listMembersHandler(call('admin', {}), withClaim);
    const roles = Object.fromEntries(
      res.members.map((m) => [m.uid, (m as { staffRole?: unknown }).staffRole])
    );
    expect(roles).toEqual({
      tirol: null,
      tirolWien: null,
      legacy: 'Admin',
      noProfile: 'Admin',
      wien: 'RegionModerator',
    });
  });

  it('moderator: only members of her regions, no e-mail, private reads only for them', async () => {
    readPaths.length = 0;
    const res = await listMembersHandler(call('modTirol', {}), deps);
    expect(res.scope).toEqual({ role: 'RegionModerator', regionIds: ['tirol'] });
    expect(res.members.map((m) => m.uid)).toEqual(['tirol', 'tirolWien']);
    for (const m of res.members) {
      expect(Object.keys(m).sort()).toEqual(
        [
          'uid',
          'displayName',
          'username',
          'slug',
          'photoURL',
          'listedInDirectory',
          'directoryHidden',
          'directoryCategories',
          'directoryRegions',
          'directoryRegionIds',
          'instagramConsent',
          'instagramHandle',
          'createdAt',
        ].sort()
      );
    }
    // Private docs are read only for members of her regions.
    expect(
      readPaths
        .flat()
        .filter((p) => !p.endsWith('/publicProfile/data'))
        .sort()
    ).toEqual(['users/tirol', 'users/tirolWien']);
    expect(res.members[0]).toMatchObject({ instagramConsent: true, instagramHandle: '@t' });

    const vb = await listMembersHandler(call('modVb', {}), deps);
    expect(vb.members.map((m) => m.uid)).toEqual(['legacy']);
  });

  it('everyone else is rejected', async () => {
    await expectCode(listMembersHandler(call('tirol', {}), deps), 'permission-denied');
    await expectCode(listMembersHandler(call(null, {}), deps), 'unauthenticated');
  });
});

describe('adminUpdateMember by role', () => {
  const profiles: Record<string, Doc> = {
    tirol: { directoryRegionIds: ['tirol'], directoryCategories: ['Yoga'] },
    tirolWien: { directoryRegionIds: ['tirol', 'wien'], directoryCategories: ['Yoga'] },
    staff: { directoryRegionIds: ['tirol'], directoryCategories: ['Yoga'] },
  };
  const roles: Record<string, Doc> = {
    admin: ADMIN,
    modTirol: { role: 'RegionModerator', regionIds: ['tirol'] },
    staff: { role: 'RegionModerator', regionIds: ['wien'] },
  };
  function harness() {
    const writes: Array<{ uid: string; update: Doc }> = [];
    const deps = {
      readRoleDoc: async (uid: string) => roles[uid] ?? null,
      readProfiles: async (uid: string) => ({
        publicData: profiles[uid] ?? null,
        privateData: profiles[uid] ? {} : null,
      }),
      writeProfiles: async (uid: string, update: Doc) => {
        writes.push({ uid, update });
      },
    };
    return { deps, writes };
  }

  it('moderator curates directory fields of members entirely in her regions', async () => {
    const { deps, writes } = harness();
    await expect(
      updateMemberHandler(
        call('modTirol', { uid: 'tirol', changes: { listedInDirectory: false } }),
        deps
      )
    ).resolves.toEqual({ ok: true });
    expect(writes.map((w) => w.uid)).toEqual(['tirol']);
  });

  it('moderator cannot edit identity fields, foreign/mixed members or staff', async () => {
    const { deps, writes } = harness();
    for (const [uid, changes] of [
      ['tirol', { displayName: 'X' }],
      ['tirol', { username: 'x' }],
      ['tirolWien', { listedInDirectory: false }],
      ['staff', { listedInDirectory: false }],
      ['nobody', { listedInDirectory: false }],
    ] as const) {
      await expectCode(
        updateMemberHandler(call('modTirol', { uid, changes }), deps),
        'permission-denied'
      );
    }
    expect(writes).toEqual([]);
  });

  it('listing a profile without directoryRegionIds gives it the default region (region queries)', async () => {
    const { deps, writes } = harness();
    profiles.fresh = { displayName: 'Neu' };
    try {
      await updateMemberHandler(
        call('admin', {
          uid: 'fresh',
          changes: { listedInDirectory: true, directoryCategories: ['Yoga'] },
        }),
        deps
      );
      await updateMemberHandler(
        call('admin', { uid: 'tirol', changes: { listedInDirectory: true } }),
        deps
      );
      await updateMemberHandler(
        call('admin', { uid: 'fresh', changes: { listedInDirectory: false } }),
        deps
      );
    } finally {
      delete profiles.fresh;
    }
    expect(writes[0].update.directoryRegionIds).toEqual(['vorarlberg']);
    // existing ids stay, unlisting adds nothing
    expect(writes[1].update).not.toHaveProperty('directoryRegionIds');
    expect(writes[2].update).not.toHaveProperty('directoryRegionIds');
  });

  it('Super-Admin keeps full access; others are rejected; path-like uids refused', async () => {
    const { deps, writes } = harness();
    await updateMemberHandler(
      call('admin', { uid: 'tirolWien', changes: { displayName: 'Neu' } }),
      deps
    );
    expect(writes.map((w) => w.uid)).toEqual(['tirolWien']);
    await expectCode(
      updateMemberHandler(
        call('tirol', { uid: 'tirol', changes: { listedInDirectory: false } }),
        deps
      ),
      'permission-denied'
    );
    await expectCode(
      updateMemberHandler(
        call('admin', { uid: 'x/favorites/y', changes: { displayName: 'Neu' } }),
        deps
      ),
      'invalid-argument'
    );
  });
});

describe('admin mail recipients', () => {
  it('only Super-Admin docs (and legacy docs without a role) receive admin mails', () => {
    expect(isSuperAdminDoc({ role: 'Admin' })).toBe(true);
    expect(isSuperAdminDoc({ email: 'x' })).toBe(true);
    expect(isSuperAdminDoc({ role: 'RegionModerator', regionIds: ['tirol'] })).toBe(false);
    expect(isSuperAdminDoc({ role: 'something' })).toBe(false);
  });
});

describe('promote-admin.mjs --role RegionModerator', () => {
  it('parses --regions into canonical, validated ids', () => {
    expect(parseModeratorRegions('tirol, steiermark')).toEqual(['tirol', 'steiermark']);
    expect(parseModeratorRegions('steiermark,tirol')).toEqual(['tirol', 'steiermark']);
    for (const bad of ['', undefined, 'bayern', 'tirol,tirol', 'oesterreich']) {
      expect(() => parseModeratorRegions(bad)).toThrow();
    }
  });

  it('is idempotent and never converts a Super-Admin', () => {
    const regionIds = ['tirol'];
    expect(planModeratorPromotion({ currentDoc: null, claims: {}, regionIds })).toEqual({
      action: 'write',
      before: null,
      regionIds,
    });
    expect(
      planModeratorPromotion({
        currentDoc: { role: 'RegionModerator', regionIds: ['tirol'] },
        claims: {},
        regionIds,
      })
    ).toEqual({ action: 'unchanged', regionIds });
    expect(
      planModeratorPromotion({
        currentDoc: { role: 'RegionModerator', regionIds: ['wien'] },
        claims: {},
        regionIds,
      })
    ).toEqual({ action: 'write', before: ['wien'], regionIds });
    const refused: Array<[Record<string, unknown> | null, Record<string, unknown>]> = [
      [{ role: 'Admin' }, {}],
      [{ email: 'x' }, {}],
      [null, { role: 'Admin' }],
    ];
    for (const [currentDoc, claims] of refused) {
      expect(planModeratorPromotion({ currentDoc, claims, regionIds }).action).toBe('refuse');
    }
  });
});
