import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetDocs, mockQuery, mockWhere, mockCollectionGroup } = vi.hoisted(() => ({
  mockGetDocs: vi.fn(),
  mockQuery: vi.fn(),
  mockWhere: vi.fn(),
  mockCollectionGroup: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collectionGroup: (...args) => mockCollectionGroup(...args),
  query: (...args) => mockQuery(...args),
  where: (...args) => mockWhere(...args),
  getDocs: (...args) => mockGetDocs(...args),
}));

vi.mock('../../src/lib/firebase', () => ({
  db: {},
}));

import { isUsernameAvailable } from '../../src/lib/slug';

function makeOwnerDoc(uid) {
  return {
    ref: { parent: { parent: { id: uid } } },
  };
}

beforeEach(() => {
  mockGetDocs.mockReset();
  mockQuery.mockReset();
  mockWhere.mockReset();
  mockCollectionGroup.mockReset();
  mockQuery.mockImplementation((...args) => ({ _args: args }));
  mockWhere.mockImplementation((...args) => ({ _args: args }));
  mockCollectionGroup.mockImplementation((db, name) => ({ name }));
});

describe('isUsernameAvailable', () => {
  it('returns true when no other user has the username', async () => {
    mockGetDocs.mockResolvedValueOnce({ docs: [] });

    await expect(isUsernameAvailable('jane-doe', 'user-1')).resolves.toBe(true);
  });

  it('returns false when another user already uses the username', async () => {
    mockGetDocs.mockResolvedValueOnce({ docs: [makeOwnerDoc('user-2')] });

    await expect(isUsernameAvailable('jane-doe', 'user-1')).resolves.toBe(false);
  });

  it('returns true when only the current user has the username', async () => {
    mockGetDocs.mockResolvedValueOnce({ docs: [makeOwnerDoc('user-1')] });

    await expect(isUsernameAvailable('jane-doe', 'user-1')).resolves.toBe(true);
  });

  it('returns false for empty input without hitting Firestore', async () => {
    await expect(isUsernameAvailable('', 'user-1')).resolves.toBe(false);
    await expect(isUsernameAvailable('   ', 'user-1')).resolves.toBe(false);
    await expect(isUsernameAvailable(null, 'user-1')).resolves.toBe(false);
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  it('normalises the candidate before querying (lowercase + trim)', async () => {
    mockGetDocs.mockResolvedValueOnce({ docs: [] });

    await isUsernameAvailable('  Jane.Doe  ', 'user-1');

    expect(mockWhere).toHaveBeenCalledWith('username', '==', 'jane.doe');
  });
});
