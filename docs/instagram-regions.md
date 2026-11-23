# Instagram per region (backend and manual onboarding)

**Read this when** you touch the Instagram backend for other regions
(`instagramRegionAccounts.ts`, `instagramRegionStore.ts`, token refresh, backfill) or
when Thomas connects a new regional Instagram account. Linked from `AGENTS.md`.
The display-only part (`regions/{id}.instagramHandle`) is in [regions.md](./regions.md).

## Design

- One Meta app for all accounts. Every further channel is wired **manually by Thomas**.
  There is no connect/OAuth UI, no client-writable credential and nothing for Peter in
  Verwaltung.
- **Vorarlberg is unchanged:** secrets `IG_ACCESS_TOKEN` / `IG_USER_ID`, token doc
  `instagram_private/token`, carousel, stories, all post ids. It always counts as
  "has an account".
- **Other regions:** server-only doc `instagram_private/region_{regionId}` (Admin SDK
  only, `firestore.rules` denies every client):

  | field                                                     | meaning                                                |
  | --------------------------------------------------------- | ------------------------------------------------------ |
  | `userId`, `accessToken`                                   | Instagram user id and long-lived token                 |
  | `expiresAt`, `refreshedAt`                                | token validity (60 days) and last refresh              |
  | `enabled`                                                 | per-region switch; missing or false = region is silent |
  | `tokenExpiresAt`, `tokenRefreshedAt`, `tokenRefreshError` | status written by the weekly refresh job               |

- The global kill switch `app_settings/instagram.enabled` applies to **all** regions
  (feed, backfill, carousel, stories).
- **Feed post on approval** (`onEventApprovedPostToInstagram`): region =
  `resolveRegionId(event)`. Vorarlberg: legacy path. Other region: needs consent, then
  a usable account (doc exists, `enabled`, token not expired). Otherwise it skips
  quietly **without** an `instagram_posts` doc (consent stays on the event, a later
  approval can still post). A failing lookup counts as "no account".
- `isInstagramRegion(event, regionIds = INSTAGRAM_REGION_IDS)`: the feed path passes the
  region of the account in use via `PublishDeps.instagramRegionIds`; carousel and stories
  pass the region they run for.
- **Token refresh** (`refreshInstagramTokenJob`, Monday 04:00): Vorarlberg as before,
  then every `instagram_private/region_*` doc with the same thresholds (refresh below 30
  days, warn below 14). Mails carry the region id; a failing region never blocks the
  others. An expired token cannot be refreshed any more: enabled regions get a mail,
  Thomas re-runs the script.
- **Backfill** when an account becomes enabled (`onInstagramRegionAccountEnabled`, one
  batch of 10) or via the admin callable `adminBackfillInstagramRegion({regionId, limit?})`
  (Admin role, like the other Instagram callables, max 25 per call, call again until
  `remaining` is 0). Selects approved + `instagramConsent` + `regionId`, not in the past
  (Vienna), without a `feed_{eventId}` post doc; soonest first, serial with 10 s pause,
  through `publishApprovedEvent` (dedupe via `create()`, so reruns and parallel runs
  never double-post).
- `adminRetryInstagramPost` picks the account by the event's region.
- **Domains and links** follow the country of the post's region (`siteDomainForRegion`:
  AT `www.deintribe.at`, DE `www.deintribe.de`, CH `www.deintribe.ch`, others AT). The
  first comment links `https://<domain>/event/<slug>` (`eventPageUrl(slug, regionId)`; no
  region in event URLs). Vorarlberg links moved from `www.thetribe.at` to
  `www.deintribe.at` on purpose. Images and captions show the plain domain.
- **Weekly carousel and daily stories per region**
  (`instagram/instagramRegionConfig.ts`). Switched on for the regions in
  `INSTAGRAM_SCHEDULED_REGION_IDS`: `vorarlberg` and `bodensee`.
  - Bezirke: Vorarlberg keeps `CAROUSEL_BEZIRKE` (incl. `Grenznahe`); other regions use
    their register list (`regionData.ts`), e.g. Bodensee `Landkreis Konstanz`,
    `Bodenseekreis`, `Landkreis Lindau (Bodensee)`. One carousel per Bezirk, same
    grouping and splitting (max 9 events, by days / day parts) as Vorarlberg.
  - An event counts for a region only when `resolveRegionId(event)` **and** its Bezirk
    match, so Vorarlberg and Bodensee events never mix.
  - Post ids: non-Vorarlberg ids carry the region (`carousel_bodensee_landkreiskonstanz_2026-11-30`,
    `story_bodensee_bodenseekreis_2026-11-24`); their records also carry `regionId`
    (the admin retry picks the account from it). Vorarlberg ids and records are unchanged
    (no `regionId` field).
  - Same layouts for every region (cover, slides, stories). Only the Bezirk wording
    ("im Landkreis Konstanz", "im Bodenseekreis", "im Landkreis Lindau"), the place
    hashtag (`#konstanz`, `#bodenseekreis`, `#lindau`) and the shown domain
    (`siteDomainForRegion`: `www.deintribe.de` for Germany) differ. The images contain no
    region name or handle.
  - Schedules unchanged (`instagramWeeklyCarousel` Sunday 10:00, `instagramMorningStories`
    05:00, Europe/Vienna = same wall clock as Berlin). Inside, after the kill switch,
    the regions run one after the other (Vorarlberg first) with
    `resolveCredentialsForRegion`. No usable account (doc missing, `enabled` false,
    token expired) = region skipped quietly, no post docs. A crashing region is logged
    and the next one still runs. Approved events are read once per run.
  - Admin callables `adminPreviewWeeklyCarousels`, `adminPostWeeklyCarousels` and
    `adminPostDailyStory` take an optional `regionId` (default `vorarlberg`, must be one
    of the switched-on regions); `bezirk` of the story callable must belong to that
    region. The admin tab sends no `regionId` yet, so it still shows Vorarlberg.
  - Another region: add its id to `INSTAGRAM_SCHEDULED_REGION_IDS` and check its Bezirk
    wording in the config (tests in `tests/lib/instagramCarousel.spec.ts`).

## Launch drip (backlog over several days)

Instead of the one-batch backfill on switching a region on, a region can get a **launch
plan**: its backlog is posted evenly over the posting windows of a few days
(`instagram/instagramRegionLaunch.ts`, schedule `instagramRegionLaunchDrip` every 30 min).

- **Plan fields** on `instagram_private/region_{id}`: `launchStartAt` (Timestamp),
  `launchDays` (default 3, max 14), `launchWindowStart` / `launchWindowEnd` (default
  `08:00` / `20:00`), `launchTimezone` (default: the region's timezone). Day 1 starts at
  `launchStartAt` (not at the window start); the other days use the full window.
  Bodensee: 25.11. 12:00-20:00, 26.11. and 27.11. 08:00-20:00 (Europe/Berlin).
- **Progress fields** (written by the drip only): `launchStartedAt`, `launchEventIds`
  (backlog frozen at the first run after the start), `launchTotal`, `launchCursor`,
  `launchPosted` (slots used), `launchRemaining`, `launchFinishedAt`, `launchLeaseUntil`
  (one run at a time).
- **Before `launchStartAt` the region posts nothing at all** (`isAccountUsable`): no feed
  post on approval, no backfill, carousel, stories or admin retry. Such events stay
  approved with consent and without post doc.
- **Backlog** = approved + `instagramConsent` + `regionId` + not past + no `feed_{id}` doc +
  approved before `launchStartAt` (`approvedAt`; events without it count), soonest first.
  Events approved from `launchStartAt` on post at once through the approval trigger and
  are never part of the drip.
- **Each run** posts only up to the cumulative target of the elapsed window time
  (`launchTarget`), serial with 10 s pause, through `publishApprovedEvent` (dedupe via
  `create()`). A missed run is caught up by the next; a second run posts nothing extra. A
  slot is reserved before posting and given back when nothing was posted, so the target is
  never exceeded, even after a crash. Events that became past, were withdrawn or got
  posted meanwhile use no slot. A failed post uses its slot (admin mail as usual) and the
  rest continue.
- **Kill switch** off: the run does nothing (no backlog, no slot, no post doc); later runs
  catch up within the windows.
- **After the last window** nothing is forced out: the rest is logged and stored as
  `launchRemaining`. Post it by hand with `adminBackfillInstagramRegion` if wanted.
- With a plan set, switching the account on (`enabled` false -> true) starts **no**
  automatic backfill. Regions without a plan behave as before.

```bash
# Set the plan BEFORE --enable (otherwise the normal backfill already ran):
node scripts/instagram-region-launch.mjs bodensee --set --start 2026-11-25T12:00+01:00 \
  --days 3 --window 08:00-20:00 --tz Europe/Berlin --dry-run
node scripts/instagram-region-launch.mjs bodensee --show     # plan + progress, no token
node scripts/instagram-region-launch.mjs bodensee --clear    # remove plan and progress
```

`--set` refuses a plan that has already started (`--clear` first). The start needs an
explicit offset (`+01:00` / `Z`).

## Onboarding a new regional account (Thomas)

1. In the Meta app: while it is in Development mode, add the Instagram account as
   tester / give it a role (Instagram Business or Creator account). In Live mode it
   works as usual.
2. Generate a long-lived Instagram User token for that account (Instagram API with
   Instagram Login, as for Vorarlberg).
3. Store it (token via env or stdin, never as an argument; uses
   `scripts/service-account.json`):
   ```bash
   IG_TOKEN='<token>' node scripts/instagram-set-region-account.mjs tirol
   # optional: --user-id <id> (must match the token), --dry-run
   ```
   The script validates the token with `GET /me?fields=user_id,username`, writes
   `userId`, `accessToken`, `expiresAt` (now + 60 days) and `refreshedAt`, and never
   prints the token. A new doc starts **disabled**.
4. In Verwaltung -> "Regionen" -> Über uns of the region, set the Instagram name
   (`instagramHandle`, display only).
5. Switch the region on: `... instagram-set-region-account.mjs tirol --enable` (or set
   `enabled: true` in the Firebase console). This starts the backfill of already
   approved, consented, upcoming events. Make sure `app_settings/instagram.enabled` is on.
   Check with `node scripts/instagram-admin.mjs status` and the `instagram_posts` list.
6. To pause a region: `--disable`. Re-running the script with a new token keeps the
   current `enabled` value and does not trigger a backfill.

## Deploy (manual)

Staging CI deploys rules and indexes on push, **functions stay manual** (the CI service
account lacks ActAs): `firebase deploy --only functions:onEventApprovedPostToInstagram,functions:refreshInstagramTokenJob,functions:onInstagramRegionAccountEnabled,functions:adminRetryInstagramPost,functions:adminBackfillInstagramRegion`.
The new Firestore trigger and callable are created on first deploy.

Carousel, stories and the launch drip (above) are also deployed by hand. The launch gate
lives in `isAccountUsable`, so every function that resolves regional credentials has to be
deployed with it:
`firebase deploy --only functions:instagramRegionLaunchDrip,functions:onEventApprovedPostToInstagram,functions:onInstagramRegionAccountEnabled,functions:adminBackfillInstagramRegion,functions:instagramWeeklyCarousel,functions:instagramMorningStories,functions:adminRetryInstagramPost,functions:adminPreviewWeeklyCarousels,functions:adminPostWeeklyCarousels,functions:adminPostDailyStory`.
`instagramRegionLaunchDrip` is a new scheduled function (created on first deploy).
