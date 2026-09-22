import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOrganizerProfileExists } from '../../src/hooks/useOrganizerProfileExists';

const mockSubscription = vi.hoisted(() => ({
  existsByUid: new Map<string, boolean>(),
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
      const exists = mockSubscription.existsByUid.has(uid)
        ? Boolean(mockSubscription.existsByUid.get(uid))
        : true;
      callback({ exists: () => exists, data: () => ({}) });
    }
    return () => {};
  },
}));

vi.mock('../../src/lib/firebase', () => ({
  db: {},
}));

beforeEach(() => {
  mockSubscription.existsByUid.clear();
  mockSubscription.callbacksByPath.clear();
  mockSubscription.errorCallbacksByPath.clear();
});

describe('useOrganizerProfileExists (LjqWg0mD)', () => {
  it('returns exists=true when the publicProfile doc exists', () => {
    mockSubscription.existsByUid.set('user-1', true);
    const { result } = renderHook(() => useOrganizerProfileExists('user-1'));
    expect(result.current.exists).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it('returns exists=false when the publicProfile doc is missing', () => {
    mockSubscription.existsByUid.set('user-2', false);
    const { result } = renderHook(() => useOrganizerProfileExists('user-2'));
    expect(result.current.exists).toBe(false);
  });

  it('treats a missing uid as exists=false without subscribing', () => {
    const { result } = renderHook(() => useOrganizerProfileExists(undefined));
    expect(result.current.exists).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(mockSubscription.callbacksByPath.size).toBe(0);
  });

  it('treats an empty-string uid as exists=false', () => {
    const { result } = renderHook(() => useOrganizerProfileExists(''));
    expect(result.current.exists).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(mockSubscription.callbacksByPath.size).toBe(0);
  });

  it('reflects later snapshot updates for the same uid', () => {
    const { result } = renderHook(() => useOrganizerProfileExists('user-3'));
    expect(result.current.exists).toBe(true);

    const callback = mockSubscription.callbacksByPath.get('users/user-3/publicProfile/data');
    expect(callback).toBeDefined();

    act(() => {
      callback?.({ exists: () => false, data: () => ({}) });
    });
    expect(result.current.exists).toBe(false);

    act(() => {
      callback?.({ exists: () => true, data: () => ({}) });
    });
    expect(result.current.exists).toBe(true);
  });

  it('reports exists=false when the snapshot errors', () => {
    const { result } = renderHook(() => useOrganizerProfileExists('user-4'));
    expect(result.current.exists).toBe(true);

    const onError = mockSubscription.errorCallbacksByPath.get('users/user-4/publicProfile/data');
    expect(onError).toBeDefined();

    act(() => {
      onError?.(new Error('permission-denied'));
    });
    expect(result.current.exists).toBe(false);
    expect(result.current.loading).toBe(false);
  });
});
