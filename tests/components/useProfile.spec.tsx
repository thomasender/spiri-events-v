import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const {
  mockBatchSet,
  mockBatchCommit,
  mockCollectionGroup,
  mockFindUniqueProfileSlug,
  mockSet,
  mockOnSnapshot,
} = vi.hoisted(() => ({
  mockBatchSet: vi.fn(),
  mockBatchCommit: vi.fn(async () => {}),
  mockCollectionGroup: vi.fn(),
  mockFindUniqueProfileSlug: vi.fn(async (name) =>
    (name || 'user').toLowerCase().replace(/\s+/g, '-')
  ),
  mockSet: vi.fn(),
  mockOnSnapshot: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_, ..._path) => ({ type: 'doc', path: _path })),
  onSnapshot: (...args) => mockOnSnapshot(...args),
  setDoc: mockSet,
  writeBatch: vi.fn(() => ({
    set: mockBatchSet,
    commit: mockBatchCommit,
  })),
  serverTimestamp: vi.fn(() => ({ __serverTimestamp: true })),
  deleteField: vi.fn(() => ({ __deleteField: true })),
  collectionGroup: (...args) => mockCollectionGroup(...args),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn(async () => ({ docs: [] })),
}));

vi.mock('../../src/lib/firebase', () => ({
  db: {},
}));

vi.mock('../../src/lib/slug', async () => {
  const actual = await vi.importActual<typeof import('../../src/lib/slug')>('../../src/lib/slug');
  return {
    ...actual,
    findUniqueProfileSlug: mockFindUniqueProfileSlug,
  };
});

import { useProfile } from '../../src/hooks/useProfile';

function makeSnapshot(data) {
  return {
    exists: () => Boolean(data),
    data: () => data || {},
  };
}

beforeEach(() => {
  mockBatchSet.mockClear();
  mockBatchCommit.mockClear();
  mockCollectionGroup.mockClear();
  mockFindUniqueProfileSlug.mockClear();
  mockSet.mockClear();
  mockOnSnapshot.mockReset();
  mockOnSnapshot.mockImplementation((_ref, onNext) => {
    onNext(makeSnapshot(null));
    return () => {};
  });
});

describe('useProfile.save — notification preferences', () => {
  it('does not call findUniqueProfileSlug when saving only notification preferences', async () => {
    mockOnSnapshot.mockImplementation((_ref, onNext) => {
      onNext(
        makeSnapshot({
          displayName: 'Anna Beispiel',
          bio: '',
          website: '',
          photoURL: null,
          slug: 'anna-beispiel',
        })
      );
      return () => {};
    });

    const { result } = renderHook(() => useProfile('user-1'));

    await waitFor(() => expect(result.current.profile).not.toBeNull());

    await act(async () => {
      await result.current.save({ notifyOnPublished: false });
    });

    expect(mockFindUniqueProfileSlug).not.toHaveBeenCalled();
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    const profilePayload = mockBatchSet.mock.calls.find(([ref]) => ref.path?.[0] === 'users')?.[1];
    expect(profilePayload).toMatchObject({
      notifyOnPublished: false,
      slug: 'anna-beispiel',
    });
  });

  it('writes only to the profile doc (skip publicProfile) when the update has no public fields', async () => {
    mockOnSnapshot.mockImplementation((_ref, onNext) => {
      onNext(
        makeSnapshot({
          displayName: 'Anna Beispiel',
          bio: '',
          website: '',
          photoURL: null,
          slug: 'anna-beispiel',
        })
      );
      return () => {};
    });

    const { result } = renderHook(() => useProfile('user-1'));

    await waitFor(() => expect(result.current.profile).not.toBeNull());

    await act(async () => {
      await result.current.save({ notifyOnChangesRequested: true });
    });

    expect(mockBatchSet).toHaveBeenCalledTimes(1);
    expect(mockBatchSet.mock.calls[0][0].path).toEqual(['users', 'user-1']);
    expect(mockBatchSet.mock.calls[0][1]).toMatchObject({
      notifyOnChangesRequested: true,
      slug: 'anna-beispiel',
    });
  });

  it('still skips the publicProfile write for a brand-new user with only notification prefs', async () => {
    mockOnSnapshot.mockImplementation((_ref, onNext) => {
      onNext(makeSnapshot(null));
      return () => {};
    });

    const { result } = renderHook(() => useProfile('user-2'));

    await waitFor(() => expect(result.current.profile).not.toBeNull());

    await act(async () => {
      await result.current.save({ notifyOnPublished: false });
    });

    expect(mockFindUniqueProfileSlug).not.toHaveBeenCalled();
    expect(mockBatchSet).toHaveBeenCalledTimes(1);
    expect(mockBatchSet.mock.calls[0][0].path).toEqual(['users', 'user-2']);
  });

  it('still recomputes the slug and writes the publicProfile when displayName changes', async () => {
    mockOnSnapshot.mockImplementation((_ref, onNext) => {
      onNext(
        makeSnapshot({
          displayName: 'Anna Beispiel',
          bio: '',
          website: '',
          photoURL: null,
          slug: 'anna-beispiel',
        })
      );
      return () => {};
    });

    mockFindUniqueProfileSlug.mockResolvedValueOnce('anna-beispiel-neu');

    const { result } = renderHook(() => useProfile('user-1'));

    await waitFor(() => expect(result.current.profile).not.toBeNull());

    await act(async () => {
      const newSlug = await result.current.save({
        displayName: 'Anna Beispiel Neu',
        bio: 'neue Bio',
      });
      expect(newSlug).toBe('anna-beispiel-neu');
    });

    expect(mockFindUniqueProfileSlug).toHaveBeenCalledTimes(1);
    expect(mockBatchSet).toHaveBeenCalledTimes(2);
    const calls = mockBatchSet.mock.calls.map(([ref, payload]) => ({
      path: ref.path,
      payload,
    }));
    expect(calls).toContainEqual({
      path: ['users', 'user-1'],
      payload: expect.objectContaining({
        displayName: 'Anna Beispiel Neu',
        slug: 'anna-beispiel-neu',
      }),
    });
    expect(calls).toContainEqual({
      path: ['users', 'user-1', 'publicProfile', 'data'],
      payload: expect.objectContaining({
        displayName: 'Anna Beispiel Neu',
        bio: 'neue Bio',
        slug: 'anna-beispiel-neu',
      }),
    });
  });
});

describe('useProfile.save — social media mirroring (gIVugxij)', () => {
  function setupWithProfile(profileData) {
    mockOnSnapshot.mockImplementation((_ref, onNext) => {
      onNext(makeSnapshot(profileData));
      return () => {};
    });
  }

  it('always writes socialMedia to the private users/{uid} doc', async () => {
    setupWithProfile({
      displayName: 'Anna Beispiel',
      bio: '',
      website: '',
      photoURL: null,
      slug: 'anna-beispiel',
      socialMedia: { facebook: 'anna.fb', instagram: 'anna.ig', sharePublicly: false },
    });

    const { result } = renderHook(() => useProfile('user-1'));
    await waitFor(() => expect(result.current.profile).not.toBeNull());

    await act(async () => {
      await result.current.save({
        socialMedia: {
          facebook: 'anna.fb',
          instagram: 'anna.ig',
          sharePublicly: false,
        },
      });
    });

    const privatePayload = mockBatchSet.mock.calls.find(([ref]) => ref.path?.[0] === 'users')?.[1];
    expect(privatePayload).toMatchObject({
      socialMedia: {
        facebook: 'anna.fb',
        instagram: 'anna.ig',
        sharePublicly: false,
      },
    });
  });

  it('mirrors socialMedia to publicProfile only when sharePublicly=true', async () => {
    setupWithProfile({
      displayName: 'Anna Beispiel',
      bio: '',
      website: '',
      photoURL: null,
      slug: 'anna-beispiel',
      socialMedia: { facebook: 'anna.fb', instagram: 'anna.ig', sharePublicly: true },
    });

    const { result } = renderHook(() => useProfile('user-1'));
    await waitFor(() => expect(result.current.profile).not.toBeNull());

    await act(async () => {
      await result.current.save({
        socialMedia: {
          facebook: 'anna.fb',
          instagram: 'anna.ig',
          sharePublicly: true,
        },
      });
    });

    const publicPayload = mockBatchSet.mock.calls.find(
      ([ref]) => ref.path?.join('/') === 'users/user-1/publicProfile/data'
    )?.[1];
    expect(publicPayload).toMatchObject({
      slug: 'anna-beispiel',
      socialMedia: {
        facebook: 'anna.fb',
        instagram: 'anna.ig',
        sharePublicly: true,
      },
    });
  });

  it('omits socialMedia from publicProfile when sharePublicly=false', async () => {
    setupWithProfile({
      displayName: 'Anna Beispiel',
      bio: '',
      website: '',
      photoURL: null,
      slug: 'anna-beispiel',
      socialMedia: { facebook: '', instagram: '', sharePublicly: false },
    });

    const { result } = renderHook(() => useProfile('user-1'));
    await waitFor(() => expect(result.current.profile).not.toBeNull());

    await act(async () => {
      await result.current.save({
        socialMedia: {
          facebook: 'anna.fb',
          instagram: 'anna.ig',
          sharePublicly: false,
        },
      });
    });

    // No publicProfile write should happen — slug is unchanged and socialMedia
    // is excluded because sharePublicly is false.
    const publicCall = mockBatchSet.mock.calls.find(
      ([ref]) => ref.path?.join('/') === 'users/user-1/publicProfile/data'
    );
    expect(publicCall).toBeUndefined();
  });

  it('actively removes socialMedia from publicProfile when toggling sharePublicly off', async () => {
    setupWithProfile({
      displayName: 'Anna Beispiel',
      bio: '',
      website: '',
      photoURL: null,
      slug: 'anna-beispiel',
      socialMedia: { facebook: 'anna.fb', instagram: 'anna.ig', sharePublicly: true },
    });

    const { result } = renderHook(() => useProfile('user-1'));
    await waitFor(() => expect(result.current.profile).not.toBeNull());

    await act(async () => {
      await result.current.save({
        socialMedia: {
          facebook: 'anna.fb',
          instagram: 'anna.ig',
          sharePublicly: false,
        },
      });
    });

    const publicPayload = mockBatchSet.mock.calls.find(
      ([ref]) => ref.path?.join('/') === 'users/user-1/publicProfile/data'
    )?.[1];
    expect(publicPayload).toBeDefined();
    expect(publicPayload.socialMedia).toMatchObject({ __deleteField: true });
  });

  it('trims whitespace from socialMedia handles when mirroring', async () => {
    setupWithProfile({
      displayName: 'Anna Beispiel',
      bio: '',
      website: '',
      photoURL: null,
      slug: 'anna-beispiel',
      socialMedia: { facebook: '', instagram: '', sharePublicly: true },
    });

    const { result } = renderHook(() => useProfile('user-1'));
    await waitFor(() => expect(result.current.profile).not.toBeNull());

    await act(async () => {
      await result.current.save({
        socialMedia: {
          facebook: '  anna.fb  ',
          instagram: '  anna.ig  ',
          sharePublicly: true,
        },
      });
    });

    const publicPayload = mockBatchSet.mock.calls.find(
      ([ref]) => ref.path?.join('/') === 'users/user-1/publicProfile/data'
    )?.[1];
    expect(publicPayload.socialMedia).toEqual({
      facebook: 'anna.fb',
      instagram: 'anna.ig',
      sharePublicly: true,
    });
  });
});

describe('useProfile.save — rich-text bio (kKjV8UFZ)', () => {
  function setupWithProfile(profileData) {
    mockOnSnapshot.mockImplementation((_ref, onNext) => {
      onNext(makeSnapshot(profileData));
    });
  }

  it('mirrors bioHtml to the publicProfile doc alongside bio', async () => {
    setupWithProfile({
      displayName: 'Anna Beispiel',
      bio: '',
      website: '',
      photoURL: null,
      slug: 'anna-beispiel',
    });

    const { result } = renderHook(() => useProfile('user-1'));
    await waitFor(() => expect(result.current.profile).not.toBeNull());

    await act(async () => {
      await result.current.save({
        bio: 'Kurze Beschreibung',
        bioHtml: '<p>Kurze <strong>Beschreibung</strong></p>',
      });
    });

    const publicPayload = mockBatchSet.mock.calls.find(
      ([ref]) => ref.path?.join('/') === 'users/user-1/publicProfile/data'
    )?.[1];
    expect(publicPayload).toMatchObject({
      slug: 'anna-beispiel',
      bio: 'Kurze Beschreibung',
      bioHtml: '<p>Kurze <strong>Beschreibung</strong></p>',
    });
  });

  it('writes bioHtml to the private users/{uid} doc', async () => {
    setupWithProfile({
      displayName: 'Anna Beispiel',
      bio: '',
      website: '',
      photoURL: null,
      slug: 'anna-beispiel',
    });

    const { result } = renderHook(() => useProfile('user-1'));
    await waitFor(() => expect(result.current.profile).not.toBeNull());

    await act(async () => {
      await result.current.save({
        bio: 'Eine neue Bio.',
        bioHtml: '<p>Eine neue <em>Bio</em>.</p>',
      });
    });

    const privatePayload = mockBatchSet.mock.calls.find(([ref]) => ref.path?.[0] === 'users')?.[1];
    expect(privatePayload).toMatchObject({
      bioHtml: '<p>Eine neue <em>Bio</em>.</p>',
    });
  });
});
