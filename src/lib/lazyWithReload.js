import { lazy } from 'react';
import { isBrowserOnline, watchSlowLoad } from '../utils/networkStatus';

export const CHUNK_RELOAD_KEY = 'chunk-reload-attempted';

// Pages outside the landing routes are split into their own chunks so the
// first visit only downloads what the calendar / event page needs. After a
// deploy the old chunk files are gone; a tab opened before the deploy would
// then fail to load a page it has not visited yet. Reload once to pick up the
// new build, and only once, so a real outage still ends in the error page
// instead of a reload loop.
// Offline, a reload would only show the browser's own error page: keep the
// spinner instead (the connection hint says why) and try again once the browser
// is back online. A failed CSS/JS preload (Vite's `vite:preloadError`) rejects
// the same import, so it takes the same way.
// A chunk taking longer than SLOW_LOAD_THRESHOLD_MS reports a slow connection.
export function loadWithReload(importer, { storage, reload, isOnline, waitForOnline } = {}) {
  const store = storage ?? safeSessionStorage();
  const doReload = reload ?? (() => window.location.reload());
  const online = isOnline ?? isBrowserOnline;
  const untilOnline = waitForOnline ?? waitForOnlineEvent;
  const slowWatch = watchSlowLoad('page');
  return importer().then(
    (module) => {
      slowWatch.done();
      try {
        store?.removeItem(CHUNK_RELOAD_KEY);
      } catch {
        // storage unavailable: nothing to clear
      }
      return module;
    },
    (error) => {
      slowWatch.cancel();
      if (!online()) {
        return untilOnline().then(() =>
          loadWithReload(importer, { storage, reload, isOnline, waitForOnline })
        );
      }
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

function waitForOnlineEvent() {
  return new Promise((resolve) => {
    window.addEventListener('online', () => resolve(), { once: true });
  });
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
