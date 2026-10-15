# Prerender (Open Graph / SEO) and build triggers

**Read this when** you touch `scripts/prerender.mjs`, OG/social previews, the sitemap, the
`onEventWriteTriggerBuild` / scheduled rebuild, `deploy.yml` secrets, or `prerender:refresh`.
Region pages in the prerender: [regions.md](./regions.md) section 8.

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
