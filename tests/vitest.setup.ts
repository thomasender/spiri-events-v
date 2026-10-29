import { expect, afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers);

// The favorites store opens a real Firebase auth/Firestore listener. Component
// tests (which often mock '../lib/firebase' only partially) get an inert,
// signed-out store; specs that care mock the useFavorites hook themselves.
vi.mock('../src/lib/favoritesStore', () => {
  const state = { ready: true, uid: null, ids: new Set() };
  return {
    subscribe: () => () => {},
    getSnapshot: () => state,
    setFavorite: async () => {},
    setPendingFavorite: () => {},
  };
});

// Same for the shared Vereinsmitglieder listener: no member, no badge. Specs
// that test the badge mock the useClubMembers hook themselves.
vi.mock('../src/lib/clubMembersStore', () => {
  const state = { ready: true, uids: new Set() };
  return { subscribe: () => () => {}, getSnapshot: () => state };
});

// District colours come from a shared Firestore listener. Component tests get the code defaults
// (and automatic colours); specs that test the hook or the editor mock it themselves.
vi.mock('../src/hooks/useDistrictColors', async () => {
  const colors = await import('../src/utils/districtColors');
  const noOverrides = {};
  return {
    useDistrictColors: () => ({
      overrides: noOverrides,
      loading: false,
      colorFor: (name: string) => colors.getDistrictColor(name, {}, []),
      activeDistricts: [],
      autoColors: {},
    }),
    saveDistrictColors: async () => {},
  };
});

// App Check would talk to reCAPTCHA. Specs that test it mock this module
// themselves; everything else gets inert stand-ins and never touches the network.
vi.mock('firebase/app-check', () => ({
  initializeAppCheck: vi.fn(() => ({})),
  getToken: vi.fn(async () => ({ token: 'test-token' })),
  ReCaptchaEnterpriseProvider: vi.fn(),
  ReCaptchaV3Provider: vi.fn(),
}));

function createMemoryStorage() {
  const store = new Map();
  return {
    get length() {
      return store.size;
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

const storage = createMemoryStorage();

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    value: storage,
    writable: true,
    configurable: true,
  });
}
Object.defineProperty(globalThis, 'localStorage', {
  value: storage,
  writable: true,
  configurable: true,
});

// Tests override browser globals with Object.defineProperty (userAgent,
// maxTouchPoints, standalone, matchMedia, ...). Snapshot them once and put them
// back after every test, so a test never depends on which test ran before it.
// `sequence.shuffle` in vitest.config.ts (CI=shuffle) exists to catch the ones
// that slip through.
// Files with `@vitest-environment node` have neither navigator nor window.
const GLOBALS_TO_RESTORE: Array<[object, string[]]> =
  typeof window === 'undefined'
    ? []
    : [
        [
          navigator,
          [
            'userAgent',
            'maxTouchPoints',
            'standalone',
            'language',
            'onLine',
            'clipboard',
            'share',
            'canShare',
          ],
        ],
        [window, ['matchMedia', 'innerWidth', 'innerHeight', 'scrollTo', 'open']],
      ];
const snapshots = GLOBALS_TO_RESTORE.map(([target, keys]) => ({
  target,
  descriptors: keys.map((key) => [key, Object.getOwnPropertyDescriptor(target, key)] as const),
}));

function restoreGlobals() {
  for (const { target, descriptors } of snapshots) {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(target, key, descriptor);
      else delete (target as Record<string, unknown>)[key];
    }
  }
}

afterEach(() => {
  cleanup();
  storage.clear();
  restoreGlobals();
});

// Unit tests must never touch the network: it makes them slow, makes them
// depend on the machine being online, and lets a missing mock pass silently
// (a 403 from a real server looks like "handled"). Tests that need fetch stub
// it themselves with vi.stubGlobal('fetch', ...); unstubGlobals undoes that.
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) =>
      Promise.reject(
        new Error(
          `Unexpected network request in a unit test: ${String((input as Request)?.url ?? input)}. Stub fetch in the test.`
        )
      )
    )
  );
});
