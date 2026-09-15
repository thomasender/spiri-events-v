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

| Command                   | What runs                                          | When                            | Budget                        |
| ------------------------- | -------------------------------------------------- | ------------------------------- | ----------------------------- |
| `npm run test`            | Vitest, all component/unit tests                   | every commit (pre-commit hook)  | ~5 s                          |
| `npm run test:e2e:smoke`  | Playwright, `@smoke`-tagged flows, Chromium only   | every push (pre-push hook)      | 2–3 min                       |
| `npm run test:e2e:full`   | Playwright, everything, Chromium                   | manually, before a release      | measure before you rely on it |
| `npm run test:e2e:mobile` | Playwright, `@mobile`-tagged specs, WebKit @ 390px | manually, for iOS Safari issues | short                         |

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

- `admin-categories-tab.spec.ts` wipes and re-seeds the `categories` registry
  and the `events` collection
- `profile.spec.ts` clears the Storage bucket
- `admin-trash-tab.spec.ts`, `recurring-event-deletion-edit-form.spec.ts` and
  `recurring-event-list-link-no-occurrence.spec.ts` all own the trash: the first
  resets every trashed event in its `beforeEach`, the other two put events into
  the trash and read them back

Those run in the separate `destructive` Playwright project, invoked as a second
Playwright run after the parallel one finishes, **with `--workers=1`** — they
conflict with each other, not only with the parallel suite.

If you write a spec that wipes a whole collection, add it to
`DESTRUCTIVE_SPECS` in `playwright.config.ts`. Better: don't — create your own
uniquely-named fixtures and delete only those.

`npm run emulators:check` tells you in ~3 s whether the emulators are usable.
The pre-push hook runs it first, so a dead emulator fails immediately with
instructions instead of after 30 s of silence.

### Known flaky

`tests/integration/admin-categories-tab.spec.ts` fails two or three of its
twelve tests on roughly every other run, and which ones varies. It wipes and
re-seeds the shared `categories` registry while the app's own seed bootstrap
and Firestore listener write to it too. It is deliberately out of `@smoke` so
it never blocks a push; the full suite is otherwise green. Fixing it means
giving it its own category namespace instead of rewriting the global one.

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

## Prerender (Open Graph / Social Media Preview)

`npm run build` runs `vite build && node scripts/prerender.mjs`. The prerender
generates one static HTML file per event under `dist/event/<slug>/index.html`
with full Open Graph + Twitter meta tags, so messengers (WhatsApp, Telegram,
Facebook, LinkedIn, Slack) and crawlers see a proper preview without running
any JavaScript.

**Data source priority:**

1. `data-export/firestore-export/events.json` (committed to the repo — preferred
   because it's deterministic, offline, and works on every build environment).
2. Firestore REST API (anonymous read; only works when the project's security
   rules allow it).
3. Live Firestore SDK (kept as a final fallback — requires network access from
   the build environment and Firestore read permissions).

If none of the three succeed, the prerender emits a manifest with `eventCount: 0`
and logs a clear warning. The build still succeeds; the static homepage
keeps working because `index.html` ships baked-in OG/Twitter tags.

**Refreshing the prerender data** after production events change:

```bash
firebase emulators:start --import ./data-export   # in one terminal
npm run prerender:refresh                          # in another — writes events.json
git add data-export/firestore-export/events.json
git commit -m "chore: refresh prerender event snapshot"
```

The refresh script reads from the emulator (preferred) or production Firestore
(via `scripts/service-account.json`).

## Communicating with Peter

Peter is the product owner and tester. He tests directly on production at https://events.thetribe.at (NOT locally).

**When updating Trello tickets or communicating with Peter:**

- **ALWAYS tag Peter with `@petermathis1`** in Trello comments. This is his Trello username and the only way he gets a notification. Plain text like "Lieber Peter", "Hallo Peter", "@Peter", or "Peter," in a comment will NOT notify him.
- Write in **German**
- Use **non-technical language** - Peter has no understanding of code
- Focus on **what works/doesn't work for users**, not implementation details
- Keep messages **short and clear**
- Example: "Das Problem ist behoben! User können jetzt ihre eigenen Events wieder ansehen."
- NEVER mention: useEffect, dependency array, hooks, queries, commits, branches, etc.
