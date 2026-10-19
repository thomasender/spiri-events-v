import { lazy } from 'react';

export const CHUNK_RELOAD_KEY = 'chunk-reload-attempted';

// Pages outside the landing routes are split into their own chunks so the
// first visit only downloads what the calendar / event page needs. After a
// deploy the old chunk files are gone; a tab opened before the deploy would
// then fail to load a page it has not visited yet. Reload once to pick up the
// new build, and only once, so a real outage still ends in the error page
// instead of a reload loop.
export function loadWithReload(importer, { storage, reload } = {}) {
  const store = storage ?? safeSessionStorage();
  const doReload = reload ?? (() => window.location.reload());
  return importer().then(
    (module) => {
      try {
        store?.removeItem(CHUNK_RELOAD_KEY);
      } catch {
        // storage unavailable: nothing to clear
      }
      return module;
    },
    (error) => {
      let alreadyTried = true;
      try {
        alreadyTried = store?.getItem(CHUNK_RELOAD_KEY) === '1';
        if (!alreadyTried) store.setItem(CHUNK_RELOAD_KEY, '1');
      } catch {
        alreadyTried = true;
      }
      if (!alreadyTried) {
        doReload();
        // Keep Suspense showing its fallback while the page reloads.
        return new Promise(() => {});
      }
      throw error;
    }
  );
}

function safeSessionStorage() {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export default function lazyWithReload(importer) {
  return lazy(() => loadWithReload(importer));
}
