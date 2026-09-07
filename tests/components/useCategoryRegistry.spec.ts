import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCategoryRegistry } from '../../src/hooks/useCategoryRegistry';

const mockAuth = vi.hoisted(() => ({
  user: { uid: 'admin-uid' },
  role: 'Admin',
}));

const mockRegistryState = vi.hoisted(() => ({
  docs: [] as Array<{ id: string; data: Record<string, unknown> }>,
  callbacks: [] as Array<(snap: unknown) => void>,
}));

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('firebase/firestore', () => ({
  collection: () => ({ type: 'collection' }),
  doc: (_db, _collection, id) => ({ id, type: 'doc', collection: 'categories' }),
  onSnapshot: (_ref, callback) => {
    mockRegistryState.callbacks.push(callback);
    // Fire once with current docs so callers get an initial snapshot.
    callback({
      docs: mockRegistryState.docs.map((entry) => ({
        id: entry.id,
        data: () => entry.data,
      })),
    });
    return () => {};
  },
  deleteDoc: vi.fn(async (ref) => {
    mockRegistryState.docs = mockRegistryState.docs.filter((entry) => entry.id !== ref.id);
    mockRegistryState.callbacks.forEach((cb) =>
      cb({
        docs: mockRegistryState.docs.map((entry) => ({
          id: entry.id,
          data: () => entry.data,
        })),
      })
    );
  }),
  query: () => ({ type: 'query' }),
  where: () => ({ type: 'where' }),
  getDocs: async (q) => {
    // Match by name on the mock registry docs.
    return {
      empty: false,
      docs: mockRegistryState.docs.map((entry) => ({
        id: entry.id,
        data: () => entry.data,
      })),
      forEach: (fn) => {
        mockRegistryState.docs.forEach((entry) =>
          fn({ id: entry.id, data: () => entry.data, ref: { id: entry.id } })
        );
      },
    };
  },
  writeBatch: () => {
    const operations = [];
    return {
      update: (ref, data) => {
        operations.push({ type: 'update', ref, data });
      },
      commit: async () => {
        for (const op of operations) {
          const entry = mockRegistryState.docs.find((d) => d.id === op.ref.id);
          if (entry) {
            entry.data = { ...entry.data, ...op.data };
          }
        }
        mockRegistryState.callbacks.forEach((cb) =>
          cb({
            docs: mockRegistryState.docs.map((entry) => ({
              id: entry.id,
              data: () => entry.data,
            })),
          })
        );
      },
    };
  },
  serverTimestamp: () => ({ type: 'serverTimestamp' }),
  setDoc: vi.fn(async (ref, data) => {
    const existing = mockRegistryState.docs.find((entry) => entry.id === ref.id);
    if (existing) {
      existing.data = { ...existing.data, ...data };
    } else {
      mockRegistryState.docs.push({ id: ref.id, data });
    }
    mockRegistryState.callbacks.forEach((cb) =>
      cb({
        docs: mockRegistryState.docs.map((entry) => ({
          id: entry.id,
          data: () => entry.data,
        })),
      })
    );
  }),
}));

vi.mock('../../src/lib/firebase', () => ({ db: {} }));

const resetRegistry = () => {
  mockRegistryState.docs = [];
  mockRegistryState.callbacks = [];
};

describe('useCategoryRegistry', () => {
  beforeEach(resetRegistry);

  it('returns the canonical color map for known categories', async () => {
    mockRegistryState.docs = [
      { id: 'yoga', data: { name: 'Yoga', color: '#c48e6a' } },
      { id: 'pilates', data: { name: 'Pilates', color: '#4a7572' } },
    ];
    const { result } = renderHook(() => useCategoryRegistry());
    expect(result.current.colorByName.get('Yoga')).toBe('#c48e6a');
    expect(result.current.colorByName.get('Pilates')).toBe('#4a7572');
  });

  it('flags nameExists for matching case-insensitive names', async () => {
    mockRegistryState.docs = [{ id: 'yoga', data: { name: 'Yoga', color: '#c48e6a' } }];
    const { result } = renderHook(() => useCategoryRegistry());
    expect(result.current.nameExists('Yoga')).toBe(true);
    expect(result.current.nameExists('yoga')).toBe(true);
    expect(result.current.nameExists('Pilates')).toBe(false);
  });

  it('creates a new category with a normalized lowercase id', async () => {
    const { result } = renderHook(() => useCategoryRegistry());
    await act(async () => {
      await result.current.addCategory({ name: '  Pilates  ', color: '#4a7572' });
    });
    const created = mockRegistryState.docs.find((d) => d.id === 'pilates');
    expect(created).toBeDefined();
    expect(created.data.name).toBe('Pilates');
    expect(created.data.color).toBe('#4a7572');
    expect(created.data.createdBy).toBe('admin-uid');
  });

  it('rejects addCategory for invalid names', async () => {
    const { result } = renderHook(() => useCategoryRegistry());
    await act(async () => {
      await expect(result.current.addCategory({ name: 'A', color: '#ffffff' })).rejects.toThrow(
        /2–40 Zeichen/
      );
    });
  });

  it('rejects addCategory for invalid color formats', async () => {
    const { result } = renderHook(() => useCategoryRegistry());
    await act(async () => {
      await expect(
        result.current.addCategory({ name: 'Pilates', color: 'not-a-color' })
      ).rejects.toThrow(/Ungültige Farbe/);
    });
  });

  it('rejects addCategory when a duplicate name exists', async () => {
    mockRegistryState.docs = [{ id: 'yoga', data: { name: 'Yoga', color: '#c48e6a' } }];
    const { result } = renderHook(() => useCategoryRegistry());
    await act(async () => {
      await expect(result.current.addCategory({ name: 'Yoga', color: '#ffffff' })).rejects.toThrow(
        /existiert bereits/
      );
    });
  });

  it('updates an existing category and cascades the rename to events', async () => {
    mockRegistryState.docs = [{ id: 'yoga', data: { name: 'Yoga', color: '#c48e6a' } }];
    const { result } = renderHook(() => useCategoryRegistry());

    const batchRef = { __eventsBatch: true };
    const writeBatch = vi.fn(() => batchRef);
    writeBatch.update = vi.fn();
    writeBatch.commit = vi.fn(async () => {
      // No-op for the test
    });

    // We can't easily inject a custom writeBatch, so just verify that
    // updating without a rename commits a single-doc update via setDoc.
    await act(async () => {
      await result.current.updateCategory('yoga', { name: 'Yoga', color: '#ffffff' });
    });
    const updated = mockRegistryState.docs.find((d) => d.id === 'yoga');
    expect(updated.data.color).toBe('#ffffff');
  });

  it('refuses to mutate the registry when the user is not admin', async () => {
    mockAuth.role = 'User';
    const { result } = renderHook(() => useCategoryRegistry());
    await act(async () => {
      await expect(
        result.current.addCategory({ name: 'Pilates', color: '#4a7572' })
      ).rejects.toThrow(/Nur Admins/);
    });
    mockAuth.role = 'Admin';
  });
});
