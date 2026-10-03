import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getDocs, setDoc, doc } = vi.hoisted(() => ({
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  doc: vi.fn((_db, _col, id) => ({ id })),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  serverTimestamp: vi.fn(() => 'TS'),
  doc,
  getDocs,
  setDoc,
}));
vi.mock('../../src/lib/firebase', () => ({ db: {} }));

import { ensureCategoryExists } from '../../src/utils/ensureCategoryExists';

describe('ensureCategoryExists', () => {
  beforeEach(() => {
    getDocs.mockReset();
    setDoc.mockReset();
  });

  it('ignores empty / whitespace names without touching Firestore', async () => {
    expect(await ensureCategoryExists('   ')).toEqual({ created: false, id: null });
    expect(getDocs).not.toHaveBeenCalled();
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('does not write when the category already exists', async () => {
    getDocs.mockResolvedValue({ empty: false, docs: [{ id: 'yoga' }] });
    expect(await ensureCategoryExists('Yoga')).toEqual({ created: false, id: 'yoga' });
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('creates a missing category under a deterministic lower-case id', async () => {
    getDocs.mockResolvedValue({ empty: true, docs: [] });
    expect(await ensureCategoryExists('Klangreise')).toEqual({ created: true, id: 'klangreise' });
    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(setDoc.mock.calls[0][1]).toMatchObject({ name: 'Klangreise', createdBy: 'system' });
  });
});
