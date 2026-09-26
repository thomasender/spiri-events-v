import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCollectionGroup, mockQuery, mockWhere, mockOrderBy, mockLimit, mockGetDocs } =
  vi.hoisted(() => ({
    mockCollectionGroup: vi.fn(),
    mockQuery: vi.fn(),
    mockWhere: vi.fn(),
    mockOrderBy: vi.fn(),
    mockLimit: vi.fn(),
    mockGetDocs: vi.fn(),
  }));

vi.mock('firebase/firestore', () => ({
  collectionGroup: (...args) => mockCollectionGroup(...args),
  query: (...args) => mockQuery(...args),
  where: (...args) => mockWhere(...args),
  orderBy: (...args) => mockOrderBy(...args),
  limit: (...args) => mockLimit(...args),
  getDocs: (...args) => mockGetDocs(...args),
}));

vi.mock('../../src/lib/firebase', () => ({ db: {} }));

import { searchUsersByUsernamePrefix } from '../../src/lib/userSearch';

function makeOwnerDoc(uid, data) {
  return {
    ref: { parent: { parent: { id: uid } } },
    data: () => data,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCollectionGroup.mockImplementation((db, name) => ({ name }));
  mockWhere.mockImplementation((...args) => ({ _args: args }));
  mockOrderBy.mockImplementation((...args) => ({ _args: args }));
  mockLimit.mockImplementation((n) => ({ n }));
  mockQuery.mockImplementation((...args) => ({ _args: args }));
});

describe('searchUsersByUsernamePrefix', () => {
  it('returns an empty array without hitting Firestore for short queries', async () => {
    await expect(searchUsersByUsernamePrefix('a')).resolves.toEqual([]);
    await expect(searchUsersByUsernamePrefix('')).resolves.toEqual([]);
    await expect(searchUsersByUsernamePrefix('   ')).resolves.toEqual([]);
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  it('normalises the prefix to lowercase before querying', async () => {
    mockGetDocs.mockResolvedValueOnce({ docs: [] });

    await searchUsersByUsernamePrefix('  Anna.Schmidt  ');

    expect(mockWhere).toHaveBeenCalledWith('username', '>=', 'anna.schmidt');
    expect(mockWhere).toHaveBeenCalledWith('username', '<=', 'anna.schmidt\uf8ff');
  });

  it('scopes the query to the publicProfile collection group and applies the limit', async () => {
    mockGetDocs.mockResolvedValueOnce({ docs: [] });

    await searchUsersByUsernamePrefix('anna', { limit: 5 });

    expect(mockCollectionGroup).toHaveBeenCalledWith({}, 'publicProfile');
    expect(mockLimit).toHaveBeenCalledWith(5);
    expect(mockOrderBy).toHaveBeenCalledWith('username');
  });

  it('clamps the limit between 1 and 20', async () => {
    mockGetDocs.mockResolvedValue({ docs: [] });
    await searchUsersByUsernamePrefix('anna', { limit: 999 });
    expect(mockLimit).toHaveBeenCalledWith(20);

    mockLimit.mockClear();
    mockGetDocs.mockResolvedValue({ docs: [] });
    await searchUsersByUsernamePrefix('anna', { limit: 0 });
    expect(mockLimit).toHaveBeenCalledWith(1);
  });

  it('maps the snapshot to a flat user shape carrying uid + profile fields', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        makeOwnerDoc('user-1', {
          username: 'anna.schmidt',
          displayName: 'Anna Schmidt',
          photoURL: 'https://example.com/anna.jpg',
          slug: 'anna-schmidt',
        }),
      ],
    });

    const results = await searchUsersByUsernamePrefix('anna');
    expect(results).toEqual([
      {
        uid: 'user-1',
        username: 'anna.schmidt',
        displayName: 'Anna Schmidt',
        photoURL: 'https://example.com/anna.jpg',
        slug: 'anna-schmidt',
      },
    ]);
  });

  it('falls back to empty photoURL / displayName when those fields are missing', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [makeOwnerDoc('user-2', { username: 'jane.doe' })],
    });

    const [result] = await searchUsersByUsernamePrefix('jane');
    expect(result.uid).toBe('user-2');
    expect(result.username).toBe('jane.doe');
    expect(result.displayName).toBe('');
    expect(result.photoURL).toBe(null);
  });

  it('returns an empty uid when the parent path is not available', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [{ ref: {}, data: () => ({ username: 'lone.user' }) }],
    });

    const [result] = await searchUsersByUsernamePrefix('lone');
    expect(result.uid).toBe(null);
  });

  it('propagates firestore errors after logging them', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockGetDocs.mockRejectedValueOnce({ code: 'permission-denied', message: 'nope' });

    await expect(searchUsersByUsernamePrefix('anna')).rejects.toEqual({
      code: 'permission-denied',
      message: 'nope',
    });
    expect(consoleWarn).toHaveBeenCalled();
  });
});
