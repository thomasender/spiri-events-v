import { describe, it, expect, vi, beforeEach } from 'vitest';

const fs = vi.hoisted(() => ({
  setDoc: vi.fn(async (..._a: unknown[]) => {}),
  deleteDoc: vi.fn(async (..._a: unknown[]) => {}),
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ col, id })),
  getDoc: vi.fn(async (_r: unknown) => ({ exists: () => true })),
}));
vi.mock('firebase/firestore', () => ({
  ...fs,
  collection: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  serverTimestamp: () => 'SERVER_TS',
}));
const call = vi.hoisted(() => vi.fn(async (_d: unknown) => ({ data: { ok: true } })));
const callable = vi.hoisted(() => vi.fn((_n: string) => call));
vi.mock('../../src/lib/firebase', () => ({ db: {}, callable }));

import {
  addToBlocklist,
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
  it('sends force only when set and unwraps data', async () => {
    await importAcceptCandidate({ candidateId: 'c1' });
    expect(callable).toHaveBeenLastCalledWith('importAcceptCandidate');
    expect(call).toHaveBeenLastCalledWith({ candidateId: 'c1' });
    expect(await importAcceptCandidate({ candidateId: 'c1', force: true })).toEqual({ ok: true });
    expect(call).toHaveBeenLastCalledWith({ candidateId: 'c1', force: true });
  });

  it('passes testRecipient to sendOutreachMail', async () => {
    await sendOutreachMail({ organizerId: 'o1', testRecipient: 'a@b.at' });
    expect(call).toHaveBeenLastCalledWith({ organizerId: 'o1', testRecipient: 'a@b.at' });
  });
});
