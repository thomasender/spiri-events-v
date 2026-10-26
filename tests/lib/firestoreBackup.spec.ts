// @ts-nocheck - plain JS module under test
import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import {
  PAGE_SIZE,
  assertSafeOutDir,
  backupDirName,
  encodeValue,
  fileNameOf,
  latestProductionExportedAt,
  resolveExportOptions,
  runBackup,
  schemaPathOf,
  verifyBackup,
  writeBackup,
} from '../../src/utils/firestoreBackup.js';

const sha256 = (t: string) => createHash('sha256').update(t).digest('hex');

/** In-memory Firestore keyed by doc path ('users/u1/publicProfile/data'). */
function memFetcher(
  docs: Record<string, object>,
  opts: { pageSize?: number; countOffset?: number; failOn?: string } = {}
) {
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const inColl = (coll: string) =>
    Object.keys(docs)
      .filter((p) => p.startsWith(coll + '/') && p.split('/').length === coll.split('/').length + 1)
      .sort();
  const pagesRequested: Record<string, number> = {};
  return {
    pagesRequested,
    async listRootCollections() {
      return [...new Set(Object.keys(docs).map((p) => p.split('/')[0]))];
    },
    async listPage(coll: string, token: string | null) {
      if (opts.failOn === coll) throw new Error('boom');
      pagesRequested[coll] = (pagesRequested[coll] ?? 0) + 1;
      const all = inColl(coll);
      const start = token ? all.indexOf(token) + 1 : 0;
      const slice = all.slice(start, start + pageSize);
      return {
        docs: slice.map((path) => ({ path, data: docs[path] })),
        nextPageToken: slice.length === pageSize ? slice.at(-1) : null,
      };
    },
    async listDocumentPaths(coll: string) {
      const depth = coll.split('/').length + 1;
      return [
        ...new Set(
          Object.keys(docs)
            .filter((p) => p.startsWith(coll + '/'))
            .map((p) => p.split('/').slice(0, depth).join('/'))
        ),
      ];
    },
    async listSubcollections(docPath: string) {
      const prefix = docPath + '/';
      return [
        ...new Set(
          Object.keys(docs)
            .filter((p) => p.startsWith(prefix))
            .map((p) => p.slice(prefix.length).split('/')[0])
        ),
      ];
    },
    async countDocs(coll: string) {
      return inColl(coll).length + (opts.countOffset ?? 0);
    },
  };
}

describe('paging', () => {
  it('reads past 1000 documents per collection', async () => {
    const docs: Record<string, object> = {};
    for (let i = 0; i < 2500; i++) docs[`events/e${String(i).padStart(5, '0')}`] = { n: i };
    const f = memFetcher(docs);
    const { summary, groups } = await runBackup(f);
    expect(summary.events).toBe(2500);
    expect(groups.get('events')).toHaveLength(2500);
    expect(f.pagesRequested.events).toBe(3);
  });

  it('exact multiple of the page size ends cleanly', async () => {
    const docs: Record<string, object> = {};
    for (let i = 0; i < 2000; i++) docs[`events/e${String(i).padStart(5, '0')}`] = {};
    expect((await runBackup(memFetcher(docs))).summary.events).toBe(2000);
  });
});

describe('failure is loud', () => {
  it('throws when the count does not match what was fetched', async () => {
    await expect(runBackup(memFetcher({ 'events/a': {} }, { countOffset: 1 }))).rejects.toThrow(
      /Zaehlung/
    );
  });
  it('throws on a fetch error', async () => {
    await expect(runBackup(memFetcher({ 'events/a': {} }, { failOn: 'events' }))).rejects.toThrow(
      'boom'
    );
  });
  it('throws when a required collection is missing', async () => {
    await expect(
      runBackup(memFetcher({ 'events/a': {} }), { requiredCollections: ['users'] })
    ).rejects.toThrow(/fehlt/);
  });
});

describe('traversal', () => {
  const docs = {
    'events/e1': { title: 'x' },
    'events/e1/messages/m1': { text: 'hi' },
    'users/u1': { name: 'a' },
    'users/u1/publicProfile/data': { bio: 'b' },
    'users/u1/favorites/e1': {},
    'users/u2/publicProfile/data': { bio: 'c' },
    'admin_users/u1': {},
    'regions/vorarlberg': {},
  };
  it('walks subcollections under every document and groups them', async () => {
    const { summary } = await runBackup(memFetcher(docs));
    expect(summary).toMatchObject({
      events: 1,
      'events/{}/messages': 1,
      users: 1,
      'users/{}/publicProfile': 2,
      'users/{}/favorites': 1,
      admin_users: 1,
      regions: 1,
    });
  });
  it('finds subcollections of documents that have no fields themselves', async () => {
    const { summary } = await runBackup(memFetcher({ 'users/ghost/publicProfile/data': { b: 1 } }));
    expect(summary['users/{}/publicProfile']).toBe(1);
  });
  it('names groups and files', () => {
    expect(schemaPathOf('users/u1/publicProfile')).toBe('users/{}/publicProfile');
    expect(fileNameOf('users/{}/publicProfile')).toBe('users.publicProfile.json');
    expect(fileNameOf('events')).toBe('events.json');
  });
});

describe('encoding', () => {
  it('writes typed values', () => {
    expect(encodeValue('a')).toEqual({ stringValue: 'a' });
    expect(encodeValue(3)).toEqual({ integerValue: '3' });
    expect(encodeValue(1.5)).toEqual({ doubleValue: 1.5 });
    expect(encodeValue(null)).toEqual({ nullValue: null });
    expect(encodeValue(['x'])).toEqual({ arrayValue: { values: [{ stringValue: 'x' }] } });
    expect(encodeValue({ a: true })).toEqual({
      mapValue: { fields: { a: { booleanValue: true } } },
    });
    const ts = { toDate: () => new Date('2026-01-02T03:04:05.678Z'), nanoseconds: 678000000 };
    expect(encodeValue(ts)).toEqual({ timestampValue: '2026-01-02T03:04:05.678000000Z' });
  });
});

function memIo() {
  const files = new Map<string, string>();
  return {
    files,
    mkdir: () => {},
    writeFile: (p: string, body: string) => void files.set(p, body),
    rm: (p: string) => {
      for (const k of [...files.keys()]) if (k.startsWith(p + '/')) files.delete(k);
    },
    rename: (a: string, b: string) => {
      for (const [k, v] of [...files]) {
        if (!k.startsWith(a + '/')) continue;
        files.delete(k);
        files.set(b + k.slice(a.length), v);
      }
    },
    sha256,
  };
}

describe('manifest', () => {
  const NOW = new Date('2026-10-13T10:00:00Z');
  const docs = { 'events/a': { t: 'x' }, 'users/u/publicProfile/data': { b: 1 } };
  const dir = 'backups/firestore-2026-10-13';
  const meta = { target: 'production', projectId: 'spirieventsvbg', now: NOW };

  it('is written with exportedAt only after a full run, and verifies', async () => {
    const io = memIo();
    const manifest = await writeBackup(io, dir, {
      ...(await runBackup(memFetcher(docs))),
      ...meta,
    });
    expect(manifest.exportedAt).toBe(NOW.toISOString());
    expect([...io.files.keys()].sort()).toEqual([
      `${dir}/events.json`,
      `${dir}/manifest.json`,
      `${dir}/users.json`,
      `${dir}/users.publicProfile.json`,
    ]);
    const read = (n: string) => io.files.get(`${dir}/${n}`)!;
    expect(verifyBackup(read, sha256).ok).toBe(true);
    io.files.set(`${dir}/events.json`, '[]\n');
    expect(verifyBackup(read, sha256).ok).toBe(false);
  });

  it('a failed run never reaches writeBackup, so no manifest exists', async () => {
    const io = memIo();
    await expect(runBackup(memFetcher(docs, { countOffset: -1 }))).rejects.toThrow();
    expect(io.files.size).toBe(0);
  });

  it('is idempotent: a second run replaces the dir with identical content', async () => {
    const io = memIo();
    const run = async () =>
      writeBackup(io, dir, { ...(await runBackup(memFetcher(docs))), ...meta });
    await run();
    const first = new Map(io.files);
    await run();
    expect(io.files).toEqual(first);
    expect([...io.files.keys()].some((k) => k.includes('.partial'))).toBe(false);
  });

  it('migration only accepts complete production manifests', () => {
    const ok = { format: 'firestore-backup-v1', target: 'production', projectId: 'spirieventsvbg' };
    expect(latestProductionExportedAt([])).toBeNull();
    expect(
      latestProductionExportedAt([{ ...ok, target: 'emulator', exportedAt: NOW.toISOString() }])
    ).toBeNull();
    expect(latestProductionExportedAt([ok])).toBeNull();
    expect(latestProductionExportedAt([{ format: 'x' }, null])).toBeNull();
    expect(
      latestProductionExportedAt([
        { ...ok, exportedAt: '2026-10-12T10:00:00.000Z' },
        { ...ok, exportedAt: NOW.toISOString() },
      ])
    ).toBe(NOW.toISOString());
  });
});

describe('never overwrites the prerender snapshot', () => {
  it('default dir is under backups/', () => {
    const d = new Date('2026-10-13T10:00:00Z');
    expect(backupDirName('production', d)).toBe('firestore-2026-10-13');
    expect(backupDirName('emulator', d)).toBe('firestore-emulator-2026-10-13');
    expect(() => assertSafeOutDir('backups/firestore-2026-10-13')).not.toThrow();
  });
  it('rejects data-export, repo root, backups root and escapes', () => {
    const bad = [
      'data-export',
      'data-export/firestore-export',
      '',
      '.',
      '..',
      '../x',
      'backups',
      'backups/../data-export/firestore-export',
      '/tmp/x',
      'src',
    ];
    for (const b of bad) expect(() => assertSafeOutDir(b), b).toThrow();
  });
  it('writeBackup only emits files inside its out dir', async () => {
    const io = memIo();
    await writeBackup(io, 'backups/firestore-x', {
      ...(await runBackup(memFetcher({ 'events/a': {} }))),
      target: 'emulator',
      projectId: 'p',
      now: new Date(),
    });
    expect([...io.files.keys()].every((k) => k.startsWith('backups/firestore-x/'))).toBe(true);
  });
});

describe('options', () => {
  it('defaults to the emulator', () => {
    expect(resolveExportOptions([], { env: {} })).toMatchObject({
      target: 'emulator',
      emulatorHost: '127.0.0.1:8181',
    });
  });
  it('production needs the explicit flag and no emulator host', () => {
    expect(resolveExportOptions(['--project', 'spirieventsvbg'], { env: {} }).target).toBe(
      'production'
    );
    expect(() =>
      resolveExportOptions(['--project', 'spirieventsvbg'], {
        env: { FIRESTORE_EMULATOR_HOST: 'x:1' },
      })
    ).toThrow();
    expect(() => resolveExportOptions(['--project', 'other'], { env: {} })).toThrow();
    expect(() => resolveExportOptions(['--bogus'], { env: {} })).toThrow();
  });
  it('--verify is read-only', () => {
    expect(resolveExportOptions(['--verify', 'backups/x'], { env: {} })).toMatchObject({
      target: 'verify',
    });
    expect(() =>
      resolveExportOptions(['--verify', 'backups/x', '--project', 'spirieventsvbg'], { env: {} })
    ).toThrow();
  });
});
