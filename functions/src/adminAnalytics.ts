import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { appCheckOptions, logMissingAppCheck } from './appCheck';
import { logger } from 'firebase-functions';
import { GoogleAuth } from 'google-auth-library';
import { getFirestore, type DocumentData } from 'firebase-admin/firestore';
import { assertAdmin } from './adminMembers';
import {
  buildEventRequests,
  buildReport,
  buildRequests,
  buildTopEvents,
  parseRange,
  type AnalyticsReport,
  type GaResponse,
  type RangeDays,
  type TopEventsReport,
} from './analyticsReport';

export type AnalyticsResponse = AnalyticsReport & { topEvents: TopEventsReport | null };

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
let topEventsCache: { at: number; report: TopEventsReport } | null = null;

const GA_BASE = `https://analyticsdata.googleapis.com/v1beta/properties/${GA_PROPERTY_ID}`;

async function runReport(token: string, body: unknown): Promise<GaResponse> {
  return gaPost<GaResponse>(token, 'runReport', body);
}

async function gaPost<T>(token: string, method: string, body: unknown): Promise<T> {
  const res = await fetch(`${GA_BASE}:${method}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) {
    throw new Error(`GA Data API ${res.status}: ${json.error?.message ?? 'unknown error'}`);
  }
  return json;
}

/** Up to five reports in one request (GA batchRunReports), same order as given. */
async function batchReports(token: string, requests: unknown[]): Promise<GaResponse[]> {
  const json = await gaPost<{ reports?: GaResponse[] }>(token, 'batchRunReports', { requests });
  return requests.map((_, i) => json.reports?.[i] ?? {});
}

/** slug -> event title from Firestore. Legacy links use the document id as slug. */
async function eventTitles(slugs: string[]): Promise<Record<string, string>> {
  const titles: Record<string, string> = {};
  if (!slugs.length) return titles;
  try {
    const db = getFirestore();
    const take = (slug: string, data: DocumentData | undefined) => {
      if (typeof data?.title === 'string' && data.title.trim() && !titles[slug]) {
        titles[slug] = data.title.trim();
      }
    };
    for (let i = 0; i < slugs.length; i += 30) {
      const chunk = slugs.slice(i, i + 30);
      const snap = await db.collection('events').where('slug', 'in', chunk).get();
      snap.forEach((d) => take(String(d.get('slug')).toLowerCase(), d.data()));
    }
    const missing = slugs.filter((s) => !titles[s] && /^[A-Za-z0-9]{15,}$/.test(s));
    if (missing.length) {
      const docs = await db.getAll(...missing.map((id) => db.collection('events').doc(id)));
      docs.forEach((d, i) => d.exists && take(missing[i], d.data()));
    }
  } catch (err) {
    logger.warn('adminAnalyticsReport: event titles lookup failed', {
      err: (err as Error)?.message,
    });
  }
  return titles;
}

async function loadTopEvents(token: string): Promise<TopEventsReport> {
  if (topEventsCache && Date.now() - topEventsCache.at < CACHE_MS) return topEventsCache.report;
  const q = buildEventRequests();
  const [[top, sources, referrers], [actions, audience, cities]] = await Promise.all([
    batchReports(token, [q.top, q.sources, q.referrers]),
    batchReports(token, [q.actions, q.audience, q.cities]),
  ]);
  const raw = { top, sources, referrers, actions, audience, cities };
  // Titles only for the ranked slugs, so at most one or two Firestore queries.
  const ranked = buildTopEvents(raw);
  const titles = await eventTitles(ranked.events.map((e) => e.slug));
  const report = buildTopEvents(raw, titles);
  topEventsCache = { at: Date.now(), report };
  return report;
}

export const adminAnalyticsReport = onCall(
  { region: 'europe-west3', cors: ALLOWED_ORIGINS, ...appCheckOptions() },
  async (request): Promise<AnalyticsResponse> => {
    logMissingAppCheck('adminAnalyticsReport', request);
    await assertAdmin(request.auth?.uid);
    const days = parseRange((request.data as { days?: unknown } | undefined)?.days);

    try {
      const token = await auth.getAccessToken();
      if (!token) throw new Error('No access token');

      // The event block is optional: if only it fails, the rest still shows.
      const topEventsPromise = loadTopEvents(token).catch((err) => {
        logger.error('adminAnalyticsReport top events failed', { err: (err as Error)?.message });
        return null;
      });

      const hit = cache.get(days);
      let report: AnalyticsReport;
      if (hit && Date.now() - hit.at < CACHE_MS) {
        report = hit.report;
      } else {
        const q = buildRequests(days);
        const [totals, daily, pages, channels, devices, actions] = await Promise.all([
          runReport(token, q.totals),
          runReport(token, q.daily),
          runReport(token, q.pages),
          runReport(token, q.channels),
          runReport(token, q.devices),
          runReport(token, q.actions),
        ]);
        report = buildReport({ totals, daily, pages, channels, devices, actions }, days);
        cache.set(days, { at: Date.now(), report });
      }
      return { ...report, topEvents: await topEventsPromise };
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
