# Production migration, backup and staging

**Read this when** you run or change the Firestore migration/backup/mirror scripts
(`migrate-region-ids`, `export-firestore`, `mirror-prod-to-staging`, `seed-regions`) or deploy to the
staging project `tribe-vbg-staging`. Context: [regions.md](./regions.md) (data model, marker).

## Production runbook (migration, backup, revert)

Order matters. Steps 1-5 are the staging rehearsal; run them again whenever the
migration script changed.

1. **Rehearse on staging** (see "Staging project" below):
   ```bash
   node scripts/mirror-prod-to-staging.mjs --apply                          # fresh sanitized copy
   node scripts/seed-regions.mjs --project tribe-vbg-staging                # regions collection
   node scripts/migrate-region-ids.mjs --project tribe-vbg-staging          # dry-run: check counts
   node scripts/migrate-region-ids.mjs --project tribe-vbg-staging --apply  # write + marker (no backup needed on staging)
   node scripts/migrate-region-ids.mjs --project tribe-vbg-staging          # second run: 0 to migrate
   node scripts/migrate-region-ids.mjs --project tribe-vbg-staging --revert # revert dry-run: counts match the apply
   ```
   Deploy the build to staging (see "Staging project" below) and click through calendar, directory,
   event form, profile and the Regionen tab.
2. **Merge and deploy the code** (`push` to main deploys rules, indexes and
   functions when those files changed; Hosting always). Wait until the new
   indexes show "Enabled" in the Firebase console.
3. **Back up production (read only):**
   ```bash
   node scripts/export-firestore.mjs --project spirieventsvbg            # -> backups/firestore-<date>/ (ADC credentials)
   node scripts/export-firestore.mjs --verify backups/firestore-<date>   # restore check
   ```
   - Covers every top-level collection and every subcollection found by
     traversal (events/messages, users/favorites, users/publicProfile,
     admin_users, regions, instagram_posts, ...), paged past 1000 docs. Each
     collection is compared with a server-side count; any error or mismatch
     means exit 1 and **no** `exportedAt`.
   - `manifest.json` has `exportedAt`, per-collection counts and a SHA-256 per
     file. `--verify` re-reads the files and checks hashes and counts. A real
     restore check: load the typed JSON (`{stringValue: ...}`) into a throwaway
     emulator and compare counts. Without `--project` the script backs up the
     emulator (`backups/firestore-emulator-<date>/`). It is separate from the
     prerender snapshot `data-export/firestore-export/`, which it never touches.
   - `backups/` is git-ignored: it contains personal data (and
     `instagram_private`). Keep it local and delete it when the migration is done.
   - Logic and tests: `src/utils/firestoreBackup.js`,
     `tests/lib/firestoreBackup.spec.ts`.
4. **Seed the regions collection** (idempotent, keeps admin edits, only vorarlberg
   active): `node scripts/seed-regions.mjs --prod` (same as
   `--project spirieventsvbg`).
5. **Migrate:** dry-run first, then
   `node scripts/migrate-region-ids.mjs --project spirieventsvbg --apply`. It
   requires a production backup manifest with `exportedAt` from today (emulator
   backups do not count; `--force` overrides). Writes `regionId: 'vorarlberg'` /
   `directoryRegionIds: ['vorarlberg']`, and at the end the marker, so every open
   page switches to the server-side queries.
6. **Check:** re-run the dry-run (0 to migrate, marker present), open the site.
7. **Activate a second region** only after the checklist in section 13 of [regions.md](./regions.md).

**Revert** (`migrate-region-ids.mjs --revert`) undoes ONLY what the migration
wrote: it deletes `regionId` from events where it is exactly `'vorarlberg'`, and
`directoryRegionIds` from `users/{uid}` and `users/{uid}/publicProfile/data` where
it is exactly `['vorarlberg']` (`FieldValue.delete()`, same lastUpdateTime
precondition batches as the forward run, nothing else touched). Any other value
(set by users or moderators after launch) stays and is listed as "abweichend". It
prints reverted / skipped-because-different / already-without-field, is a dry-run
without `--apply`, and has the same guards (production: `--apply` plus a backup of
today or `--force`; staging: none). A second run reverts 0. Limits: a value a
person chose later that happens to equal the migration's value (e.g. a new
Vorarlberg event) is removed too; the app reads a missing field as Vorarlberg, so
nothing moves. A field that was `null`/`''` before the migration comes back as
missing. Pure planner: `planRevert` in `src/utils/regionMigration.js`, tests in
`tests/lib/regionMigration.spec.ts`. `--revert --apply` deletes the marker
**first**, waits 10 s on real projects so open tabs switch back to the full
query, then removes the fields.

## Staging project (`tribe-vbg-staging`)

A separate, disposable Firebase project to rehearse production changes on a
sanitized copy of production data. Project id `tribe-vbg-staging` (alias
`staging` in `.firebaserc`), URL https://tribe-vbg-staging.web.app.

- **Credentials:** the user's Application Default Credentials
  (`gcloud auth application-default login`). Never `scripts/service-account.json`
  (that is the production key): the staging scripts abort if
  `GOOGLE_APPLICATION_CREDENTIALS` points at it or at any non-staging service
  account.
- **Project allowlist** (`src/utils/projectTargets.js`): the scripts that write to
  a real project accept exactly `spirieventsvbg` and `tribe-vbg-staging`; any other
  `--project` is refused, and so is `FIRESTORE_EMULATOR_HOST` /
  `FIREBASE_AUTH_EMULATOR_HOST` or a different `GCLOUD_PROJECT` next to
  `--project`. Before writing, the initialized project id is checked again.
- **Build and deploy:**
  ```bash
  npx vite build --mode staging   # reads the git-ignored .env.staging.local
  firebase deploy --only firestore:rules,firestore:indexes,storage,hosting,functions --project tribe-vbg-staging
  ```
  `.env.staging.local` must contain the staging Firebase keys **and
  `VITE_FIREBASE_TARGET=staging`**: without it `src/lib/firebase.js` falls back to
  the production config and the staging site would talk to production (login,
  Firestore). Check the bundle: `grep -c spirieventsvbg dist/assets/index-*.js`
  must print 0. Functions allow the staging origin for CORS only when running in
  the staging project (`functions/src/allowedOrigins.ts`). The staging build
  deliberately skips the prerender step (`npm run build` runs
  `scripts/prerender.mjs`, which reads production). Secrets in staging (Mollie,
  Mailgun, Instagram, GitHub dispatch, ...) are dummies: payments, mails, posts
  and rebuild triggers fail there, which is intended.
- **Mirror production into staging (sanitized)** with
  `scripts/mirror-prod-to-staging.mjs` (logic and tests
  `src/utils/stagingMirror.js`, `tests/lib/stagingMirror.spec.ts`):
  ```bash
  node scripts/mirror-prod-to-staging.mjs           # dry-run: reads, sanitizes, prints counts/drops/leak scan, writes nothing
  node scripts/mirror-prod-to-staging.mjs --apply   # empties the mirrored collections in STAGING, then writes the sanitized docs
  node scripts/mirror-prod-to-staging.mjs --emulator [host] [--apply]   # tests: source and target both in the emulator
  ```
  - ADC (read on prod, write on staging). Source and target are hard-coded, no
    `--project`. The write target is checked twice (option resolution and with the
    initialized app's projectId before the first write, and before every batch);
    anything but `tribe-vbg-staging` aborts.
  - ALLOWLIST (`MIRROR_POLICY`): only listed schema paths are copied. Dropped and
    unknown collections are never read (only counted and printed). Dropped:
    `admin_users`, `admin_audit_log`, `calendarFeedTokens`, `instagram_private`,
    `instagram_posts`, `feedback`, `member_lists`, `donors`, `events/{}/messages`,
    and every `app_settings` doc except `theme` / `activeTheme`. A new collection
    needs an explicit policy before it shows up in staging.
  - Sanitizing: e-mails become `user-<sha256 10>@example.invalid`, phones
    `+43 000 0000000`, person names `Testperson <4 hex>` (all deterministic);
    e-mails/phones in free text are regex-scrubbed; token/ip/mollie/payment keys
    are removed. Titles, descriptions, dates, slugs, regionId, bezirk, status and
    all ids stay, old-format and missing fields survive. Slugs and usernames are
    NOT pseudonymised, so a person's name can still appear there.
  - Leak scan: any remaining foreign e-mail or phone number in any field aborts
    with exit 1 (doc path + field, never the value), also in dry-run.
  - `--apply` only clears the mirrored collections (`events` incl. messages,
    `users`, `categories`, `regions`, `themes`, `helpers`, `app_settings/theme`,
    `app_settings/activeTheme`); other staging data such as `admin_users` is kept.
  - Not mirrored: Auth users and Storage files (image URLs keep pointing at
    production's public URLs).
- **Test accounts:** `node scripts/seed-staging-users.mjs` creates or resets
  `admin@staging.test` (Super-Admin: claim + `admin_users`),
  `moderator@staging.test` (Regions-Moderator:in for `steiermark` and `bayern`,
  `admin_users` only) and `user@staging.test` (normal user with `users/{uid}` +
  `publicProfile/data`). All are email-verified and share one random password per
  run, printed once to stdout and never stored (or set it with `--password`).
  Hard-coded to staging, `--emulator` for tests. Idempotent.
- **Other scripts:** `seed-regions.mjs --project tribe-vbg-staging`,
  `migrate-region-ids.mjs --project tribe-vbg-staging [--revert] [--apply]`,
  `promote-admin.mjs <email> --project tribe-vbg-staging`. `export-firestore.mjs`
  only knows emulator and production (staging needs no backup).
