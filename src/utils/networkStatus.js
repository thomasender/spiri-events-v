// Connection hints for visitors (offline, very slow network). Pure logic and
// thresholds; the hook `useNetworkStatus` wires it to the browser events.

// Wait this long without a connection before saying so, so a short drop (a
// tunnel, switching from Wi-Fi to mobile data) does not flash a banner.
export const OFFLINE_SHOW_DELAY_MS = 2000;
// Once shown, the offline hint stays at least this long, so it never flickers.
export const OFFLINE_MIN_VISIBLE_MS = 2000;
// How long "Wieder verbunden." stays before it disappears.
export const RECONNECTED_VISIBLE_MS = 3000;
// A load (event list, page chunk) taking longer than this counts as slow.
export const SLOW_LOAD_THRESHOLD_MS = 8000;
// `navigator.connection.effectiveType` values treated as slow (Chromium only).
export const SLOW_CONNECTION_TYPES = ['slow-2g', '2g'];

// Window event: some load was slow or failed (`detail: { source, reason }`).
export const NETWORK_SLOW_EVENT = 'network:slow';
// The slow hint shows at most once per session.
export const SLOW_NOTICE_SESSION_KEY = 'networkSlowBannerShown';

export function isBrowserOnline(nav = typeof navigator !== 'undefined' ? navigator : undefined) {
  // Unknown counts as online: only an explicit `false` means offline.
  return nav?.onLine !== false;
}

// The Network Information API exists only in Chromium; Safari and Firefox give null.
export function readConnection(nav = typeof navigator !== 'undefined' ? navigator : undefined) {
  const connection = nav?.connection;
  return connection && typeof connection === 'object' ? connection : null;
}

export function isSlowConnection(connection) {
  return SLOW_CONNECTION_TYPES.includes(connection?.effectiveType);
}

// Read only: "Datensparmodus" gets no hint of its own.
export function prefersSaveData(connection) {
  return connection?.saveData === true;
}

export function wasSlowNoticeShown(storage = safeSessionStorage()) {
  try {
    return storage?.getItem(SLOW_NOTICE_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export function markSlowNoticeShown(storage = safeSessionStorage()) {
  try {
    storage?.setItem(SLOW_NOTICE_SESSION_KEY, '1');
  } catch {
    // storage blocked: the hint may show again after a reload, that is fine
  }
}

export function reportSlowLoad(source, reason) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(NETWORK_SLOW_EVENT, { detail: { source, reason } }));
}

// Times one load. Reports `timeout` once it runs past the threshold, or `failed`
// when `failed()` is called before that. `done()` / `cancel()` stop the timer.
export function watchSlowLoad(
  source,
  { thresholdMs = SLOW_LOAD_THRESHOLD_MS, report = reportSlowLoad } = {}
) {
  let timer = setTimeout(() => {
    timer = null;
    report(source, 'timeout');
  }, thresholdMs);
  const stop = () => {
    if (timer === null) return false;
    clearTimeout(timer);
    timer = null;
    return true;
  };
  return {
    done: stop,
    cancel: stop,
    failed: () => {
      if (stop()) report(source, 'failed');
    },
  };
}

// State of the offline hint: 'hidden' -> (after the delay) 'offline' -> (back
// online, after the minimum time) 'reconnected' -> (after a moment) 'hidden'.
// A drop shorter than the delay shows nothing at all, not even "Wieder verbunden".
export function createOfflineNotice(
  onChange,
  {
    delayMs = OFFLINE_SHOW_DELAY_MS,
    minVisibleMs = OFFLINE_MIN_VISIBLE_MS,
    reconnectedMs = RECONNECTED_VISIBLE_MS,
    now = () => Date.now(),
  } = {}
) {
  let state = 'hidden';
  let shownAt = 0;
  let showTimer = null;
  let leaveTimer = null;

  const set = (next) => {
    if (next === state) return;
    state = next;
    onChange(next);
  };
  const clearLeave = () => {
    clearTimeout(leaveTimer);
    leaveTimer = null;
  };

  return {
    get state() {
      return state;
    },
    offline() {
      if (state === 'offline') {
        // Still offline: cancel a pending switch to "Wieder verbunden".
        clearLeave();
        return;
      }
      if (showTimer) return;
      showTimer = setTimeout(() => {
        showTimer = null;
        clearLeave();
        shownAt = now();
        set('offline');
      }, delayMs);
    },
    online() {
      clearTimeout(showTimer);
      showTimer = null;
      if (state !== 'offline' || leaveTimer) return;
      const wait = Math.max(0, minVisibleMs - (now() - shownAt));
      leaveTimer = setTimeout(() => {
        set('reconnected');
        leaveTimer = setTimeout(() => {
          leaveTimer = null;
          set('hidden');
        }, reconnectedMs);
      }, wait);
    },
    dispose() {
      clearTimeout(showTimer);
      clearLeave();
      showTimer = null;
    },
  };
}

function safeSessionStorage() {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}
