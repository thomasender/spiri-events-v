import { describe, it, expect } from 'vitest';
import {
  FAKE_PHONE,
  MIRROR_POLICY,
  applyMirror,
  assertStagingTarget,
  buildMirror,
  fakeEmail,
  pseudonymizeName,
  resolveMirrorOptions,
  sanitizeDoc,
  scanLeaks,
  scrubString,
  wipeTargets,
} from '../../src/utils/stagingMirror.js';

// In-memory fetcher over { 'users/u1': {...}, 'users/u1/publicProfile/data': {...} }.
// `reads` records which collections were actually read (dropped ones must not be).
function makeFetcher(store: Record<string, unknown>) {
  const reads: string[] = [];
  const paths = Object.keys(store);
  const childrenOf = (collPath: string) => {
    const depth = collPath.split('/').length + 1;
    return paths.filter((p) => p.startsWith(collPath + '/') && p.split('/').length === depth);
  };
  const fetcher = {
    async listRootCollections() {
      return [...new Set(paths.map((p) => p.split('/')[0]))];
    },
    async listPage(collPath: string) {
      reads.push(collPath);
      return {
        docs: childrenOf(collPath).map((p) => ({ path: p, data: store[p] })),
        nextPageToken: null,
      };
    },
    async listDocumentPaths(collPath: string) {
      const depth = collPath.split('/').length + 1;
      return [
        ...new Set(
          paths
            .filter((p) => p.startsWith(collPath + '/'))
            .map((p) => p.split('/').slice(0, depth).join('/'))
        ),
      ];
    },
    async listSubcollections(docPath: string) {
      const depth = docPath.split('/').length + 1;
      return [
        ...new Set(
          paths
            .filter((p) => p.startsWith(docPath + '/') && p.split('/').length > depth)
            .map((p) => p.split('/')[depth - 1])
        ),
      ];
    },
    async countDocs(collPath: string) {
      return childrenOf(collPath).length;
    },
  };
  return { fetcher, reads };
}

class FakeTimestamp {
  constructor(public seconds: number) {}
}

describe('sanitizer', () => {
  it('is deterministic and case-insensitive for e-mails', () => {
    expect(fakeEmail('Anna@Mail.at')).toBe(fakeEmail('anna@mail.at'));
    expect(fakeEmail('anna@mail.at')).toMatch(/^user-[0-9a-f]{10}@example\.invalid$/);
    expect(fakeEmail('a@b.at')).not.toBe(fakeEmail('c@d.at'));
    const a = sanitizeDoc('events', { organizer: { email: 'x@y.at' } });
    const b = sanitizeDoc('events', { organizer: { email: 'x@y.at' } });
    expect(a).toEqual(b);
  });

  it('replaces e-mail, phone and person names but keeps content fields', () => {
    const { data } = sanitizeDoc('events', {
      title: 'Yoga im Wald',
      slug: 'yoga-im-wald-20260917',
      regionId: 'vorarlberg',
      bezirk: 'Feldkirch',
      status: 'approved',
      createdBy: 'uid123',
      organizer: { firstName: 'Anna', lastName: 'Muster', email: 'anna@mail.at', photoURL: null },
      kontakt: 'anna@mail.at',
      description: '<p>Infos: anna@mail.at oder +43 664 1234567</p>',
      phone: '0664 1234567',
    });
    expect(data.title).toBe('Yoga im Wald');
    expect(data.slug).toBe('yoga-im-wald-20260917');
    expect(data.regionId).toBe('vorarlberg');
    expect(data.bezirk).toBe('Feldkirch');
    expect(data.createdBy).toBe('uid123');
    expect(data.organizer.firstName).toBe('Testperson');
    expect(data.organizer.lastName).toMatch(/^[0-9a-f]{4}$/);
    expect(data.organizer.email).toBe(fakeEmail('anna@mail.at'));
    expect(data.kontakt).toBe(fakeEmail('anna@mail.at'));
    expect(data.description).toBe(`<p>Infos: ${fakeEmail('anna@mail.at')} oder ${FAKE_PHONE}</p>`);
    expect(data.phone).toBe(FAKE_PHONE);
  });

  it('pseudonymises display names and a plain-name contact field', () => {
    const { data } = sanitizeDoc('users', {
      displayName: 'Maria Huber',
      contact: 'Maria Huber',
      bio: 'Ich liebe Yoga',
    });
    expect(data.displayName).toBe(pseudonymizeName('Maria Huber'));
    expect(data.displayName).toMatch(/^Testperson [0-9a-f]{4}$/);
    expect(data.contact).toBe(data.displayName);
    expect(data.bio).toBe('Ich liebe Yoga');
  });

  it('removes token / ip / mollie / payment fields at any depth and reports them', () => {
    const { data, removed } = sanitizeDoc('users', {
      displayName: 'x',
      fcmToken: 'abc',
      nested: { ipAddress: '1.2.3.4', molliePaymentId: 'tr_1', keep: 1 },
    });
    expect(data).toEqual({ displayName: pseudonymizeName('x'), nested: { keep: 1 } });
    expect(removed.sort()).toEqual(['fcmToken', 'nested.ipAddress', 'nested.molliePaymentId']);
  });

  it('keeps old-format and missing fields, and does not touch dates or numbers', () => {
    const { data } = sanitizeDoc('events', {
      date: '2026-09-17',
      time: '03:21',
      fee: null,
      customDates: ['2026-09-18', '01.02.2026 - 03.02.2026'],
      imageUrl:
        'https://firebasestorage.googleapis.com/v0/b/x/o/a.jpg?alt=media&token=1234567890123',
      organizer: 'Altformat String',
    });
    expect(data.date).toBe('2026-09-17');
    expect(data.fee).toBeNull();
    expect(data.customDates).toEqual(['2026-09-18', '01.02.2026 - 03.02.2026']);
    expect(data).not.toHaveProperty('regionId');
    expect(data.organizer).toBe('Altformat String');
    expect(data.imageUrl).toContain('firebasestorage');
  });

  it('leaves Timestamps untouched (same instance)', () => {
    const ts = new FakeTimestamp(1789672550);
    const { data } = sanitizeDoc('events', { createdAt: ts, nested: { at: ts } });
    expect(data.createdAt).toBe(ts);
    expect(data.nested.at).toBe(ts);
  });

  it('drops google profile photos but keeps other photo urls', () => {
    const g = sanitizeDoc('users', { photoURL: 'https://lh3.googleusercontent.com/a/xyz' });
    const s = sanitizeDoc('users', {
      photoURL: 'https://firebasestorage.googleapis.com/v0/b/x/o/p.jpg',
    });
    expect(g.data.photoURL).toBeNull();
    expect(s.data.photoURL).toContain('firebasestorage');
  });

  it('scrubs phones but not dates / times / epoch numbers', () => {
    expect(scrubString('Tel 0664/1234567 hier')).toBe(`Tel ${FAKE_PHONE} hier`);
    expect(scrubString('Am 17.09.2026 um 09:00, id 1789672550')).toBe(
      'Am 17.09.2026 um 09:00, id 1789672550'
    );
  });
});

describe('allowlist (buildMirror)', () => {
  const store = {
    'events/e1': { title: 'A', organizer: { email: 'o@x.at' } },
    'events/e1/messages/m1': { text: 'geheim', authorName: 'Anna' },
    'users/u1': { displayName: 'Anna' },
    'users/u1/publicProfile/data': { displayName: 'Anna' },
    'users/u1/favorites/e1': { createdAt: new FakeTimestamp(1) },
    'users/u2/publicProfile/data': { displayName: 'Ohne Elterndoc' },
    'admin_users/u1': { role: 'Admin' },
    'instagram_private/token': { accessToken: 'SECRET' },
    'feedback/f1': { text: 'x' },
    'mystery/m1': { email: 'leak@x.at' },
    'app_settings/theme': { '--bg-primary': '#fff' },
    'app_settings/instagram': { enabled: true },
    'app_settings/last_build': { buildAt: 1 },
  };

  it('copies allowlisted docs with identical ids and subcollection structure', async () => {
    const { fetcher } = makeFetcher(store);
    const res = await buildMirror(fetcher);
    expect(res.docs.map((d: { path: string }) => d.path)).toEqual([
      'app_settings/theme',
      'events/e1',
      'users/u1',
      'users/u1/favorites/e1',
      'users/u1/publicProfile/data',
      'users/u2/publicProfile/data',
    ]);
    const ts = res.docs.find((d: { path: string }) => d.path === 'users/u1/favorites/e1').data
      .createdAt;
    expect(ts).toBe(store['users/u1/favorites/e1'].createdAt);
  });

  it('drops secret / personal collections without reading them and lists unknown ones', async () => {
    const { fetcher, reads } = makeFetcher(store);
    const res = await buildMirror(fetcher);
    expect(reads).not.toContain('admin_users');
    expect(reads).not.toContain('instagram_private');
    expect(reads).not.toContain('feedback');
    expect(reads).not.toContain('events/e1/messages');
    expect(reads).not.toContain('mystery');
    expect(res.dropped.admin_users.count).toBe(1);
    expect(res.dropped['events/{}/messages'].count).toBe(1);
    expect(res.dropped['app_settings/instagram'].count).toBe(1);
    expect(res.dropped['app_settings/last_build'].count).toBe(1);
    expect(res.unknown).toEqual({ mystery: 1 });
    expect(JSON.stringify(res.docs)).not.toContain('leak@x.at');
    expect(scanLeaks(res.docs)).toEqual([]);
  });

  it('every dropped policy has a reason and no secret collection is copyable', () => {
    for (const name of [
      'admin_users',
      'admin_audit_log',
      'calendarFeedTokens',
      'instagram_private',
      'feedback',
      'member_lists',
      'donors',
      'events/{}/messages',
    ]) {
      expect(MIRROR_POLICY[name as keyof typeof MIRROR_POLICY].action).toBe('drop');
    }
    const { collections, documents } = wipeTargets();
    expect(collections).not.toContain('admin_users');
    expect(documents).toEqual(['app_settings/theme', 'app_settings/activeTheme']);
  });
});

describe('leak scan', () => {
  it('catches a planted email in a nested field with an unknown name', () => {
    const hits = scanLeaks([
      { path: 'events/e1', data: { weird: { deeper: [{ blob: 'ping me: leak@real.at' }] } } },
    ]);
    expect(hits).toEqual([{ path: 'events/e1', field: 'weird.deeper[0].blob' }]);
    expect(JSON.stringify(hits)).not.toContain('leak@real.at');
  });

  it('catches phone numbers and emails in field names, accepts fakes', () => {
    expect(scanLeaks([{ path: 'a/b', data: { x: '0664 1234567' } }])).toHaveLength(1);
    expect(scanLeaks([{ path: 'a/b', data: { 'a@b.at': 1 } }])).toHaveLength(1);
    expect(
      scanLeaks([{ path: 'a/b', data: { x: `${fakeEmail('a@b.at')} ${FAKE_PHONE}` } }])
    ).toEqual([]);
  });

  it('a broken scrubber is still caught by the scan (independent safety net)', async () => {
    const { fetcher } = makeFetcher({ 'events/e1': { unknownField: { n: 'x@real.at' } } });
    const res = await buildMirror(fetcher, { scrub: (s: string) => s });
    expect(scanLeaks(res.docs)).toEqual([{ path: 'events/e1', field: 'unknownField.n' }]);
  });

  it('the normal pipeline already scrubs the same planted email', async () => {
    const { fetcher } = makeFetcher({ 'events/e1': { unknownField: { n: 'x@real.at' } } });
    const res = await buildMirror(fetcher);
    expect(scanLeaks(res.docs)).toEqual([]);
  });
});

describe('target guard', () => {
  it('refuses production and anything but staging', () => {
    expect(() => assertStagingTarget('spirieventsvbg')).toThrow(/PRODUKTION/);
    expect(() => assertStagingTarget('demo-x')).toThrow();
    expect(() => assertStagingTarget(undefined)).toThrow();
    expect(() => assertStagingTarget('tribe-vbg-staging')).not.toThrow();
  });

  it('option resolution hard-codes the target and rejects --project / ambient prod', () => {
    const o = resolveMirrorOptions([]);
    expect(o).toMatchObject({
      apply: false,
      targetProjectId: 'tribe-vbg-staging',
      sourceProjectId: 'spirieventsvbg',
    });
    expect(() => resolveMirrorOptions(['--project', 'spirieventsvbg'])).toThrow();
    expect(() => resolveMirrorOptions(['--bogus'])).toThrow(/Unbekannte/);
    expect(() => resolveMirrorOptions([], { env: { GCLOUD_PROJECT: 'spirieventsvbg' } })).toThrow();
    expect(() => resolveMirrorOptions([], { env: { FIRESTORE_EMULATOR_HOST: 'x:1' } })).toThrow();
    const e = resolveMirrorOptions(['--emulator', '--apply']);
    expect(e).toMatchObject({ emulator: true, apply: true, emulatorHost: '127.0.0.1:8181' });
    expect(resolveMirrorOptions(['--emulator', 'h:9']).emulatorHost).toBe('h:9');
  });

  it('applyMirror refuses a writer on production before any delete or write', async () => {
    const calls: string[] = [];
    const writer = (projectId: string) => ({
      projectId: () => projectId,
      deleteCollection: async (n: string) => void calls.push(`del ${n}`),
      deleteDocument: async (p: string) => void calls.push(`deldoc ${p}`),
      commit: async (ops: unknown[]) => void calls.push(`commit ${ops.length}`),
    });
    await expect(
      applyMirror(writer('spirieventsvbg'), [{ path: 'a/b', data: {} }])
    ).rejects.toThrow(/PRODUKTION/);
    expect(calls).toEqual([]);
  });

  it('applyMirror wipes mirrored collections only, then writes in batches <= 400', async () => {
    const calls: string[] = [];
    const writer = {
      projectId: () => 'tribe-vbg-staging',
      deleteCollection: async (n: string) => void calls.push(`del ${n}`),
      deleteDocument: async (p: string) => void calls.push(`deldoc ${p}`),
      commit: async (ops: unknown[]) => void calls.push(`commit ${ops.length}`),
    };
    const docs = Array.from({ length: 850 }, (_, i) => ({ path: `events/e${i}`, data: {} }));
    expect(await applyMirror(writer, docs)).toBe(850);
    expect(calls.filter((c) => c.startsWith('commit'))).toEqual([
      'commit 400',
      'commit 400',
      'commit 50',
    ]);
    const firstCommit = calls.findIndex((c) => c.startsWith('commit'));
    expect(calls.slice(0, firstCommit).every((c) => c.startsWith('del'))).toBe(true);
    expect(calls).not.toContain('del admin_users');
    expect(calls).toContain('deldoc app_settings/theme');
  });

  it('a writer whose app id flips to production mid-run is stopped before the next commit', async () => {
    let id = 'tribe-vbg-staging';
    const commits: number[] = [];
    const writer = {
      projectId: () => id,
      deleteCollection: async () => {},
      deleteDocument: async () => {},
      commit: async (ops: unknown[]) => {
        commits.push(ops.length);
        id = 'spirieventsvbg';
      },
    };
    const docs = Array.from({ length: 500 }, (_, i) => ({ path: `events/e${i}`, data: {} }));
    await expect(applyMirror(writer, docs)).rejects.toThrow(/PRODUKTION/);
    expect(commits).toEqual([400]);
  });
});
