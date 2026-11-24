import { describe, it, expect, vi, beforeEach } from 'vitest';

const fs = vi.hoisted(() => ({
  setDoc: vi.fn(async (..._a: unknown[]) => {}),
  deleteDoc: vi.fn(async (..._a: unknown[]) => {}),
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ col, id })),
  getDoc: vi.fn(async (_r: unknown) => ({ exists: () => true })),
  getDocs: vi.fn(),
  collection: vi.fn((_db: unknown, name: string) => name),
  query: vi.fn((col: unknown) => col),
}));
vi.mock('firebase/firestore', () => ({
  ...fs,
  limit: vi.fn(),
  where: vi.fn(),
  serverTimestamp: () => 'SERVER_TS',
}));
const call = vi.hoisted(() => vi.fn(async (_d: unknown) => ({ data: { ok: true } })));
const callable = vi.hoisted(() => vi.fn((_n: string) => call));
vi.mock('../../src/lib/firebase', () => ({ db: {}, callable }));

import {
  addToBlocklist,
  fetchImportProgress,
  isOnBlocklist,
  removeFromBlocklist,
  importAcceptCandidate,
  sendOutreachMail,
} from '../../src/utils/importAdminApi';
import * as server from '../../functions/src/eventImport';

beforeEach(() => vi.clearAllMocks());

describe('importAdminApi blocklist', () => {
  it('stores only the hash as doc id with the allowed fields', async () => {
    await addToBlocklist('Info@Yoga.test', 'uid1');
    expect(fs.setDoc).toHaveBeenCalledWith(
      { col: 'import_blocklist', id: server.blocklistId('info@yoga.test') },
      { kind: 'email', reason: 'manuell gesperrt', createdAt: 'SERVER_TS', createdBy: 'uid1' }
    );
    const data = fs.setDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(JSON.stringify(data)).not.toContain('yoga.test');
  });

  it('reads and removes by the same hash', async () => {
    expect(await isOnBlocklist('https://www.yoga.test/x')).toBe(true);
    await removeFromBlocklist('https://www.yoga.test/x');
    expect(fs.deleteDoc).toHaveBeenCalledWith({
      col: 'import_blocklist',
      id: server.blocklistId('yoga.test'),
    });
  });
});

describe('importAdminApi callables', () => {
  it('sends only the candidate id and unwraps data', async () => {
    expect(await importAcceptCandidate({ candidateId: 'c1' })).toEqual({ ok: true });
    expect(callable).toHaveBeenLastCalledWith('importAcceptCandidate');
    expect(call).toHaveBeenLastCalledWith({ candidateId: 'c1' });
  });

  it('passes testRecipient to sendOutreachMail', async () => {
    await sendOutreachMail({ organizerId: 'o1', testRecipient: 'a@b.at' });
    expect(call).toHaveBeenLastCalledWith({ organizerId: 'o1', testRecipient: 'a@b.at' });
  });
});

describe('fetchImportProgress', () => {
  it('counts consent only for manual_ok/sync_ok organizers or events with curation.consentAt (claimed is not consent)', async () => {
    const snap = (docs: Array<{ id: string; data: Record<string, unknown> }>) => ({
      docs: docs.map((d) => ({ id: d.id, data: () => d.data })),
    });
    fs.getDocs.mockImplementation(async (col: unknown) =>
      col === 'import_candidates'
        ? snap([
            { id: 'c1', data: { eventId: 'e1', organizerRef: 'o-ok' } },
            { id: 'c2', data: { eventId: 'e2', organizerRef: 'o-claimed' } },
            { id: 'c3', data: { eventId: 'e3', organizerRef: 'o-claimed-consented' } },
            { id: 'c4', data: { eventId: 'e4', organizerRef: 'o-sync' } },
          ])
        : snap([
            { id: 'o-ok', data: { consent: 'manual_ok' } },
            { id: 'o-claimed', data: { consent: 'claimed' } },
            { id: 'o-claimed-consented', data: { consent: 'claimed' } },
            { id: 'o-sync', data: { consent: 'sync_ok' } },
          ])
    );
    fs.getDoc.mockImplementation(async (ref: unknown) => ({
      exists: () => true,
      data: () => ({
        curation: { consentAt: (ref as { id: string }).id === 'e3' ? 'TS' : null },
      }),
    }));
    expect(await fetchImportProgress('tirol')).toEqual({
      importedEvents: 4,
      consentedEvents: 3,
    });
  });
});
