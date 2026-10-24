# Analytics (GA4)

**Read this when** you touch GA tracking, `npm run analytics:*`, the admin tab "Statistik" or
`adminAnalyticsReport`. Per-region analytics: [regions.md](./regions.md) section 10.

## Check against production

`npm run analytics:verify` drives the **live** site (`--url=` to override) in a real
browser: banner, "Ablehnen" sends nothing, "Akzeptieren" sends `page_view` /
`select_content` without PII, footer "Cookie-Einstellungen" revokes, and the
event counts are cross-checked against the GA realtime report. `npm run
analytics:realtime` prints the last 30 minutes of events (`--dimension=eventName,unifiedScreenName`).

It is deliberately **not** part of `npm run test`: it hits production, counts as
real traffic in GA, takes ~1 min and needs network plus gcloud. Run it after a
GA-related deploy, not on every commit. `--no-ga` skips the GA API cross-check.

GA API access uses impersonation of the read-only service account
`ga-reader@spirieventsvbg.iam.gserviceaccount.com` (Betrachter on the GA property,
no key file). Your gcloud user needs `roles/iam.serviceAccountTokenCreator` on it.
Plain `gcloud auth application-default login` with analytics scopes is blocked by Google.
The check uses a normal browser user agent because GA drops "HeadlessChrome" traffic.

## Admin tab "Statistik"

The admin tab reads GA through the callable `adminAnalyticsReport`
(`functions/src/adminAnalytics.ts`, pure logic in `analyticsReport.ts`). It runs as the
functions' default service account `54424804895-compute@developer.gserviceaccount.com`,
which must be a **Betrachter** of the GA property (Verwalten → Zugriffsverwaltung für
Property). Without that the tab shows "Kein Zugriff auf Google Analytics". Standard GA
reports lag 24–48 h, so fresh data shows up in the tab a day late (use the GA realtime
view or `npm run analytics:realtime` for live checks). Results are cached 10 minutes per
range in the function instance.

The "Top 10 Events (letzte 14 Tage)" block (`buildEventRequests` / `buildTopEvents`) always
covers 14 days, uses two `batchRunReports` calls (6 reports) filtered to `pagePath` starting
with `/event/`, and resolves titles from Firestore by slug (GA page title as fallback). Per-event
numbers rely on every client event carrying `page_location` (origin + path, no query) and on
`page_view` carrying `page_referrer` = the previous page of the site (`src/lib/analytics.js`).
`organizer_link_click` ("Mehr Infos & Tickets") and `calendar_add` exist since 2026-10-19
(`EVENT_ACTIONS_SINCE`); older days have no data for them.
