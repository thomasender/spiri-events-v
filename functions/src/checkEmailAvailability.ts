import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { enforceRateLimit, RATE_LIMIT_PRESETS } from './rateLimit';

const ALLOWED_ORIGINS = [
  'https://www.thetribe.at',
  'https://thetribe.at',
  'https://spirieventsvbg.web.app',
  'http://localhost:5180',
];

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

export interface CheckEmailRequest {
  auth?: { uid?: string } | null;
  data?: { email?: unknown; currentEmail?: unknown };
  rawRequest?: unknown;
}

export interface CheckEmailDeps {
  auth?: Auth;
  enforceRateLimit?: typeof enforceRateLimit;
}

export async function checkEmailAvailabilityHandler(
  request: CheckEmailRequest,
  deps: CheckEmailDeps = {}
): Promise<{ available: boolean }> {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }

  const limit = deps.enforceRateLimit ?? enforceRateLimit;
  limit(request as never, 'emailAvailability', RATE_LIMIT_PRESETS.emailAvailability);

  const payload = (request.data ?? {}) as { email?: unknown; currentEmail?: unknown };
  const email = normalizeEmail(payload.email);
  const currentEmail = normalizeEmail(payload.currentEmail);
  if (!email) {
    throw new HttpsError('invalid-argument', 'A valid email address is required.');
  }
  if (currentEmail && email === currentEmail) {
    throw new HttpsError('invalid-argument', 'The new email must differ from the current email.');
  }

  const auth = deps.auth ?? getAuth();
  try {
    const existing = await auth.getUserByEmail(email);
    if (currentEmail && existing.email && existing.email.toLowerCase() === currentEmail) {
      return { available: true };
    }
    return { available: false };
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === 'auth/user-not-found') {
      return { available: true };
    }
    throw new HttpsError('internal', 'Could not check email availability.');
  }
}

export const checkEmailAvailability = onCall(
  {
    region: 'europe-west3',
    cors: ALLOWED_ORIGINS,
  },
  (request) => checkEmailAvailabilityHandler(request)
);
