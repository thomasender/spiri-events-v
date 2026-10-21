// Online status (opt-in): pure helpers. See docs/online-status.md.

// Heartbeat once a minute while the site is open and visible; a person counts as
// online while the last beat is younger than two minutes.
export const ONLINE_BEAT_MS = 60 * 1000;
export const ONLINE_WINDOW_MS = 2 * 60 * 1000;
export const ONLINE_TICK_MS = 30 * 1000;

// 'online' | 'offline' | null. null = show no dot: the person does not share
// their status, or the viewer is not allowed to see statuses.
export function onlineStatusOf({ uid, shares, onlineUids, viewerCanSee }) {
  if (!viewerCanSee || shares !== true || !uid) return null;
  return onlineUids?.has(uid) ? 'online' : 'offline';
}

export function onlineUidsFrom(entries, nowMs = Date.now()) {
  return new Set(
    (entries ?? [])
      .filter((e) => typeof e.lastSeenMs === 'number' && nowMs - e.lastSeenMs < ONLINE_WINDOW_MS)
      .map((e) => e.uid)
  );
}
