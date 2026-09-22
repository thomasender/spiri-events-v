import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

interface RateLimitOptions {
  maxAttempts: number;
  windowMs: number;
}

interface BucketState {
  attempts: number[];
}

const buckets = new Map<string, BucketState>();

function cleanupOldest(state: BucketState, windowMs: number, now: number): void {
  const cutoff = now - windowMs;
  state.attempts = state.attempts.filter((t) => t > cutoff);
}

export function checkRateLimit(
  key: string,
  { maxAttempts, windowMs }: RateLimitOptions,
  now: number = Date.now()
): { allowed: boolean; retryAfterMs: number } {
  let state = buckets.get(key);
  if (!state) {
    state = { attempts: [] };
    buckets.set(key, state);
  }
  cleanupOldest(state, windowMs, now);
  if (state.attempts.length >= maxAttempts) {
    const earliest = state.attempts[0];
    const retryAfterMs = Math.max(0, earliest + windowMs - now);
    return { allowed: false, retryAfterMs };
  }
  return { allowed: true, retryAfterMs: 0 };
}

export function recordRateLimitAttempt(
  key: string,
  { maxAttempts, windowMs }: RateLimitOptions,
  now: number = Date.now()
): void {
  let state = buckets.get(key);
  if (!state) {
    state = { attempts: [] };
    buckets.set(key, state);
  }
  cleanupOldest(state, windowMs, now);
  state.attempts.push(now);
  if (state.attempts.length > Math.max(maxAttempts, 10)) {
    state.attempts = state.attempts.slice(-Math.max(maxAttempts, 10));
  }
}

function readHeader(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string
): string | undefined {
  if (!headers) return undefined;
  const raw = headers[name.toLowerCase()] ?? headers[name];
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

export function getClientIdentifier(req: {
  rawRequest?: {
    headers?: Record<string, string | string[] | undefined>;
    ip?: string;
    socket?: { remoteAddress?: string };
  };
}): string {
  const forwardedFor = readHeader(req.rawRequest?.headers, 'x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }
  if (req.rawRequest?.ip) return req.rawRequest.ip;
  if (req.rawRequest?.socket?.remoteAddress) return req.rawRequest.socket.remoteAddress;
  return 'anon';
}

export function enforceRateLimit(
  req: {
    rawRequest?: {
      headers?: Record<string, string | string[] | undefined>;
      ip?: string;
      socket?: { remoteAddress?: string };
    };
    auth?: { uid?: string } | null;
  },
  action: string,
  options: RateLimitOptions
): void {
  const identifier = req.auth?.uid || getClientIdentifier(req);
  const key = `${action}:${identifier}`;
  const status = checkRateLimit(key, options);
  if (!status.allowed) {
    logger.warn('Rate limit exceeded', { action, identifier, retryAfterMs: status.retryAfterMs });
    throw new HttpsError(
      'resource-exhausted',
      `Too many ${action} attempts. Please wait a moment and try again.`,
      { retryAfterMs: status.retryAfterMs }
    );
  }
  recordRateLimitAttempt(key, options);
}

export const RATE_LIMIT_PRESETS = {
  donation: { maxAttempts: 5, windowMs: 10 * 60 * 1000 },
  feedback: { maxAttempts: 3, windowMs: 10 * 60 * 1000 },
  contact: { maxAttempts: 5, windowMs: 10 * 60 * 1000 },
  passwordReset: { maxAttempts: 3, windowMs: 15 * 60 * 1000 },
} as const;
