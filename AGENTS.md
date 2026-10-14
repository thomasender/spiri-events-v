# Development Setup

## Firebase Emulators

This project uses Firebase Local Emulators with a production data dump.

**Emulator Ports:**

- Auth: `localhost:9199`
- Firestore: `localhost:8181`
- Emulator UI: `localhost:4040`

**Data:** Production dump imported from `./data-export/` on emulator startup.

**To start emulators:**

```bash
firebase emulators:start --import ./data-export
```

## Environment Variables

Set `VITE_USE_EMULATORS=true` to connect the app to local emulators instead of production.

**Important:** The Playwright test runner's webServer must also have this env var. It's configured in `playwright.config.ts`:

```json
webServer: {
  command: 'VITE_USE_EMULATORS=true npm run dev -- --port 5180',
  url: 'http://localhost:5180',
  ...
}
```

The dev server / Playwright baseURL is `http://localhost:5180` (chosen to avoid conflicting with other Vite projects on the default port 5173).

## Playwright Tests

See **Testing** below for which suite to run when. Quick reference:

```bash
npm run emulators:check      # ~3s: are the emulators usable?
npm run test:e2e:smoke       # critical flows, Chromium (runs on push)
npm run test:e2e:full        # everything, Chromium (manual / pre-release)
npm run test:e2e:mobile      # @mobile specs on WebKit @ 390px
```

**Always use emulators + seeded test data for local development and testing.**
Do NOT test against production.

### ⚠️ If integration tests fail with widespread, unrelated-looking errors

The Firestore emulator is a long-running JVM process and under sustained load
it degrades: CPU pegs at 300–900%, memory balloons, requests hang. Dozens of
unrelated tests then fail with "element not found" for content that is always
present.

You normally never have to deal with this by hand any more:

- `npm run emulators:ensure` (run automatically before every `test:e2e:*`
  command and by the pre-push hook) starts the emulators if they are down and
  **restarts them if they are degraded or have grown past 2.5 GB RSS**
  (`EMULATOR_MAX_RSS_MB` overrides). The emulator leaks memory across runs — it
  passed 9 GB after a handful of full-suite runs, and the same suite went from
  ~1.5 min to ~5 min with timing-related failures. A restart costs ~13 s.
- `npm run emulators:check` only _diagnoses_ (probes Auth and a real Firestore
  query). `npm run emulators:restart` forces a restart.

Do **not** debug or rewrite tests based on a run where the emulator was
degraded. Restart, re-run, and only chase a failure that reproduces against a
fresh emulator.

`firebase-tools` hardcodes the Firestore JVM to debug-level logging and writes
`firestore-debug.log` into the working directory regardless of
`--log-verbosity` (it reached 2.6 GB in one session). `scripts/start-emulators.sh`
symlinks the `*-debug.log` files to `/dev/null`; do not start the emulators any
other way if you care about speed. The quiet logs go to
`$TMPDIR/spiri-events-emulators/`.

## Testing

Read this before writing a single test. The suite used to grow by one Playwright
file per ticket; that made a push take hours, so everyone started using
`--no-verify` and the tests stopped protecting anything. The rules below exist to
keep that from happening again.

### The three tiers

| Command                   | What runs                                                         | When                                                                         | Budget                    |
| ------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------- |
| `npm run test`            | Vitest, all component/unit tests                                  | every commit (pre-commit hook)                                               | ~8 s (incl. lint + types) |
| `npm run test:e2e:smoke`  | Playwright, `@smoke`-tagged flows, Chromium only                  | every push (pre-push hook)                                                   | ~20 s on a fresh emulator |
| `npm run test:e2e:full`   | Playwright, everything, Chromium                                  | manually, before a release                                                   | ~4–5 min                  |
| `npm run test:e2e:mobile` | Playwright, `@mobile`-tagged specs, WebKit @ 390px                | manually, for iOS Safari issues                                              | short                     |
| `npm run test:rules`      | Vitest + `@firebase/rules-unit-testing` against `firestore.rules` | manually, when touching `firestore.rules`; not part of the commit/push hooks | ~8 s incl. emulator start |

`test:rules` starts its own throwaway Firestore emulator (`firebase.rules-test.json`,
port 8782, project `demo-rules`), so it does not collide with the dev emulator on 8181. Specs live in `tests/rules/*.rules.spec.ts` and run through
`vitest.rules.config.ts`; the normal `npm run test` does not pick them up and needs
no emulator. Add new rules cases to the existing spec files there.

### The emulator is the bottleneck, not the browsers

There is one Firestore emulator and it is a JVM process that does not cope with
unbounded parallelism. Left at Playwright's default worker count it goes into a
GC death spiral part-way through a long run: CPU pegs near 900%, a
one-document query goes from ~10ms to over a second, and dozens of unrelated
tests fail with "element not found".

Two consequences:

- `playwright.config.ts` caps `workers` at 4 on purpose. Raising it makes the
  suite slower and flakier, not faster.
- **Start the full suite against a freshly restarted emulator.** A long work
  session degrades it gradually. `npm run emulators:restart` does it in one
  step, and `npm run emulators:check` tells you whether you need to.

### Shared state and the `destructive` project

The integration specs share one emulator, one seeded `events` collection and one
`categories` registry. Most specs only read that state, so they run in parallel.
A few rewrite it wholesale, or contend with each other over it:

- `admin-categories-tab.spec.ts` rewrites the shared `categories` registry —
  it briefly renames and deletes seed categories, which the wizard's category
  picker and the calendar's filter chips read
- `profile.spec.ts` clears the Storage bucket
- `admin-trash-tab.spec.ts`, `recurring-event-deletion-edit-form.spec.ts` and
  `recurring-event-list-link-no-occurrence.spec.ts` all own the trash: the first
  resets every trashed event in its `beforeEach`, the other two put events into
  the trash and read them back
- `admin-theme-tab.spec.ts` and `admin-theme-editor.spec.ts` publish to the
  global `theme` document, which every page renders its CSS variables from
- `admin-drafts-tab.spec.ts`, `admin-drafts-tab-navigation.spec.ts` and
  `duplicate-published-event.spec.ts` write draft state that
  `scripts/reset-draft-fixtures.mjs` — run by nine other specs — deletes by
  title, "(Kopie)" suffixes included

Those run in the separate `destructive` Playwright project, invoked as a second
Playwright run after the parallel one finishes, **with `--workers=1`** — they
conflict with each other, not only with the parallel suite.

A pattern worth knowing before you write the next fixture reset: the app mounts
`SeedBootstrap` on every page load, which calls `seedCategoriesIfEmpty()` and
`seedThemeIfMissing()`. A reset that _empties_ one of those collections opens a
window where the app seeds it back, racing your test. Reconcile to the desired
state instead of wipe-then-reseed, and write the set in one commit so no reader
sees it half-populated. That alone turned admin-categories-tab from "two or
three shifting failures per run, 45s" into twelve green in 15s.

If you write a spec that wipes a whole collection, add it to
`DESTRUCTIVE_SPECS` in `playwright.config.ts`. Better: don't — create your own
uniquely-named fixtures and delete only those.

Those numbers assume a freshly started emulator. After a long work session the
same smoke run takes 3–4 minutes, because the Firestore emulator degrades (see
below). `npm run emulators:check` tells you in ~3 s whether that has happened.
The pre-push hook runs it first, so a dead emulator fails immediately with
instructions instead of after 30 s of silence.

### Region fixtures (second test region)

For everything region related (filters, switcher, overall view) there is a
second region next to Vorarlberg, emulator only. Source of truth:
`scripts/seed-region-fixtures.mjs`.

- **Regions** `regions/vorarlberg` (active), `regions/tirol` (active, Bezirke
  Innsbruck, Kufstein, Imst, Lienz) and `regions/wien` (inactive, for visibility
  tests). `tests/globalSetup.ts` reconciles them on every Playwright run with
  `set(..., { merge: true })` in one batch.
- **Events** are _not_ loaded by globalSetup, so no existing count/order
  assertion sees them (all titles start with `[Region-Test]`): Yoga Innsbruck,
  Meditation Kufstein, Online Atemreise Tirol (`isOnline`, `regionId: 'tirol'`)
  and Yoga Dornbirn (explicit `regionId: 'vorarlberg'`). Ids are in `REGION_EVENT_IDS`
  (`tests/helpers/regionFixtures.ts`). A dedicated spec loads them with
  `loadRegionEventFixtures()` in `beforeAll`, or by hand:
  `node scripts/seed-region-fixtures.mjs --events`. Once the calendar filters by
  region (ticket 11) they can move into globalSetup. The existing seed events
  have no `regionId` and fall back to Vorarlberg.
- **Account** `tirol-mod@test.local` / `testpassword123` is a Regions-Moderator:in
  for Tirol: no token claim, `admin_users/{uid}` =
  `{ role: 'RegionModerator', regionIds: ['tirol'] }` (reconciled by
  `seed-region-fixtures.mjs`). Playwright
  session: `STORAGE_STATE.regionModerator`. Scripts that need "the" admin filter
  `admin_users` by `role == 'Admin'`; never use a bare `admin_users.limit(1)`.

### Roles (Super-Admin, Regions-Moderator:in)

- **Super-Admin** = `admin_users/{uid}.role == 'Admin'` (or token claim
  `role: 'Admin'`), unchanged. **Regions-Moderator:in** = `role: 'RegionModerator'`
  with `regionIds` (1–10 regions: the nine Bundesländer plus the Allgäu). The rules give moderators a narrow extra
  right via `isRegionModeratorFor()` (review actions, messages and trash of their
  regions' events, hiding directory listings that lie only in their regions);
  `isAdminOrEmulatorAdmin()` is untouched, so every other admin-only rule stays
  Super-Admin only. Matrix: `tests/rules/instagram.rules.spec.ts` ("region moderators").
- `admin_users` is written only via the Admin SDK: callables
  `adminSetRegionModerator` / `adminListRegionModerators` (Super-Admin only,
  audit entries in `admin_audit_log`) or
  `node scripts/promote-admin.mjs <email> --role RegionModerator --regions tirol,steiermark`
  (`--emulator` for the local emulators).
- Admin mails (feedback, Instagram alerts) go to Super-Admins only. Submission
  mails are region-aware (and currently switched off), see "Admin event emails
  and regions" below.
- **Client:** `useAuth()` exposes `role` and `staffRegionIds` (own `admin_users` doc);
  `getStaffAccess(role, regionIds)` / `useStaffRole()` give `isSuperAdmin`,
  `isRegionModerator`, `moderatorRegionIds`, `canModerateRegion(id)`. Admin tabs per
  role: `allowedAdminTabs()` in `src/utils/staffRoles.js`; a tab outside the list shows
  "Kein Zugriff" (`NoAccess`) also by URL, `/admin/theme-editor` is Super-Admin only
  (`SuperAdminRoute`). Moderator event lists must filter by region
  (`staffEventQuerySpecs` in `src/lib/staffEventQueries.js`), or the rules reject the
  query. The "Moderation" tab (Super-Admins) manages moderators via the callables.

### Admin event emails and regions

- **Switched off:** `ADMIN_EVENT_EMAILS_ENABLED = false` in
  `functions/src/notifications.ts` (Trello 8ioEr9T1, saves Mailgun quota). While
  it is false the "new event submitted" mail to staff is not sent at all: no
  Firestore/Auth reads, no Mailgun call (guarded by
  `tests/lib/adminEventRouting.spec.ts`). Keep it false unless the product owners
  decide otherwise; re-enabling = set it to `true` and deploy the functions.
- **Not affected by the flag:** mails to organizers (published, change request,
  back to draft, deleted) and the feedback/contact mail (Super-Admins only) keep
  working.
- **Routing once re-enabled** (`functions/src/adminEventRouting.ts`, pure, wired
  up in `notifications.ts`): for an event of region R the recipients are the
  Super-Admins and the shared `SUBMITTED_NOTIFICATION_INBOX` (as before), the
  Regions-Moderator:innen whose `regionIds` contain R (email from Auth; disabled
  or email-less accounts are skipped) and `regions/{R}.contactEmail` if set.
  Deduplicated case-insensitively; no `regionId` = Vorarlberg; online events go
  by their `regionId`; moderators never get mail about other regions. If
  moderators or regions cannot be read, the mail still goes to the Super-Admins.
  Unsubscribe (`notifyOnSubmitted`) applies to everyone with an account.
- **Dark launch:** the region name appears in subject and body only while more
  than one region is active (`regions/*.active`); with one active region the mail
  is byte-identical to the old one.
- **Owner mails** (published, changes requested, back to draft, deleted) get the line
  "Rückfragen zu dieser Region: <contactEmail>" from `regions/{regionId}.contactEmail`,
  also only while more than one region is active and the address is valid
  (`resolveOwnerRegionContact`); otherwise byte-identical (pinned in
  `tests/lib/emailTemplates.spec.ts`).

### Which tool for which problem

| The question the test answers                                                                   | Tool                        |
| ----------------------------------------------------------------------------------------------- | --------------------------- |
| Does this function return the right thing? (dates, parsing, permissions)                        | Vitest, `tests/components/` |
| Does this component show / hide / validate / call X when the user does Y?                       | Vitest + Testing Library    |
| Does the data really end up in Firestore / Storage, or does auth/rules let the right person in? | Playwright                  |
| Does it span several pages, a reload, or a real browser API?                                    | Playwright                  |
| Does it look right? (spacing, colour, alignment)                                                | **Nothing** — look at it    |

Rule of thumb: if you can write the assertion without a running emulator, it is
a Vitest test. Playwright proves the _integration_; Vitest proves the _logic_.
Never test the same behaviour at both tiers.

### Vitest hygiene (enforced by `vitest.config.ts` / `tests/vitest.setup.ts`)

- **No real network.** `fetch` is stubbed to reject in every test. Stub the
  response you need with `vi.stubGlobal('fetch', ...)`.
- **Mocks and globals are restored after each test** (`restoreMocks`,
  `unstubGlobals`, `unstubEnvs`; `navigator`/`window` overrides are snapshotted
  and restored). Tests must not rely on running before or after another test.
  `vi.fn().mockReturnValue(...)` is _not_ reset by `clearAllMocks` — reset it
  yourself in `afterEach` if you configure it per test.
- **Run `npm run test:shuffle` after writing a test.** It runs in random order
  and flushes out order dependence (that is how the PWA and prerender tests
  turned out to be flaky).
- Use `vi.useFakeTimers()` for timers; never `setTimeout`-wait in a test.
- Don't mock the unit under test (a hand-written fake of a sanitiser proves
  nothing about the sanitiser).

### Default: do NOT write a new E2E test

Writing a Playwright test is the expensive choice. It costs a browser, a dev
server, an emulator round trip and a login, on every push, forever. Before
reaching for one, work down this list:

1. **Is it pure logic?** (dates, recurrence, formatting, slugs, permissions,
   validation, sanitising, localStorage shape) -> a Vitest test in
   `tests/components/`. This is almost always the right answer.
2. **Is it component behaviour?** (a dialog opens, a badge counts, a field is
   disabled) -> a Vitest + Testing Library test in `tests/components/`.
3. **Does it only reproduce in a real browser against real Firebase?** (multi-page
   navigation, auth session behaviour, Firestore writes and their effects,
   cross-tab behaviour) -> only then a Playwright test.

For a bugfix, the regression test belongs at the lowest tier that can actually
fail before the fix. A bug in date maths gets a unit test, not a browser.

### If you do write a Playwright test

- **Put it in an existing spec file.** Find the thematic file that covers the
  area and add to it. Do not create a new file per ticket.
- **No ticket IDs in `describe` or `test` titles.** Name the behaviour, not the
  ticket.
- **At most one new `test()` block per ticket.** A new spec file needs explicit
  approval from the user.
- **Use the storageState fixtures, never a UI login.** `tests/auth.setup.ts`
  signs in once per role; specs get the session via
  `test.use({ storageState: STORAGE_STATE.admin })` (see `tests/helpers/roles.ts`).
- **Tag it `@smoke` only if it is a critical user flow**, and tag the _single
  test_ — `test('title', { tag: '@smoke' }, async ...)` — never a whole
  `describe`. The smoke set is one test per critical flow (create → review →
  publish, drafts stay private, auth gating, profile save, trash/restore, …),
  currently ~25 tests. It is a budget, not a collection: when you add one,
  consider which one it replaces.
- **Shared fixtures are shared.** If your spec mutates a fixture another spec
  also reads (`test-event-with-messages`, the trash, categories, theme), either
  create your own uniquely-named fixture or add the spec to `DESTRUCTIVE_SPECS`.
  A spec that passes alone and fails in the full run is almost always this.
- **Selectors:** `getByRole` / `getByTestId`, scoped to the region you mean
  (`page.locator('.calendar-header').getByRole(...)`). A strict-mode violation
  means the selector is too broad, not that the test is flaky.
- **Dates:** derive them from `new Date()`. A hard-coded month silently becomes
  "the past" and the app clamps it.
- **Waiting for a write:** if a test leaves a page and then checks the effect of
  an async write the page made, use `expect(async () => {...}).toPass()` — don't
  race it with one `goto`.

### Never test these

These produce tests that are slow, brittle, and prove nothing about behaviour.
They were the bulk of what had to be deleted:

- CSS classes, `getComputedStyle`, colour values, contrast ratios
- Pixel measurements, `boundingBox()`, viewport overflow, element ordering
- SVG attributes, icon presence
- Static text content of legal/marketing copy
- "the mocked function was called" without an observable effect
- `page.waitForTimeout()` — **banned**. Use web-first assertions
  (`await expect(locator).toBeVisible()`) or `expect.poll()`. Playwright actions
  already wait for actionability; a sleep is either redundant or hiding a
  missing assertion.

### Before you commit

`npm run test` and `npm run types` run automatically on commit; the `@smoke`
suite runs automatically on push. You do not need to run the full E2E suite for
an ordinary change — and if you find yourself wanting `--no-verify`, that is a
bug in this setup worth reporting, not a workaround to normalise.

**Exception — doc-only commits may push with `--no-verify`.** Changes that touch
only files under `docs/` (or other pure-prose markdown like this file itself)
cannot regress tests or production behaviour, so the pre-push smoke suite adds
no signal. For these, `git push --no-verify` is fine. Any commit that touches
`src/`, `functions/`, `tests/`, `firestore.rules`, `firebase.json`, or any
other executable code or config still goes through the hooks normally.

## Analytics (GA4) check against production

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

### Admin tab "Statistik"

The admin tab reads GA through the callable `adminAnalyticsReport`
(`functions/src/adminAnalytics.ts`, pure logic in `analyticsReport.ts`). It runs as the
functions' default service account `54424804895-compute@developer.gserviceaccount.com`,
which must be a **Betrachter** of the GA property (Verwalten → Zugriffsverwaltung für
Property). Without that the tab shows "Kein Zugriff auf Google Analytics". Standard GA
reports lag 24–48 h, so fresh data shows up in the tab a day late (use the GA realtime
view or `npm run analytics:realtime` for live checks). Results are cached 10 minutes per
range in the function instance.

## App Check (reCAPTCHA)

Firebase App Check lets Firestore, Storage and the callable Cloud Functions tell
requests from the real website apart from scripts. It is rolled out in steps
(see the Trello column "App Check (reCAPTCHA)"): code first and inert, then an
observation phase, then enforcement one product at a time in the Firebase
console.

- **Client:** `src/lib/appCheck.js`, called from `src/lib/firebase.js`. Active
  only with `VITE_RECAPTCHA_SITE_KEY` set, never with `VITE_USE_EMULATORS=true`,
  never in plain dev builds. Emulators and all tests are not checked.
  `VITE_RECAPTCHA_PROVIDER` is `enterprise` (default) or `v3`.
- **Site key in production:** the GitHub _variable_ `VITE_RECAPTCHA_SITE_KEY`
  (and optionally `VITE_RECAPTCHA_PROVIDER`), read by `deploy.yml` when it builds.
  It is public, not a secret. Empty variable = App Check off.
- **Local development against production:** put a debug token (Firebase console →
  App Check → Manage debug tokens) in `.env.local` as `VITE_APPCHECK_DEBUG_TOKEN`
  together with the site key. Never commit it.
- **Callable functions:** `functions/src/appCheck.ts`. Every browser-facing
  `onCall` spreads `...appCheckOptions()` into its options and calls
  `logMissingAppCheck(name, request)` first. Requests without a token are logged
  as "callable without app check". `ENFORCE_APP_CHECK` is `false`; setting it to
  `true` and deploying makes all of them reject requests without a valid token.
- **Never enforce** `mollieWebhook` (called by Mollie) or `calendarFeed`
  (token-protected iCalendar feed fetched by calendar apps, see below). `tests/lib/appCheck.spec.ts` guards this and
  fails if a new `onCall` forgets the helpers.
- **If the CSP changes:** reCAPTCHA needs `https://www.google.com/recaptcha/` and
  `https://www.gstatic.com/recaptcha/` in `script-src` and
  `https://www.google.com/recaptcha/` plus `https://recaptcha.google.com/recaptcha/`
  in `frame-src` (`firebase.json`, guarded by `tests/lib/hostingCsp.spec.ts`).
- **Users whose browser blocks reCAPTCHA** get a one-time banner
  (`AppCheckBanner`), triggered only by App Check's own token failure.
- **Rollback:** Firebase console → App Check → APIs → the product → "Not enforced"
  (takes effect in about 15 minutes). For functions, set `ENFORCE_APP_CHECK` back
  to `false` and deploy.

## Kalender-Export (.ics download and subscription)

Only for signed-in users, like Favoriten (no verified e-mail needed). Calendar
apps cannot send a Firebase login or App Check token, so every calendar URL
carries the user's personal secret: `?token=` on `/calendar/feed.ics` and
`/calendar/event/<slug>.ics`.

- **Token:** `calendarFeedTokens/{uid}` = `{ token, createdAt }`, 32 random bytes
  base64url. Server-only collection (`firestore.rules` denies every client
  access). Issued by the callable `getCalendarFeedToken`
  (`functions/src/calendarFeedToken.ts`): `{}` returns/creates it,
  `{ regenerate: true }` replaces it ("Neuen Link erzeugen" in the calendar),
  `{ revoke: true }` deletes it (called by account deletion in `useAuth`).
- **Check:** `calendarFeed` validates the format first (`calendarRoutes.ts`),
  then looks the token up (5 min in-memory cache) and also refuses tokens of
  deleted or disabled accounts. Missing/unknown token: `401`, `no-store`.
- **Caching:** valid responses stay `public, s-maxage=3600`; the Hosting CDN
  keys on the full URL including the token. A revoked token can therefore
  still be served from the CDN for about an hour.
- **Revoke by hand:** delete `calendarFeedTokens/{uid}` in the Firestore console
  (the user gets a new token the next time they open the export).
- The frontend asks for the token only when the user opens "im eigenen Kalender
  speichern" or clicks "Zum Kalender hinzufügen" (`useCalendarFeedToken`).

## Prerender (Open Graph / Social Media Preview)

`npm run build` runs `vite build && node scripts/prerender.mjs`. The prerender
generates one static HTML file per event under `dist/event/<slug>/index.html`
with full Open Graph + Twitter meta tags, so messengers (WhatsApp, Telegram,
Facebook, LinkedIn, Slack) and crawlers see a proper preview without running
any JavaScript.

**Data source priority:**

1. `data-export/firestore-export/events.json` (committed to the repo — the
   deterministic offline base).
2. Live Firestore Admin SDK — bypasses security rules using a service
   account, so it can list all events including the freshly created ones
   that aren't in the snapshot yet. Only runs when a service account is
   available (see "GitHub Actions + Firebase setup" below).
3. Firestore REST API (anonymous read — usually blocked on production).
4. Live Firestore client SDK (anonymous — usually blocked on production).

When more than one source succeeds, the build **merges** them: events matched
by `id`/`slug` get their live field values (so a freshly changed `imageUrl`
wins immediately), and events that exist only in Firestore are appended.

### Auto-trigger on event changes (UIWI8kWx)

The `onEventWriteTriggerBuild` Cloud Function fires on every Firestore
write to `events/{eventId}`. It skips drafts and pending submissions (they
don't appear in OG previews anyway) and POSTs to the GitHub
`repository_dispatch` API for every write where the event was, is, or
becomes `status === 'approved'`. The matching GitHub Actions workflow
(`.github/workflows/deploy.yml`) then runs slug migration, `npm run build`
and the Hosting deploy, which includes the Admin SDK live read
described above, so a freshly approved event gets its own
`/event/<slug>/index.html` within one build cycle (≈3–5 min) without
anyone manually refreshing the snapshot.

Which event deploys what: `repository_dispatch` and `workflow_dispatch` only
refresh content (migrate + build + Hosting). Firestore rules/indexes and Cloud
Functions deploy only on `push` to main, and only if `firestore.rules`,
`firestore.indexes.json`, `firebase.json` or `functions/**` changed. Hosting
runs even if that backend deploy fails (the job then ends red). Manual
function deploys: use `--only functions:<name>` and merge soon, otherwise the
next push deploy aborts on the cloud-only function.

A **5-minute debounce window** is enforced via a `buildAt` timestamp on
`app_settings/last_build`: only the first event write inside the window
triggers a build, subsequent writes are coalesced into the same build.
This is safe because one build regenerates ALL event pages from the live
Firestore snapshot — so the result after the build is the same whether 1
or 50 events changed in the meantime — and it prevents the GitHub Actions
queue from stacking up during bulk-import / onboarding bursts.
Worst-case latency for a single edit is 5 min (when another build just
fired). The timestamp is only stamped on a 2xx POST, so a failed dispatch
doesn't burn the window — the next event change retries immediately.

A **6-hour safety-net scheduled rebuild** (`scheduledBuildTrigger`,
Cloud Scheduler) runs as a backstop in case the event-driven trigger is
ever lost — Cloud Function cold-start crash, secret-lookup transient
failure, debounce edge case where a POST was lost, or anything else
weird in the underlying infrastructure. Rebuilding on a 6-hour cadence
means the worst-case staleness for any event page is bounded even if the
event-driven path silently broke.

The build is idempotent — it always reads the live Firestore snapshot
(Admin SDK in the prerender) and writes the same HTML when nothing has
changed — so the only cost of an unnecessary run is a few minutes of
GitHub Actions + Firebase Hosting deploy time.

### GitHub Actions + Firebase setup

For the auto-trigger + live read to work on production, two secret sets
must be configured.

**Firebase Functions secrets** (read by the Cloud Functions at runtime):

```bash
firebase functions:secrets:set GH_DISPATCH_TOKEN   # GitHub PAT with `repo` scope
firebase functions:secrets:set GH_DISPATCH_REPO    # e.g. thomasender/spiri-events-v
```

**GitHub Actions secrets** (read by `.github/workflows/deploy.yml` at build time):

| Secret                              | Source                                                                                                                                                                                        |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FIREBASE_SERVICE_ACCOUNT_JSON_B64` | `base64 -i scripts/service-account.json` — the encoded JSON of a service account with Firebase Admin / Hosting deploy permissions on `spirieventsvbg`. The workflow decodes it at build time. |

Set them in GitHub → repo → Settings → Secrets and variables → Actions.

### Manual refresh (fallback)

If the auto-trigger or live read is broken, the OG previews can still be
refreshed manually after production events change:

```bash
firebase emulators:start --import ./data-export   # in one terminal
npm run prerender:refresh                          # in another — writes events.json
git add data-export/firestore-export/events.json
git commit -m "chore: refresh prerender event snapshot"
```

The refresh script reads from the emulator (preferred) or production
Firestore (via `scripts/service-account.json`).

## Firestore backup (before production migrations)

`scripts/export-firestore.mjs` is a read-only backup, separate from the prerender
snapshot (`data-export/firestore-export/`, which it never touches). Logic and
tests: `src/utils/firestoreBackup.js`, `tests/lib/firestoreBackup.spec.ts`.

```bash
node scripts/export-firestore.mjs                            # emulator (default) -> backups/firestore-emulator-<date>/
node scripts/export-firestore.mjs --project spirieventsvbg   # PRODUCTION, read only (ADC credentials) -> backups/firestore-<date>/
node scripts/export-firestore.mjs --verify backups/firestore-<date>   # restore check
```

- Covers every top-level collection and every subcollection found by traversal
  (events/messages, users/favorites, users/publicProfile, admin_users, regions,
  instagram_posts, ...), paged past 1000 docs. Each collection is compared with a
  server-side count; any error or mismatch means exit 1 and **no** `exportedAt`.
- `manifest.json` has `exportedAt`, per-collection counts and a SHA-256 per file.
  `migrate-region-ids.mjs --project spirieventsvbg --apply` requires a production
  manifest with `exportedAt` from today (emulator backups do not count).
- `--verify` re-reads the files and checks hashes and counts. A real restore check:
  load the typed JSON (`{stringValue: ...}`) into a throwaway emulator and compare counts.
- `backups/` is git-ignored: it contains personal data (and `instagram_private`).
  Keep it local and delete it when the migration is done.

## Communicating with Peter

Peter is the product owner and tester. He tests directly on production at https://www.thetribe.at (NOT locally).

**When updating Trello tickets or communicating with Peter:**

- **ALWAYS tag Peter with `@petermathis1`** in Trello comments. This is his Trello username and the only way he gets a notification. Plain text like "Lieber Peter", "Hallo Peter", "@Peter", or "Peter," in a comment will NOT notify him.
- Write in **German**
- Use **non-technical language** - Peter has no understanding of code
- Focus on **what works/doesn't work for users**, not implementation details
- Keep messages **short and clear**
- Example: "Das Problem ist behoben! User können jetzt ihre eigenen Events wieder ansehen."
- NEVER mention: useEffect, dependency array, hooks, queries, commits, branches, etc.
