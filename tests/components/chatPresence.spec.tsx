import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useChatHeartbeat } from '../../src/hooks/useChatPresence';
import { dropHeartbeats } from '../../src/hooks/useAuth';

const fs = vi.hoisted(() => ({
  setDoc: vi.fn(async () => {}),
  deleteDoc: vi.fn(async () => {}),
}));

vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  collection: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  onSnapshot: () => () => {},
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  setDoc: fs.setDoc,
  deleteDoc: fs.deleteDoc,
  serverTimestamp: () => 'SERVER_TS',
}));
vi.mock('../../src/lib/firebase', () => ({
  db: {},
  auth: {},
  callable: () => async () => ({}),
  getStorageInstance: () => ({}),
}));
vi.mock('../../src/hooks/useAuth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/hooks/useAuth')>()),
  useAuth: () => ({ user: { uid: 'me', displayName: 'Mira' } }),
}));
vi.mock('../../src/hooks/useProfile', () => ({
  useProfile: () => ({ profile: { displayName: 'Mira' } }),
}));

const setVisibility = (value: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { value, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
};

describe('useChatHeartbeat', () => {
  beforeEach(() => {
    fs.setDoc.mockClear();
    fs.deleteDoc.mockClear();
  });
  afterEach(() => setVisibility('visible'));

  it('leaves the fire as soon as the page is hidden and comes back when visible', () => {
    renderHook(() => useChatHeartbeat(true));
    expect(fs.setDoc).toHaveBeenCalledTimes(1);

    setVisibility('hidden');
    expect(fs.deleteDoc).toHaveBeenCalledWith({ path: 'chat_rooms/lagerfeuer/presence/me' });

    setVisibility('visible');
    expect(fs.setDoc).toHaveBeenCalledTimes(2);
  });
});

describe('dropHeartbeats (logout)', () => {
  beforeEach(() => fs.deleteDoc.mockClear());

  it('deletes both heartbeats while still signed in', async () => {
    await dropHeartbeats('me');
    expect(fs.deleteDoc).toHaveBeenCalledWith({ path: 'chat_rooms/lagerfeuer/presence/me' });
    expect(fs.deleteDoc).toHaveBeenCalledWith({ path: 'presence/me' });
  });

  it('does not hang when the deletes never reach the server (offline)', async () => {
    fs.deleteDoc.mockImplementation(() => new Promise(() => {}));
    await expect(dropHeartbeats('me', 10)).resolves.toBeUndefined();
    fs.deleteDoc.mockImplementation(async () => {});
  });

  it('does nothing without a signed-in person', async () => {
    await dropHeartbeats(undefined);
    expect(fs.deleteDoc).not.toHaveBeenCalled();
  });
});
