import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { appCheckOptions, logMissingAppCheck } from './appCheck';
import { logger } from 'firebase-functions';
import { GoogleAuth } from 'google-auth-library';
import { assertAdmin } from './adminMembers';
import {
  buildRegionsRequest,
  buildReport,
  buildRequests,
  buildUnavailableReport,
  isUnknownRegionDimensionError,
  parseRange,
  parseRegion,
  type AnalyticsReport,
  type GaResponse,
  type RangeDays,
} from './analyticsReport';
import { ALLOWED_ORIGINS } from './allowedOrigins';

// GA4 property of the web stream G-34TNY65VBC. The function's runtime service
// account must be a "Betrachter" of this property (see AGENTS.md → Analytics).
const GA_PROPERTY_ID = '529962266';
const CACHE_MS = 10 * 60 * 1000;

const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/analytics.readonly'] });
const cache = new Map<string, { at: number; report: AnalyticsReport }>();

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
    const data = request.data as { days?: unknown; region?: unknown } | undefined;
    const days = parseRange(data?.days);
    const region = parseRegion(data?.region);
    const cacheKey = `${days}:${region ?? ''}`;

    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.report;

    try {
      const token = await auth.getAccessToken();
      if (!token) throw new Error('No access token');
      const q = buildRequests(days, region);
      // Comparison table: only without a region filter. GA rejects the request
      // until the custom dimension "region" is registered; that must not break
      // the rest of the report.
      let dimensionMissing = false;
      const regionsRequest = region
        ? Promise.resolve(undefined)
        : runReport(token, buildRegionsRequest(days)).catch((err: Error) => {
            if (isUnknownRegionDimensionError(err.message)) {
              dimensionMissing = true;
              return undefined;
            }
            throw err;
          });
      const [totals, daily, pages, channels, devices, actions, regions] = await Promise.all([
        runReport(token, q.totals),
        runReport(token, q.daily),
        runReport(token, q.pages),
        runReport(token, q.channels),
        runReport(token, q.devices),
        runReport(token, q.actions),
        regionsRequest,
      ]);
      const report: AnalyticsReport = {
        ...buildReport({ totals, daily, pages, channels, devices, actions, regions }, days),
        ...(region ? { region } : {}),
        ...(dimensionMissing ? { regionDimension: 'unavailable' as const } : {}),
      };
      cache.set(cacheKey, { at: Date.now(), report });
      return report;
    } catch (err) {
      const message = (err as Error)?.message ?? '';
      if (region && isUnknownRegionDimensionError(message)) {
        const report = buildUnavailableReport(days, region);
        cache.set(cacheKey, { at: Date.now(), report });
        return report;
      }
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
