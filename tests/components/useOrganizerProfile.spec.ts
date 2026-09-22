import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOrganizerProfile } from '../../src/hooks/useOrganizerProfile';

const mockSubscription = vi.hoisted(() => ({
  profileByUid: new Map<string, { displayName: string; slug: string } | null>(),
  callbacksByPath: new Map<string, (snap: unknown) => void>(),
  errorCallbacksByPath: new Map<string, (err: unknown) => void>(),
}));

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segments: string[]) => ({
    type: 'doc',
    path: segments.join('/'),
    id: segments[segments.length - 1],
  }),
  onSnapshot: (
    ref: { path?: string },
    callback: (snap: unknown) => void,
    onError?: (err: unknown) => void
  ) => {
    const path = ref?.path || '';
    mockSubscription.callbacksByPath.set(path, callback);
    if (onError) {
      mockSubscription.errorCallbacksByPath.set(path, onError);
    }
    const uidMatch = path.match(/^users\/([^/]+)\/publicProfile\/(.+)$/);
    if (uidMatch) {
      const uid = uidMatch[1];
      if (mockSubscription.profileByUid.has(uid)) {
        const data = mockSubscription.profileByUid.get(uid);
        const exists = data !== null;
        callback({
          exists: () => exists,
          id: 'data',
          data: () => (data ? { displayName: data.displayName, slug: data.slug } : {}),
        });
      } else {
        callback({ exists: () => false, id: 'data', data: () => ({}) });
      }
    }
    return () => {};
  },
}));

vi.mock('../../src/lib/firebase', () => ({
  db: {},
}));

beforeEach(() => {
  mockSubscription.profileByUid.clear();
  mockSubscription.callbacksByPath.clear();
  mockSubscription.errorCallbacksByPath.clear();
});

describe('useOrganizerProfile (TYz5kp0d)', () => {
  it('returns the profile data when the publicProfile doc exists', () => {
    mockSubscription.profileByUid.set('user-1', {
      displayName: 'Anna Schmidt',
      slug: 'anna-schmidt',
    });
    const { result } = renderHook(() => useOrganizerProfile('user-1'));
    expect(result.current.exists).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(result.current.profile).toEqual({
      id: 'data',
      displayName: 'Anna Schmidt',
      slug: 'anna-schmidt',
    });
  });

  it('returns exists=false and a null profile when the publicProfile doc is missing', () => {
    mockSubscription.profileByUid.set('user-2', null);
    const { result } = renderHook(() => useOrganizerProfile('user-2'));
    expect(result.current.exists).toBe(false);
    expect(result.current.profile).toBeNull();
  });

  it('treats a missing uid as no profile without subscribing', () => {
    const { result } = renderHook(() => useOrganizerProfile(undefined));
    expect(result.current.exists).toBe(false);
    expect(result.current.profile).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(mockSubscription.callbacksByPath.size).toBe(0);
  });

  it('treats an empty-string uid as no profile', () => {
    const { result } = renderHook(() => useOrganizerProfile(''));
    expect(result.current.exists).toBe(false);
    expect(result.current.profile).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(mockSubscription.callbacksByPath.size).toBe(0);
  });

  it('reflects later snapshot updates for the same uid', () => {
    mockSubscription.profileByUid.set('user-3', { displayName: 'Anna', slug: 'anna' });
    const { result } = renderHook(() => useOrganizerProfile('user-3'));
    expect(result.current.exists).toBe(true);

    const callback = mockSubscription.callbacksByPath.get('users/user-3/publicProfile/data');
    expect(callback).toBeDefined();

    act(() => {
      callback?.({ exists: () => false, id: 'data', data: () => ({}) });
    });
    expect(result.current.exists).toBe(false);
    expect(result.current.profile).toBeNull();

    act(() => {
      callback?.({
        exists: () => true,
        id: 'data',
        data: () => ({ displayName: 'Anna', slug: 'anna' }),
      });
    });
    expect(result.current.exists).toBe(true);
    expect(result.current.profile).toEqual({ id: 'data', displayName: 'Anna', slug: 'anna' });
  });

  it('reports no profile when the snapshot errors', () => {
    mockSubscription.profileByUid.set('user-4', { displayName: 'Anna', slug: 'anna' });
    const { result } = renderHook(() => useOrganizerProfile('user-4'));
    expect(result.current.exists).toBe(true);

    const onError = mockSubscription.errorCallbacksByPath.get('users/user-4/publicProfile/data');
    expect(onError).toBeDefined();

    act(() => {
      onError?.(new Error('permission-denied'));
    });
    expect(result.current.exists).toBe(false);
    expect(result.current.profile).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
