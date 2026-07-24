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

**Always use emulators + real data dump for local development and testing.** Do NOT test against production.
