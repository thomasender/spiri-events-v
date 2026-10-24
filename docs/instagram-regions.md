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
- `isInstagramRegion(event, regionIds = INSTAGRAM_REGION_IDS)`: the carousel and
  stories keep the default (Vorarlberg only); the feed path passes the region of the
  account in use via `PublishDeps.instagramRegionIds`.
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
- **Carousel and stories stay Vorarlberg-only** (`CAROUSEL_BEZIRKE` is Vorarlberg's
  Bezirk list; `TODO(regions)` in the code). `carouselPostId` / `storyPostId` already
  take an optional `regionId` that is added to the id for non-Vorarlberg regions only,
  so ids cannot collide once they are generalised.

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
