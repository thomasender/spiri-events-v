import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { appCheckOptions, logMissingAppCheck } from './appCheck';
import { assertAdmin } from './adminMembers';
import { MAILGUN_API_KEY, MAILGUN_DOMAIN, isMailgunDryRun } from './mailgun';
import {
  buildReport,
  buildRequests,
  parseRange,
  sampleReport,
  type CustomLimitResponse,
  type MailgunUsageReport,
  type MetricsResponse,
  type RangeDays,
} from './mailgunUsage';

const ALLOWED_ORIGINS = [
  'https://www.thetribe.at',
  'https://thetribe.at',
  'https://spirieventsvbg.web.app',
  'http://localhost:5180',
];

// The Mailgun API does not expose the quota of the booked plan, so it is kept here
// (messages per month; null = show usage only). A custom limit set in the Mailgun
// dashboard takes precedence. Update this when the plan changes.
const PLAN_MONTHLY_LIMIT: number | null = 10_000;

// Account-level API (not per domain); EU region like the sending code in mailgun.ts.
const MAILGUN_EU_HOST = 'https://api.eu.mailgun.net';
const CACHE_MS = 10 * 60 * 1000;

const cache = new Map<RangeDays, { at: number; report: MailgunUsageReport }>();

function authHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`;
}

async function postMetrics(apiKey: string, body: unknown): Promise<MetricsResponse> {
  const res = await fetch(`${MAILGUN_EU_HOST}/v1/analytics/metrics`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(apiKey),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Mailgun metrics ${res.status}`);
  return (await res.json()) as MetricsResponse;
}

/** null when no custom limit is set (Mailgun answers 404) or the lookup fails. */
async function getCustomLimit(apiKey: string): Promise<CustomLimitResponse | null> {
  try {
    const res = await fetch(`${MAILGUN_EU_HOST}/v5/accounts/limit/custom/monthly`, {
      headers: { Authorization: authHeader(apiKey), Accept: 'application/json' },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`status ${res.status}`);
    return (await res.json()) as CustomLimitResponse;
  } catch (err) {
    logger.warn('adminMailgunUsage: custom limit lookup failed', { err: (err as Error)?.message });
    return null;
  }
}

export const adminMailgunUsage = onCall(
  {
    region: 'europe-west3',
    cors: ALLOWED_ORIGINS,
    secrets: [MAILGUN_API_KEY, MAILGUN_DOMAIN],
    ...appCheckOptions(),
  },
  async (request): Promise<MailgunUsageReport> => {
    logMissingAppCheck('adminMailgunUsage', request);
    await assertAdmin(request.auth?.uid);
    const days = parseRange((request.data as { days?: unknown } | undefined)?.days);

    if (isMailgunDryRun(process.env)) return sampleReport(days);

    const hit = cache.get(days);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.report;

    try {
      const apiKey = MAILGUN_API_KEY.value();
      if (!apiKey) throw new Error('Missing Mailgun API key');
      const q = buildRequests(days);
      const [range, month, customLimit] = await Promise.all([
        postMetrics(apiKey, q.range),
        postMetrics(apiKey, q.month),
        getCustomLimit(apiKey),
      ]);
      const report = buildReport(
        {
          range,
          month,
          customLimit,
          configuredLimit: PLAN_MONTHLY_LIMIT,
        },
        days
      );
      cache.set(days, { at: Date.now(), report });
      return report;
    } catch (err) {
      const message = (err as Error)?.message ?? '';
      logger.error('adminMailgunUsage failed', { err: message });
      if (/ 401| 403/.test(message)) {
        throw new HttpsError(
          'failed-precondition',
          'Mailgun hat den Zugang abgelehnt. Bitte den API-Schlüssel prüfen.'
        );
      }
      throw new HttpsError('internal', 'Die E-Mail-Statistik konnte nicht geladen werden.');
    }
  }
);
