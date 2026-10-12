import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { appCheckOptions, logMissingAppCheck } from './appCheck';
import { logger } from 'firebase-functions';
import { GoogleAuth } from 'google-auth-library';
import { assertAdmin } from './adminMembers';
import {
  buildReport,
  buildRequests,
  parseRange,
  type AnalyticsReport,
  type GaResponse,
  type RangeDays,
} from './analyticsReport';

const ALLOWED_ORIGINS = [
  'https://www.thetribe.at',
  'https://thetribe.at',
  'https://spirieventsvbg.web.app',
  'http://localhost:5180',
];

// GA4 property of the web stream G-34TNY65VBC. The function's runtime service
// account must be a "Betrachter" of this property (see AGENTS.md → Analytics).
const GA_PROPERTY_ID = '529962266';
const CACHE_MS = 10 * 60 * 1000;

const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/analytics.readonly'] });
const cache = new Map<RangeDays, { at: number; report: AnalyticsReport }>();

async function runReport(token: string, body: unknown): Promise<GaResponse> {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${GA_PROPERTY_ID}:runReport`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  const json = (await res.json()) as GaResponse & { error?: { message?: string } };
  if (!res.ok) {
    throw new Error(`GA Data API ${res.status}: ${json.error?.message ?? 'unknown error'}`);
  }
  return json;
}

export const adminAnalyticsReport = onCall(
  { region: 'europe-west3', cors: ALLOWED_ORIGINS, ...appCheckOptions() },
  async (request): Promise<AnalyticsReport> => {
    logMissingAppCheck('adminAnalyticsReport', request);
    await assertAdmin(request.auth?.uid);
    const days = parseRange((request.data as { days?: unknown } | undefined)?.days);

    const hit = cache.get(days);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.report;

    try {
      const token = await auth.getAccessToken();
      if (!token) throw new Error('No access token');
      const q = buildRequests(days);
      const [totals, daily, pages, channels, devices, actions] = await Promise.all([
        runReport(token, q.totals),
        runReport(token, q.daily),
        runReport(token, q.pages),
        runReport(token, q.channels),
        runReport(token, q.devices),
        runReport(token, q.actions),
      ]);
      const report = buildReport({ totals, daily, pages, channels, devices, actions }, days);
      cache.set(days, { at: Date.now(), report });
      return report;
    } catch (err) {
      const message = (err as Error)?.message ?? '';
      logger.error('adminAnalyticsReport failed', { err: message });
      if (/permission|403/i.test(message)) {
        throw new HttpsError(
          'failed-precondition',
          'Kein Zugriff auf Google Analytics. Das Dienstkonto der Function muss in GA als Betrachter eingeladen sein.'
        );
      }
      throw new HttpsError('internal', 'Die Statistik konnte nicht geladen werden.');
    }
  }
);
