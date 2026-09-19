const STORAGE_PREFIX = 'rl:';

function storageKey(bucket) {
  return `${STORAGE_PREFIX}${bucket}`;
}

function readTimestamps(bucket) {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(storageKey(bucket));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === 'number') : [];
  } catch {
    return [];
  }
}

function writeTimestamps(bucket, timestamps) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(storageKey(bucket), JSON.stringify(timestamps));
  } catch {
    // ignore — quota / disabled storage should not crash the app
  }
}

function pruneOldest(timestamps, maxEntries) {
  return timestamps.slice(-maxEntries);
}

export function clearRateLimit(bucket) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(storageKey(bucket));
  } catch {
    // ignore
  }
}

export function checkRateLimit({ bucket, maxAttempts, windowMs, now = Date.now() }) {
  const cutoff = now - windowMs;
  const recent = readTimestamps(bucket).filter((t) => t > cutoff);
  const trimmed = pruneOldest(recent, Math.max(maxAttempts, 10));
  if (trimmed.length >= maxAttempts) {
    const earliest = trimmed[0];
    const retryAfterMs = Math.max(0, earliest + windowMs - now);
    return { allowed: false, retryAfterMs, remaining: 0 };
  }
  return { allowed: true, retryAfterMs: 0, remaining: maxAttempts - trimmed.length };
}

export function recordRateLimitAttempt({ bucket, maxAttempts, windowMs, now = Date.now() }) {
  const cutoff = now - windowMs;
  const recent = readTimestamps(bucket).filter((t) => t > cutoff);
  const next = pruneOldest([...recent, now], Math.max(maxAttempts, 10));
  writeTimestamps(bucket, next);
  return { remaining: Math.max(0, maxAttempts - next.length) };
}

export function formatRetryAfter(ms) {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `Bitte warte ${seconds} Sekunde${seconds === 1 ? '' : 'n'}.`;
  const minutes = Math.ceil(seconds / 60);
  return `Bitte warte ${minutes} Minute${minutes === 1 ? '' : 'n'}.`;
}

export const RATE_LIMIT_PRESETS = {
  login: { maxAttempts: 5, windowMs: 5 * 60 * 1000 },
  register: { maxAttempts: 3, windowMs: 15 * 60 * 1000 },
  passwordReset: { maxAttempts: 3, windowMs: 15 * 60 * 1000 },
  feedback: { maxAttempts: 3, windowMs: 10 * 60 * 1000 },
  donation: { maxAttempts: 5, windowMs: 10 * 60 * 1000 },
};

export function rateLimitBucket(action, identifier) {
  const id = (identifier || 'anon').toLowerCase().trim();
  return `${action}:${id}`;
}
