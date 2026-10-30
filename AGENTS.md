# Development Setup

**Node 24.12 or newer** (see `.nvmrc`, `engines` in `package.json`): firebase 13 and its
`@firebase/*` packages declare `node >=24.12`. Older Node only warns (no `engine-strict`), but
use `nvm use` to match CI. `functions/` stays on Node 22.

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

If integration tests fail with widespread, unrelated-looking errors, the Firestore
emulator is probably degraded: `npm run emulators:ensure` (automatic before
every `test:e2e:*` and in the pre-push hook) restarts it; do not debug tests based
on a run with a degraded emulator. Details: `docs/testing.md`.

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

Emulator, `destructive` project, Vitest hygiene and how to write a Playwright test:
`docs/testing.md`.

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

Hard rules when you do write a Playwright test: put it in an **existing** spec file,
no ticket IDs in titles, at most one new `test()` per ticket, storageState fixtures
instead of UI login, and `page.waitForTimeout()` is **banned**. Full list and the
"never test these" list: `docs/testing.md`.

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

## Regions

The platform supports several regions behind a **dark launch**. Regions and their
districts are defined **only in the four CSVs in `scripts/data/regions/`** (countries AT, DE,
CH, LI; `oesterreich.csv`: 9 Bundesländer, Wien with its 23 Gemeindebezirke;
`deutschland.csv`: 104 regions over the 400 Landkreise / kreisfreie Städte; `schweiz.csv`: 19
regions; `liechtenstein.csv`: 1 region with the Landesteile Oberland / Unterland; 133 regions,
658 districts in total). Two CSV layouts are accepted (`Region;Bezirke`, and the comma layout
`region, bezirk` of `deutschland.csv`). Ids of former regions (`bayern`, `luzern`, ...) stay
reserved as usernames; old ids that are regions again (`allgaeu`, `berlin`, ...) are simply
regions. To add or change a region: edit the CSV, add / adjust its entry in the `META` table
of `scripts/lib/regionRegister.mjs` (id, wording; a new id also into `HISTORIC_REGION_IDS`),
run `node scripts/build-region-data.mjs`, update `regionIds()` in `firestore.rules` (and, for
a new canton / Bundesland outline, `ADMIN_SHAPE_REGIONS` in `src/utils/geoRegion.js`), rebuild
the place list (`scripts/build-place-index.mjs`), then seed the doc
(`scripts/seed-regions.mjs`); `tests/lib/regionRegisterCsv.spec.ts` fails on any drift. The dark launch: only Vorarlberg is active, and with fewer than two active regions
nothing visible may change (no chooser, no region names in mails, no GA `region`,
byte-identical prerender and Vorarlberg ICS feed). A missing `regionId` /
`directoryRegionIds` always means `vorarlberg`. Roles: Super-Admin and
Regions-Moderator:in. Regions are switched on only in Verwaltung -> "Regionen",
never by hand-editing `regions/{id}.active`. Visitors never see a region map: they give a
place (typed or shared location) and a radius, the calendar shows everything within it and the
region (title, texts) follows the place; the Landkreis -> region mapping stays in the backend. There is no admin tool to create regions or move districts, and `regions/{id}` docs carry only switches and texts (`docs/regions.md` 2a). Everything else (data model,
queries and migration marker, emails, SEO, ICS, analytics, fixtures, how to add a
region) is in `docs/regions.md`.

## Where to read more (progressive disclosure)

Read a topic file ONLY when your task matches its trigger; each starts with a
two-line "read this when".

- Read `docs/regions.md` ONLY when you touch regions, the region CSVs, region texts or routing,
  combined views (`/oesterreich`, `/deutschland`, `/alle-tribes`), Regions-Moderator:in roles or rules,
  region activation, region fixtures/tests, the visitor's place + radius choice ("Wo bist du?"), event
  positions (`lat`/`lng`) or the place list, or want to add a region.
- Read `docs/staging-migration.md` ONLY when you run or change the Firestore
  migration/backup/mirror scripts (`migrate-region-ids`, `export-firestore`,
  `mirror-prod-to-staging`, `seed-regions`) or build/deploy to `tribe-vbg-staging`.
- Read `docs/design-tokens.md` ONLY when you write CSS (spacing, font sizes, radii: use the
  tokens, never raw px/rem), touch the Design-Modus (`src/components/design/`), the layout
  token catalogue (`src/utils/layoutTokens.js`) or `app_settings/layout` / `layout_history`.
- Read `docs/testing.md` ONLY when you write or change a Playwright/Vitest test or
  fixture, or debug a slow/flaky e2e run (degraded emulator, `destructive` project).
- Read `docs/analytics.md` ONLY when you touch GA4 tracking, `npm run analytics:*`, the
  admin tab "Statistik" or `adminAnalyticsReport`.
- Read `docs/app-check.md` ONLY when you touch Firebase App Check, `appCheckOptions()`
  on a callable, the reCAPTCHA CSP or `ENFORCE_APP_CHECK`.
- Read `docs/calendar-feed.md` ONLY when you touch the `.ics` export/feed,
  `getCalendarFeedToken` or `calendarRoutes.ts`.
- Read `docs/seo-prerender.md` ONLY when you touch `scripts/prerender.mjs`, Open Graph /
  sitemap, the auto-rebuild trigger, `deploy.yml` secrets or `prerender:refresh`.
- Read `docs/instagram-canva-kit.md` ONLY when you change an Instagram image layout
  (`instagramImage.ts`) or rebuild the Instagram templates in Canva.
- Read `docs/instagram-regions.md` ONLY when you touch the per-region Instagram backend
  (regional accounts, token refresh, backfill) or onboard a regional Instagram account.
- Read `docs/email-testing-protocol.md` ONLY when you test or change transactional
  emails; `docs/mailgun-sender-photo.md` ONLY for the Mailgun sender photo.

## Community chat

Logged-in members with a verified e-mail chat in one room ("Lagerfeuer", `/chat`) behind the
feature flag `app_settings/chat` (off / admins / all). Messages are deleted after 10 days.
Behind the same flag every approved event has a small "Kerzenraum" room (`event_chats/*`, readable
without login, candle on calendar cards for new messages). The Kerzenraum behaves like the
Lagerfeuer (send, delete, report, reactions, `@mentions`, older messages, member card), except
presence. Mentions are opt-in in the profile, bell in the header; not in the Postfach.
Read `docs/chat.md` ONLY when you touch the chat or Kerzenraum, its rules (`chat_*`, `event_chats`), `functions/src/chat.ts`
or the chat section of the privacy policy.

The private messenger ("Postfach", `/postfach`, flag `app_settings/messenger`) lives on top of it;
read `docs/messenger.md` ONLY when you touch it, its `dm_*` rules or its privacy section.
The opt-in online dot (green/red next to avatars, `presence/{uid}`) is in `docs/online-status.md`;
read it ONLY when you touch it.
The weekly Trivy dependency scan, Dependabot and the `.trivyignore.yaml` ignore policy are in
`docs/security-scanning.md`; read it ONLY when you touch them or the scan is red.

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
- **Technical questions are NOT asked to Peter.** Questions about architecture, permissions, third-party
  setup (Meta/Firebase/etc.), data models or legal/technical trade-offs are clarified with Thomas in the
  session. Only ask Peter about product behaviour he can judge as a user (what should the user see, which
  option feels right), in plain German.
