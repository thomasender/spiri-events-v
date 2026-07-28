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
  command: 'VITE_USE_EMULATORS=true npm run dev',
  ...
}
```

## Playwright Tests

Run e2e tests against the local emulator setup:
```bash
npm run test:e2e
```

Run integration tests:
```bash
npm run test:integration
```

Run all tests:
```bash
npm run test:all
```

**Always use emulators + real data dump for local development and testing.** Do NOT test against production.

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
