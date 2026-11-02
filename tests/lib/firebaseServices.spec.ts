import { describe, it, expect, vi } from 'vitest';

// src/lib/firebase.js: Auth and Firestore start with the page, Storage and Functions are
// loaded on first use and always hand out the same instance.
const calls = vi.hoisted(() => ({ order: [] as string[] }));

vi.mock('firebase/app', () => ({ initializeApp: () => ({ name: 'app' }) }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({}), connectAuthEmulator: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  getFirestore: () => {
    calls.order.push('firestore');
    return {};
  },
  connectFirestoreEmulator: vi.fn(),
}));
vi.mock('../../src/lib/appCheck', () => ({
  setupAppCheck: () => {
    calls.order.push('appCheck');
    return null;
  },
}));
vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(() => ({ kind: 'storage' })),
  connectStorageEmulator: vi.fn(),
}));
vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => ({ kind: 'functions' })),
  connectFunctionsEmulator: vi.fn(),
  httpsCallable: vi.fn((_fns: unknown, name: string) => async (data: unknown) => ({
    data: { name, data },
  })),
}));

import { getStorage } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { callable, getFunctionsInstance, getStorageInstance } from '../../src/lib/firebase';

// What happened while the module was imported (= page start).
const atStart = [...calls.order];
const storageAtStart = vi.mocked(getStorage).mock.calls.length;
const functionsAtStart = vi.mocked(getFunctions).mock.calls.length;

describe('lib/firebase', () => {
  it('sets up App Check before Firestore and touches neither Storage nor Functions at start', () => {
    expect(atStart).toEqual(['appCheck', 'firestore']);
    expect(storageAtStart).toBe(0);
    expect(functionsAtStart).toBe(0);
  });

  it('hands out one Storage instance, also for calls at the same time', async () => {
    const [a, b] = await Promise.all([getStorageInstance(), getStorageInstance()]);
    const c = await getStorageInstance();
    expect(a).toEqual({ kind: 'storage' });
    expect(a).toBe(b);
    expect(a).toBe(c);
    expect(getStorage).toHaveBeenCalledTimes(1);
  });

  it('hands out one Functions instance in europe-west3; callable() uses it', async () => {
    const [a, b] = await Promise.all([getFunctionsInstance(), getFunctionsInstance()]);
    expect(a).toEqual({ kind: 'functions' });
    expect(a).toBe(b);
    const result = await callable('getCalendarFeedToken', { timeout: 5 })({ revoke: true });
    expect(result).toEqual({ data: { name: 'getCalendarFeedToken', data: { revoke: true } } });
    expect(vi.mocked(httpsCallable).mock.calls[0][0]).toBe(a);
    expect(vi.mocked(httpsCallable).mock.calls[0][2]).toEqual({ timeout: 5 });
    await callable('other')();
    expect(getFunctions).toHaveBeenCalledTimes(1);
    expect(vi.mocked(getFunctions).mock.calls[0][1]).toBe('europe-west3');
  });
});
