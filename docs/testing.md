# Testing details

**Read this when** you write or change a Playwright/Vitest test, a test fixture, or debug a failing
or slow e2e run (degraded emulator, `destructive` project). Policy summary lives in AGENTS.md "Testing".

## Emulator health (widespread, unrelated e2e failures)

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
- **Waiting for a write:** the UI updates optimistically, so a card disappearing
  does not mean the server has the write. Before leaving the page wait for the
  server ack (the `ConfirmDialog` closes only after the write resolved, or
  `expect.poll` on the emulator); a `goto` drops unacknowledged writes and no
  `toPass` reload loop can bring them back. Use `toPass` only to wait for effects
  that arrive on their own (triggers, listeners).

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
