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

`npm run emulators:check` detects this directly — it probes Auth _and_ a real
Firestore query, and tells you which one is dead. The pre-push hook runs it
first, so you should see a clear message rather than a wall of failures.

Fix:

```bash
pkill -f cloud-firestore-emulator
npm run emulators:start
```

Do **not** debug or rewrite tests based on a run where this is happening.
Restart the emulator, re-run, and only chase a failure that reproduces against
a freshly-restarted emulator.

Emulator debug logs are written to `$TMPDIR/spiri-events-emulators/` at QUIET
verbosity. They used to land in the repo root at debug level and reached 10 GB
within a work session, which was itself a cause of the degradation above.

## Testing

Read this before writing a single test. The suite used to grow by one Playwright
file per ticket; that made a push take hours, so everyone started using
`--no-verify` and the tests stopped protecting anything. The rules below exist to
keep that from happening again.

### The three tiers

| Command                   | What runs                                          | When                            | Budget                    |
| ------------------------- | -------------------------------------------------- | ------------------------------- | ------------------------- |
| `npm run test`            | Vitest, all component/unit tests                   | every commit (pre-commit hook)  | ~8 s (incl. lint + types) |
| `npm run test:e2e:smoke`  | Playwright, `@smoke`-tagged flows, Chromium only   | every push (pre-push hook)      | ~1:30 on a fresh emulator |
| `npm run test:e2e:full`   | Playwright, everything, Chromium                   | manually, before a release      | ~3–5 min                  |
| `npm run test:e2e:mobile` | Playwright, `@mobile`-tagged specs, WebKit @ 390px | manually, for iOS Safari issues | short                     |

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
- **No ticket IDs in `describe` titles.** Name the behaviour, not the ticket.
- **At most one new `test()` block per ticket.** A new spec file needs explicit
  approval from the user.
- **Use the storageState fixtures, never a UI login.** `tests/auth.setup.ts`
  signs in once per role; specs get the session via
  `test.use({ storageState: STORAGE_STATE.admin })` (see `tests/helpers/roles.ts`).
- **Tag it `@smoke` only if it is a critical user flow.** The smoke set is a
  budget, not a collection.

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
   available (see "Netlify setup" below).
3. Firestore REST API (anonymous read — usually blocked on production).
4. Live Firestore client SDK (anonymous — usually blocked on production).

When more than one source succeeds, the build **merges** them: events matched
by `id`/`slug` get their live field values (so a freshly changed `imageUrl`
wins immediately), and events that exist only in Firestore are appended.

### Auto-trigger on event changes (UIWI8kWx)

The `onEventWriteTriggerNetlifyBuild` Cloud Function fires on every Firestore
write to `events/{eventId}`. It skips drafts and pending submissions (they
don't appear in OG previews anyway) and POSTs a Netlify build hook for every
write where the event was, is, or becomes `status === 'approved'`. Netlify
then runs `npm run build`, which includes the Admin SDK live read described
above, so a freshly approved event gets its own `/event/<slug>/index.html`
within one build cycle (≈3–5 min) without anyone manually refreshing the
snapshot.

A **5-minute debounce window** is enforced via a `buildAt` timestamp on
`app_settings/last_netlify_build`: only the first event write inside the
window triggers a build, subsequent writes are coalesced into the same
build. This is safe because one Netlify build regenerates ALL event pages
from the live Firestore snapshot — so the result after the build is the
same whether 1 or 50 events changed in the meantime — and it prevents the
Netlify build queue from stacking up during bulk-import / onboarding
bursts. Worst-case latency for a single edit is 5 min (when another build
just fired). The timestamp is only stamped on a 2xx POST, so a failed build
doesn't burn the window — the next event change retries immediately.

A **6-hour safety-net scheduled rebuild** (`scheduledNetlifyRebuild`,
Cloud Scheduler) runs as a backstop in case the event-driven trigger is
ever lost — Cloud Function cold-start crash, secret-lookup transient
failure, debounce edge case where a POST never reached Netlify. The build
is idempotent (always reads live Firestore), so the only cost of a
no-change run is a few minutes of Netlify build time. Worst-case staleness
for any event page is bounded by this interval.

### Netlify setup

For the auto-trigger + live read to work on production, two Netlify env vars
must be set:

| Variable                        | Source                                                                                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NETLIFY_BUILD_HOOK`            | URL of a Netlify build hook created in the site's dashboard (`Site settings → Build & deploy → Build hooks → Add build hook`). The Cloud Function reads it as a Firebase Functions secret.        |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Inline JSON of `scripts/service-account.json`. The prerender reads it during the build, falls back to `GOOGLE_APPLICATION_CREDENTIALS` (file path) or `scripts/service-account.json` (local dev). |

To set the secret:

```bash
firebase functions:secrets:set NETLIFY_BUILD_HOOK   # paste the build hook URL
```

To set the build env var: Netlify dashboard → Site settings → Environment
variables → Add variable → key `FIREBASE_SERVICE_ACCOUNT_JSON`, value = the
entire contents of `scripts/service-account.json`. (Use "Same value for all
branches" — there is one production build.)

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
