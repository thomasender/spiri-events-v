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

Run integration tests against the local emulator setup:
```bash
npm run test:integration
```

Run everything (unit + integration):
```bash
npm run test:all
```

`npm run test` (unit/component tests via Vitest) runs on every commit via the
pre-commit hook. `npm run test:integration` runs on every push via the
pre-push hook instead — it needs the emulators + a dev server and is too slow
to run on every commit.

**Always use emulators + real data dump for local development and testing.** Do NOT test against production.

### ⚠️ If integration tests fail with widespread, unrelated-looking errors

Before assuming the test code or the app is broken, check whether the
**Firestore emulator itself has degraded**. It's a long-running JVM process
(`cloud-firestore-emulator-*.jar`) and under sustained load during a work
session it can start thrashing — CPU pegs at 300–900%, memory balloons into
the multiple-GB range, and requests start timing out or hanging. When this
happens you'll see things like: dozens of unrelated tests all failing with
"element not found" for basic seeded content (e.g. an event title that's
always present), or a plain `curl` to `http://127.0.0.1:8181` hanging
instead of returning immediately.

Check for it:
```bash
ps aux | grep cloud-firestore-emulator
```
If CPU% is very high (compare to a fresh baseline, which idles near 0%),
the emulator is degraded, not the tests. Fix: kill all the emulator
processes and restart them fresh, then re-run.
```bash
ps aux | grep -i "firebase\|emulator" | grep -v grep | awk '{print $2}' | xargs -I{} kill {}
bash scripts/start-emulators.sh &
```
Do **not** spend time debugging or rewriting tests based on a run where this
is happening — restart the emulator first, then re-run, and only chase a
failure that reproduces against a freshly-restarted emulator. Otherwise you
will loop indefinitely "fixing" tests that were never actually broken.

## Test Requirements

**Every feature and bugfix MUST include automated tests.**

- **New features:** Add Playwright integration tests in `tests/integration/` that verify the feature works correctly
- **Bugfixes:** Add a Playwright test that reproduces the bug (fails before fix, passes after)
- **Unit tests:** Add unit tests in `tests/components/` for utility functions or complex logic
- **Test patterns:**
  - Integration tests: Use Playwright with real emulator (`tests/integration/`)
  - Component tests: Use Vitest + happy-dom (`tests/components/`)
- Run `npm run test:all` before committing to ensure all tests pass

## Communicating with Peter

Peter is the product owner and tester. He tests directly on production at https://events.thetribe.at (NOT locally).

**When updating Trello tickets or communicating with Peter:**
- Write in **German**
- Use **non-technical language** - Peter has no understanding of code
- Focus on **what works/doesn't work for users**, not implementation details
- Keep messages **short and clear**
- Example: "Das Problem ist behoben! User können jetzt ihre eigenen Events wieder ansehen."
- NEVER mention: useEffect, dependency array, hooks, queries, commits, branches, etc.
