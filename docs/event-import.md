# Event import (curated events)

**Read this when** you touch `import_*` collections, `events.curation`, `functions/src/eventImport.ts`
/ `src/utils/eventImport.js`, the curator account (`scripts/ensure-curator-account.mjs`) or any public event path (calendar JSON, ICS, prerender/sitemap, Instagram) that must keep curated events hidden.

## Concept

For regions that are not active yet (Zürich `zuerich`, Tirol `tirol`, Berlin `berlin`)
Super-Admins collect events that organizers already publish on their own websites. Such an
event is written as a normal `events` doc, owned by a shared **curator account**
("tribe Redaktion"), and marked with `curation`. The organizer is then asked **once**, by mail
from admin@thetribe.at with a private preview link, whether the event may appear.

Ground rules (product decisions and legal research):

- **Nothing curated is public before consent.** The event stays `pending` until the backend
  writes `curation.consentAt`; every public path checks this explicitly as well.
- Store as little as possible: functional contact address only (info@, kontakt@), the legal
  form (`company` / `verein` / `individual` / `unknown`), no personal names on the event.
- **One mail only.** No reminders.
- **No image is copied to our storage before consent.** A candidate keeps the image's URL on
  the organizer's site (`isImageUrlAllowed`), never a copy; the event has no image fields.
- Organizers who decline go on a **blocklist** (hash only) and are never contacted or imported
  again.
- **Staging only** for now (project `tribe-vbg-staging`). The curator script refuses
  production unless `--allow-prod` is given; nothing of this runs on production yet.

Tickets: 1 data model, rules, helpers, leak guards and curator account; 3 ingest script and
accept / reject callables; 4 admin tab; 5 + 6 private preview page, consent callable, the one
outreach mail and the deletion of unanswered data ("Preview, consent and outreach"); 7 claim
(an organizer takes the curated events over into an own account, "Claim"). Crawling follows
in another ticket.

## Code

| Where                                                                                                                    | What                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `functions/src/eventImport.ts`                                                                                           | Pure module (no Firebase): constants/enums, `fingerprint`, `blocklistId` / `blocklistKind` / `isBlocked`, `isCuratedEvent`, `isCuratedWithoutConsent`, `countsForActivation`, `isImageUrlAllowed`, `candidateToEventData`, `hashPreviewToken`, `claimTitleSimilarity` |
| `src/utils/eventImport.js`                                                                                               | Synced copy of the constants and the two predicates (for scripts such as `prerender.mjs` and a later admin UI) plus the pure core of the curator script. `tests/lib/eventImport.spec.ts` fails on drift.                                                              |
| `scripts/ensure-curator-account.mjs`                                                                                     | Curator account (see below)                                                                                                                                                                                                                                           |
| `firestore.rules`                                                                                                        | `import_*` blocks, `events` (`isCurationUntouched`, `isCuratedApprovalWithoutConsent`), `app_settings/import` read                                                                                                                                                    |
| `functions/src/eventImportClaim.ts`                                                                                      | Claim callables `claimCuratedEvents`, `approveClaimRequest`, `listMyClaimableEvents`, `findCuratedMatches` (pure decision helpers, handlers with injected deps, wiring)                                                                                               |
| `src/utils/eventClaim.js`, `src/lib/eventClaim.js`                                                                       | Claim token storage and German messages; callable wrappers (inert stand-in in `tests/vitest.setup.ts`)                                                                                                                                                                |
| `src/pages/ClaimEventsPage.jsx`                                                                                          | `/uebernehmen?claim=<token>`                                                                                                                                                                                                                                          |
| `src/components/ClaimableEventsBanner.jsx`, `CuratedMatchHint.jsx`                                                       | Banner in Verwaltung -> "Meine Events"; hint in step 3 of the event wizard                                                                                                                                                                                            |
| `tests/lib/eventImportClaim.spec.ts`, `tests/components/eventClaim.spec.tsx`                                             | Claim logic (in-memory world) and claim UI                                                                                                                                                                                                                            |
| `src/utils/eventImportIngest.js`                                                                                         | Pure core of the ingest script: validation, category mapping, fuzzy dedupe, `planIngest`, CLI options                                                                                                                                                                 |
| `src/utils/eventImportServer.js`                                                                                         | Node-only synced copy of `fingerprint`, blocklist and `isImageUrlAllowed` from `eventImport.ts` (Node cannot load the TS module); drift test in `tests/lib/eventImportIngest.spec.ts`                                                                                 |
| `scripts/import-curated-events.mjs`                                                                                      | Ingest script (see "Ingest")                                                                                                                                                                                                                                          |
| `functions/src/eventImportAdmin.ts`                                                                                      | Callables `importAcceptCandidate`, `importRejectCandidate`                                                                                                                                                                                                            |
| `functions/src/importConsent.ts`                                                                                         | Preview token, preview payload, consent state machine (`decideConsent`, `planConsent`), outreach guards (`outreachRefusal`, `resolveOutreachRecipient`), purge plan, callable handlers (deps injected)                                                                |
| `functions/src/importConsentFunctions.ts`                                                                                | Wiring: `createPreviewLink`, `getImportPreview`, `submitImportConsent`, `sendOutreachMail`, scheduled `purgeExpiredImportData`                                                                                                                                        |
| `functions/src/importOutreachMail.ts`                                                                                    | Pure renderer of the one outreach mail (`renderOutreachMail`), imprint, Art. 14 block, `IMPORT_RETENTION_DAYS`                                                                                                                                                        |
| `functions/src/importImages.ts`                                                                                          | `copyConsentedImages`: copies consented images into Storage                                                                                                                                                                                                           |
| `src/pages/ImportPreviewPage.jsx`, `src/utils/importConsent.js`                                                          | `/vorschau/import/:token`, consent texts (`CONSENT_WORDING_VERSION`), meta / analytics helpers                                                                                                                                                                        |
| `src/pages/LegalPage.jsx` (`datenschutz-import`)                                                                         | Static page `/datenschutz-import` (Art. 14 information)                                                                                                                                                                                                               |
| `scripts/render-import-outreach-mail.mjs`                                                                                | Prints the mail with sample data (`--html`, `--test`); sends nothing                                                                                                                                                                                                  |
| `tests/lib/importConsent.spec.ts`, `tests/lib/importOutreachMail.spec.ts`, `tests/components/ImportPreviewPage.spec.tsx` | Preview, consent, outreach, purge, image copy, mail text, page                                                                                                                                                                                                        |
| `tests/lib/eventImport.spec.ts`                                                                                          | Helper tests                                                                                                                                                                                                                                                          |
| `tests/rules/regions.rules.spec.ts`                                                                                      | Rules tests ("event import")                                                                                                                                                                                                                                          |

## Collections

All `import_*` collections (and the `outreach` subcollection) are **Super-Admin only** in
`firestore.rules`: no access for anyone else, Regions-Moderator:innen included. Import scripts
and functions write with the Admin SDK (no rules), so the value checks in the rules guard the
Super-Admin client only; the backend must follow the same rules.

### `import_organizers/{id}`

| Field                    | Type / values                                                            | Notes                                                                |
| ------------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `name`                   | string, 1-200                                                            | Organisation name as on the website                                  |
| `website`                | string                                                                   |                                                                      |
| `contactEmail`           | string                                                                   | Functional address only, never a personal one                        |
| `legalForm`              | `company` \| `verein` \| `individual` \| `unknown`                       | Individuals / unknown: no name on the event                          |
| `regionId`               | valid region id                                                          |                                                                      |
| `consent`                | `none` \| `asked` \| `manual_ok` \| `sync_ok` \| `declined` \| `claimed` | See consent states                                                   |
| `syncMode`               | `curated_once` \| `sync_consented` \| `self_managed` \| `declined`       |                                                                      |
| `previewTokenHash`       | 64 hex chars (sha256) or null                                            | **Never** the plain token; a `previewToken` key is refused           |
| `previewTokenExpiresAt`  | timestamp                                                                |                                                                      |
| `consentRecord`          | `{ at, wordingVersion, scopes: { event, images, persons } }`             | **Backend only**: the rules refuse any client create/change          |
| `linkedUid`              | uid or null                                                              | Account the organizer claimed with                                   |
| `sourceUrls`             | string[]                                                                 | Pages the organizer's events were found on                           |
| `createdAt`, `updatedAt` | timestamp                                                                |                                                                      |
| `deleteAfter`            | timestamp                                                                | Non-responders: delete the organizer and its candidates/events after |

`import_organizers/{id}/outreach/mail`: THE one outreach mail (fixed doc id), `{ status,
templateVersion, test, queuedAt, sentAt, messageId, error }` (`status`: `queued` \| `sent` \|
`failed`; `bounced` / `replied` are reserved). Super-Admins read/write.

`import_organizers/{id}/previewViews/{auto}`: one doc per preview view, `{ at, imageUrls,
eventCount }` (which of the organizer's image URLs were shown when; **no IP**). Written only by the
backend; Super-Admins may read, nobody may write (rules).

Fields the backend adds on the organizer: `consentRecord.action`, `selfManageRequestedAt`,
`purgedAt`.

### `import_candidates/{id}`

| Field          | Type / values                                                     | Notes                                                                                                                                                                         |
| -------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `regionId`     | valid region id                                                   |                                                                                                                                                                               |
| `organizerRef` | id in `import_organizers`                                         |                                                                                                                                                                               |
| `sourceUrl`    | https URL                                                         | Page the event was found on                                                                                                                                                   |
| `sourceType`   | `jsonld` \| `ical` \| `api` \| `llm` \| `manual`                  |                                                                                                                                                                               |
| `dateQuote`    | string                                                            | Verbatim date text from the page, for review                                                                                                                                  |
| `rawExtract`   | map                                                               | Facts found (`CandidateExtract`: title, date, time, endTime, endDate, place, city, lat, lng, isOnline, contribution, fee, feeMax, priceCurrency, description, link, category) |
| `fingerprint`  | sha256 hex                                                        | `fingerprint(sourceUrl, date, title)`, recognises the same event across runs                                                                                                  |
| `confidence`   | number 0-1                                                        |                                                                                                                                                                               |
| `status`       | `found` \| `reviewed` \| `published` \| `rejected` \| `duplicate` |                                                                                                                                                                               |
| `eventId`      | id in `events` or null                                            | Set when the event doc was written                                                                                                                                            |
| `imageUrl`     | https URL or null                                                 | URL on the organizer's site only (`isImageUrlAllowed`); Firebase/Cloud Storage URLs and `imagePath` / `imageStoragePath` are refused                                          |
| `fetchedAt`    | timestamp                                                         |                                                                                                                                                                               |

### `import_runs/{id}`

`{ region, source, counts, errors, costEstimate, startedAt, finishedAt }`, one doc per run.

### `import_blocklist/{id}`

Doc id = `blocklistId(emailOrDomain)` = sha256 (hex) of the lower-cased e-mail address or domain
(without `www.` / scheme / path). Fields only `kind` (`email` \| `domain`), `reason`, `createdAt`,
`createdBy`; the rules refuse any other id format or key, so the plain address cannot be stored.
`isBlocked({ email, website }, ids)` checks the address, its domain and the website domain
including parent domains (never the bare TLD).

### `app_settings/import`

`{ curatorUid, updatedAt }`, written by the curator script. Readable by Super-Admins only (like
`app_settings/instagram`); no client writes.

## `events.curation`

```
curation: {
  organizerRef: string,   // import_organizers id
  sourceUrl: string,
  importedAt: timestamp,
  claimable: boolean,     // the organizer may take the event over into an own account
  consentAt?: timestamp,  // set ONLY by the backend once the organizer consented
}
```

- Written only with the Admin SDK. The rules forbid every client (owner, curator account,
  Super-Admin, moderator) to create an event with `curation` or to add, change or remove it.
  `createdBy` stays unchangeable for owners as before.
- **No client may move a curated event into `approved` while `curation.consentAt` is missing**,
  not even a Super-Admin or the region's moderator. Editing, sending back or rejecting still
  work. Super-Admins (and moderators of the region, as for every pending event) can read it.
- `candidateToEventData(candidate, organizer, curatorUid, { now })` builds the event doc in the
  shape of the event form (`EventFormWizard.jsx` `buildEventData`): `status: 'pending'`,
  `createdBy: curatorUid`, `regionId`, facts and link, description as escaped `<p>` HTML,
  `instagramConsent: false`, `curation`. **No image fields, no personal names** (organizer name
  only for `company` / `verein`), and `organizer.email` is empty so no app mail (rejected,
  changes requested, ...) reaches the organizer before consent. `slug` and server timestamps
  are left to the caller (the slug trigger makes it unique).

## Consent states

| `consent`   | Meaning                                                | Event public?                     |
| ----------- | ------------------------------------------------------ | --------------------------------- |
| `none`      | Found, not contacted                                   | no                                |
| `asked`     | The one mail was sent (outreach log)                   | no                                |
| `manual_ok` | Agreed, we keep curating by hand                       | yes, after backend sets consentAt |
| `sync_ok`   | Agreed to regular sync from their site                 | yes, after backend sets consentAt |
| `claimed`   | Took the events over into an own account (`linkedUid`) | yes                               |
| `declined`  | Said no: delete their data, blocklist entry            | never                             |

`PUBLISHABLE_CONSENT_STATES` = `manual_ok`, `sync_ok`, `claimed`. The event itself only checks
`curation.consentAt`; the consent callable (`submitImportConsent`) sets both together with
`consentRecord`.

## Preview, consent and outreach

Tickets 5 + 6 (+ 10). Staging never mails a real organizer. On production the real mail is
controlled by `app_settings/importOutreach` (see "Real mail on production").

### Preview link and page

- `createPreviewLink({ organizerId, regenerate? })` (Super-Admin): random token (32 bytes,
  base64url), stores only `previewTokenHash` (`hashPreviewToken`, sha256) and
  `previewTokenExpiresAt` (7 days, `PREVIEW_TOKEN_TTL_DAYS`), returns `{ url, expiresAt }`. URL =
  `projectSiteOrigin()` (staging: `https://tribe-vbg-staging.web.app`) + `/vorschau/import/<token>`. A valid
  link is only replaced with `regenerate: true` (the old one stops working; the plain token cannot
  be shown again). Refused for declined organizers. Audited.
- `getImportPreview({ token })` (public, rate-limited, App Check helpers as every callable): a
  malformed, unknown or expired token always gets the same `not-found` "Dieser Link ist ungültig
  oder abgelaufen." Returns organizer name + website, consent state and scopes, `wordingVersion`,
  `retentionDays`, and the organizer's curated events in status `pending` / `approved` in a public
  shape (title, date, time, place, price, link, category, description as plain text, `imageUrl` only
  if `isImageUrlAllowed` against the source page, `published`). No contact address, no Firestore
  ids (events carry `key: e1, e2, ...`), nothing of other organizers. Each call writes a
  `previewViews` doc.
- Page `/vorschau/import/:token` (`ImportPreviewPage.jsx`, lazy; `/vorschau/:token` itself is the
  pre-entry preview of `docs/pre-entries.md`, whose tokens look the same): own simple cards (the real `EventCard`
  links, favourites and tracks, so it is not reused). Images are `<img referrerPolicy="no-referrer">`
  straight from the organizer's site (no download, proxy or storage), placeholder on error. At
  runtime it sets `<meta name="robots" content="noindex, nofollow">` and `<meta name="referrer"
content="no-referrer">` and removes `og:image` / `twitter:image` while open. Hosting
  (`firebase.json`) sends `X-Robots-Tag: noindex, nofollow, noarchive`, `Cache-Control: private, no-store`,
  `Referrer-Policy: no-referrer` for `/vorschau/**`. Analytics only ever sees `/vorschau`
  (`redactPrivatePath` in `src/lib/analytics.js`). Not in the prerender or sitemap, no region
  chooser, no profile onboarding dialog, `vorschau` is a reserved username.
- Hosting header globs: `/*` matches top-level paths only, so the global CSP is not sent for
  `/vorschau/import/<token>`; that is why the organizer's images load. If the global rule is ever widened
  to `/**`, the preview needs `img-src https:` or its images break.

### Consent (`submitImportConsent`)

`{ token, action, scopes?, wordingVersion }`, public and rate-limited. `wordingVersion` must equal
`CONSENT_WORDING_VERSION` (`'2026-11-v1'`, synced in `src/utils/importConsent.js`), otherwise
`wording-outdated`: a stale page cannot record consent to texts it did not show.

| Action         | Effect                                                                                                                                                                                                                                                                                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `approve_once` | `scopes.event: true` required. `consent: manual_ok`, `syncMode: curated_once`, `consentRecord { at, wordingVersion, scopes, action }`, `deleteAfter: null`. Curated events `pending` / `approved` get `curation.consentAt`; `pending -> approved` with `approvedBy` = curator uid (`app_settings/import`), `approvedAt`, `updatedAt`, a free `slug` (like `resolveSlugForApproval`) |
| `approve_sync` | Same, `consent: sync_ok`, `syncMode: sync_consented`                                                                                                                                                                                                                                                                                                                                |
| `self_manage`  | **Intent only, not consent**: `syncMode: self_managed`, `selfManageRequestedAt`; no `consentRecord`, events stay pending. The page then opens the claim flow `/uebernehmen?claim=<token>` (ticket 7)                                                                                                                                                                                |
| `decline`      | `consent` / `syncMode: declined`, `contactEmail: null`, `sourceUrls: []`; blocklist entries (sha256 of the e-mail and of the website domain, reason `declined`); the organizer's curated events are **deleted** (with Storage); candidates `rejected` without `rawExtract` / `dateQuote` / `imageUrl` / `eventId` (the fingerprint stays). Also withdraws an earlier approval       |

Why `self_manage` records no consent: consent needs the explicit checkbox 1 (rights and
publication); "selbst verwalten" only says who keeps the events, and ticket 7 already defines
"claiming is not consent". A claimed organizer gives consent on the same preview page afterwards
(the token survives the claim): for `consent: claimed`, `approve_*` writes `consentRecord` and
approves the events but keeps `consent: claimed` / `syncMode: self_managed`; `decline` is refused
(`claimed`, they own the events now and delete them themselves); `self_manage` is a no-op.

State machine (`decideConsent`): `declined` is final (decline again = no-op, anything else refused);
the same action with the same scopes again = no-op (`changed: false`, no writes, no audit);
otherwise applied (upgrades, changed scopes, a later decline that withdraws an approval). Every
applied action writes an `admin_audit_log` entry (`action: importConsent`, actor `import-preview`).
The approval runs the usual triggers: no status mail before a claim (`organizer.email` is empty),
no Instagram post (`instagramConsent: false`).

### Images after consent

Only with `scopes.images: true`: `copyConsentedImages` (`importImages.ts`) fetches each image again
(https, `isImageUrlAllowed` checked again, no redirects, 10 s timeout, max 15 MB, `image/*` only),
converts it with sharp (JPEG max 1600 px + WebP thumbnail max 720 px) and stores it like a form
upload under `events/{eventId}/{ts}_import.jpg` / `thumb_{ts}_import.webp` with a download token;
the event gets `imageUrl`, `imageThumbUrl`, `rightsConfirmed`, `curation.imageSourceUrl`,
`curation.imageCopiedAt`. Best effort: a failing image is logged and skipped. `eventStorageCleanup`
removes the files with the event.

### Outreach mail (`sendOutreachMail`)

`{ organizerId, testRecipient?, force? }`, Super-Admin. Refused (`failed-precondition`, `reason`):
`blocklisted` (address, its domain or the website domain incl. parents), `already-sent` (an
`outreach/mail` doc that is not `failed`), `consent-not-none`, `individual` (unless `force: true`),
`no-contact`, `no-events`.

**Recipient guard** (`resolveOutreachRecipient`): outside production (staging, emulator, any other
project id) a real organizer address is **never** used: `testRecipient` is required and the subject
starts with `[TEST] `. On production the mail is refused (`disabled-in-production`) while the switch
`productionEnabled` is off, also for a test recipient.

#### Real mail on production (ticket 10)

`app_settings/importOutreach` = `{ productionEnabled: bool, dailyLimit: int 1..50, updatedAt }`:
Super-Admin only (read and write, rules; `app_settings` is otherwise public, so the doc is excluded
in the generic read rule). **A missing doc means off** and a limit of 10
(`normalizeOutreachSettings`, ceiling `OUTREACH_DAILY_LIMIT_MAX = 50` in code). Legal review is done
(decision Thomas, 2026-11-24); the switch is the kill switch and needs no deploy.

- A real mail (no `testRecipient`) takes one slot of the Vienna day in `import_outreach_days/{yyyy-mm-dd}`
  (`{ count }`, transaction, backend writes only, Super-Admin reads). At the limit: `daily-limit`, nothing
  sent. A slot is also used by a send that then fails (conservative). Test mails are not counted.
- Import tab "Veranstalter": the box "Versand an echte Veranstalter" (switch, limit, "Heute gesendet x von y")
  and, only on production with the switch on, per organizer with consent `none`, a contact address and
  events, the button "Mail an Veranstalter senden" with a confirm dialog. Staging has no such button.
- Refusals are shown in German (`src/utils/outreachErrors.js`), never as "Outreach refused: ... [400]".

Flow: claim `outreach/mail` (`queued`, transaction) -> new preview token (replaces an older link) ->
render -> Mailgun (From `MAILGUN_FROM`, Reply-To admin@thetribe.at, open/click tracking off so the
token is not routed through Mailgun redirects) -> `outreach/mail` `sent` + `messageId`, organizer
`consent: asked`, `deleteAfter` = now + 90 days. A failed send is marked `failed` and may be retried.
**One mail only: there is no reminder logic anywhere.**

Look (`OutreachVariant`): the default `bilder` shows the logo, numbered step badges and the photos of
Peter, Thomas and Jana (no hero photo, no tracking pixel). The images are plain files on our own
domain, `<site origin>/mail/{logo.png,peter.jpg,thomas.jpg,jana.jpg}` (`public/mail/`), so the sender
passes `assetBase: siteOrigin`. `schlicht` is the same mail without any image: kept, currently
unused (`OUTREACH_DEFAULT_VARIANT` switches it; a render without `assetBase` also falls back to it).
Text and legal parts are identical in both (`tests/lib/importOutreachMail.spec.ts`). Regional wording
(Trello 809): the vision sentence names the region (`regionIn`, e.g. "in Tirol") and the footer link
follows the country (`deintribe.at/.de/.ch`).

Content (`renderOutreachMail`, `OUTREACH_TEMPLATE_VERSION`): who we are, the found events with
links to the organizer's own pages, where the address came from (Impressum / contact page),
"Ohne deine Zustimmung veröffentlichen wir nichts", the preview link with its expiry, a one-click
decline link (`/vorschau/import/<token>?aktion=ablehnen`, opens the page with "Ja, ablehnen" on top) or a
reply "Nein", deletion after 90 days, the Art. 14 GDPR block (controller, purpose, Art. 6 (1) f,
data, source, recipients, retention, rights incl. objection, complaint authority, link to
`/datenschutz-import`) and the full imprint. Review: `node scripts/render-import-outreach-mail.mjs`
(`--html`, `--test`).

### Delivery and bounces (ticket 11)

`functions/src/importDelivery.ts` (pure) + the function `mailgunOutreachWebhook` (HTTPS, public URL,
trusted only through Mailgun's HMAC signature, secret `MAILGUN_WEBHOOK_SIGNING_KEY`).

- The outreach mail carries `v:organizerId` (Mailgun custom variable), which comes back in every
  webhook event, so an event finds `import_organizers/{id}/outreach/mail` without an index.
- Events used: `delivered`, `failed` with `severity: permanent` (hard bounce), `complained`. Everything
  else (temporary failures, other events) is ignored with HTTP 200 so Mailgun does not retry. A bad
  signature or an old timestamp (15 min) is 401.
- `outreach/mail` gets `delivery` (`delivered` | `bounced` | `complained`), `deliveryAt`,
  `deliveryReason`. The state only moves up (delivered < bounced < complained), so retries are no-ops.
- **Only real mails count and may block.** A bounce of a test mail only fills `delivery`.
- Bounce: the contact address goes on the blocklist (hash, reason `bounce`). Complaint: address and
  website domain (reason `complaint`).
- Totals in `import_outreach_stats/all` (`sent`, `delivered`, `bounced`, `complained`; Super-Admin
  reads, backend writes). **The sending pauses itself** (`app_settings/importOutreach`
  `productionEnabled: false` + `pausedReason`) on the first complaint, or when bounces + complaints
  exceed 5 % of the real mails (judged from 10 real mails on). Switching the sending on again in the
  Import tab clears the reason. The Import tab shows the totals, the pause and, per organizer, how
  the last mail was delivered.
- "Nein" by mail reply: the button "Als abgelehnt markieren" (callable `importDeclineOrganizer`,
  Super-Admin) does what the decline link does (data deleted, blocklist), audited with the admin's uid.
- Set up in Mailgun (Sending > Webhooks): the three events `Delivered`, `Permanent Failure`,
  `Spam Complaints` all point to the function URL; the account's "HTTP webhook signing key" goes into
  the secret (`firebase functions:secrets:set MAILGUN_WEBHOOK_SIGNING_KEY`, per project).

### Deleting unanswered data

`purgeExpiredImportData` (daily 04:10 Vienna): organizers with `consent` `none` / `asked` whose
`deleteAfter` passed (`isImportDataExpired`) lose their candidates, curated events that never went
public (everything not `approved`, with Storage), `contactEmail`, preview token, `sourceUrls` and the
`previewViews` log. The organizer doc stays as a tombstone (name, website, consent `asked`, outreach
log) so nobody is mailed twice. Audited as `importPurge`.

## How curated events stay hidden

They are `pending` until consent, and every public path only takes `approved` events. Because a
misused Admin-SDK write could still approve one, each path also checks
`isCuratedWithoutConsent(event)` explicitly:

| Path                                                  | Guard                                                                                                                                                                |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public events JSON (`publicEvents.ts`)                | `isPubliclyListed` in `publicEventsLogic.ts` (list + version bump)                                                                                                   |
| ICS feed / single event                               | `upcomingOccurrences` in `calendar/calendarRoutes.ts`                                                                                                                |
| Instagram feed post on approval                       | `instagramPostOnApproval.ts` and `publishApprovedEvent` (`no-consent`, no dedupe doc)                                                                                |
| Instagram weekly carousel and stories                 | `isCarouselEligible` in `instagram/instagramCarousel.ts`                                                                                                             |
| Prerender event pages, sitemap, calendar/region pages | `isIncludedInPrerender` and a filter after merging all sources in `scripts/prerender.mjs` (the prerender otherwise loads every non-trashed event, also pending ones) |
| Client approval                                       | `firestore.rules` (see above)                                                                                                                                        |
| Mails to the organizer                                | `organizer.email` is empty on curated events                                                                                                                         |

`approvedEventsCounter` counts approval transitions only, so a curated event counts once it is
approved after consent.

## Region activation (not changed yet)

`regionActivation.ts` counts approved, upcoming, non-online events of a region. Curated events
cannot be approved before consent, so only consented curated events count, as every approved event.
Decided (Thomas, 2026-11-24): imported events count towards the 15 as soon as they are approved, i.e.
after consent. `countsForActivation(event)` stays unused for this.

## Curator account

```bash
node scripts/ensure-curator-account.mjs                    # dry run on tribe-vbg-staging
node scripts/ensure-curator-account.mjs --apply            # create / update on staging
node scripts/ensure-curator-account.mjs --apply --email redaktion@thetribe.at
node scripts/ensure-curator-account.mjs --project spirieventsvbg --allow-prod --apply   # production, deliberately
```

- Default project `tribe-vbg-staging` (credentials: `gcloud auth application-default login`);
  production only with `--allow-prod` (then `scripts/service-account.json`), any other project is
  refused. Dry run unless `--apply` (the dry run still reads Auth to show the plan).
- Ensures the Auth user (default `curator@thetribe.at`, a placeholder; e-mail verified, display
  name "tribe Redaktion", no password, no staff role: an account with claims or an
  `admin_users` doc is refused), the profile docs `users/{uid}` + `users/{uid}/publicProfile/data`
  in the sign-up shape (`buildUserProfileDocs`, slug `tribe-redaktion`) and
  `app_settings/import.curatorUid`. Prints the UID. Idempotent.

## Admin tab

Verwaltung -> Regionen -> **Import** (`?tab=import`, Super-Admin only; everyone else gets
"Kein Zugriff"; `ImportTab.jsx`, registered in `AdminPage.jsx` and `ADMIN_TABS`). Region filter
(`zuerich`, `tirol`, `berlin` plus regions that appear in a run) and three views:

- **Kandidaten**: `import_candidates` of the region by status (default `found`), live, max 100,
  newest first (index `regionId + status + fetchedAt`); counts per status via `getCountFromServer`.
  Shows facts, `confidence`, `pilotExcluded`, the verbatim `dateQuote`, source link and the image
  URL as a **text link** (no third-party `<img>`). "Annehmen" confirms, then calls
  `importAcceptCandidate`; for `pilotExcluded` a second confirm follows and `force: true` is sent.
  "Ablehnen" asks for a reason (kein Fit, Duplikat, falsches Datum, Sonstiges).
- **Veranstalter**: `import_organizers` (index `regionId + name`, max 200) with consent badge,
  candidate / event counts (from the region's candidates, max 500), last `outreach` entry, preview
  link (`createPreviewLink`, copied to the clipboard, shows expiry; "Link neu erzeugen" when a
  token exists), "Testmail an: [Adresse]" + "Testmail senden" (`sendOutreachMail` with
  `testRecipient`; there is deliberately **no plain send button**, and a banner says real
  organizer addresses are never mailed on staging) and blocklist toggles for the e-mail address
  and the website domain. Consent is never editable here; the backend sets it.
- **Läufe**: last 50 `import_runs` with counts and errors.

All callables go through `src/utils/importAdminApi.js` (mock it in tests); the blocklist is
written from the client (rules: Super-Admin, id = `blocklistIdAsync(value)`, an async WebCrypto
copy of `blocklistId`, parity tested in `tests/components/ImportTab.spec.tsx`).

Follow-ups on this tab:

- **Layout**: the intro paragraph is a flex item of a column here; its `flex: 1 1 320px` from
  `ModerationTab.css` (meant for a header row) turned into a 320px height, the gap above the
  region select. `ImportTab.css` sets `flex: 0 0 auto` and a `--space-3` gap for all three views.
- **"Pilot ausgeschlossen"** (`pilotExcluded`: individuals / sole proprietors, higher legal
  risk) has a tooltip and the same plain-German explanation in the confirm dialog
  (`PILOT_EXCLUDED_HELP`).
- **"Zurückgestellt"** (stored value stays `reviewed`, label was "Geprüft"): "Zurückstellen" on a
  `found` candidate and "Wieder öffnen" on a deferred one write `status` directly
  (`setCandidateStatus`; the `import_candidates` rules already allow any valid status for
  Super-Admins). Deferred candidates cannot be accepted until reopened.
- **Visibility switch** "Import-Events für Moderator:innen im Prüfen-Tab sichtbar" (see below).

### Review tab: own section "Import: wartet auf den Veranstalter"

Pending curated events **without** `curation.consentAt` are not in "Wartend auf Genehmigung":
the team cannot approve them, only the organizer can (preview link). `ReviewTab.jsx` shows them in
the collapsed section `ReviewImportAwaiting.jsx`, grouped by `curation.organizerRef`, without the
approve / send-back buttons. Super-Admins also see the organizer's state there ("noch nicht
angeschrieben", "Mail gesendet am ...", "will selbst verwalten"), read from `import_organizers`
and the last `outreach` doc (moderators cannot read `import_*`, they get the grouping only).
These events are also left out of the pending counts, the region filter count (shown as "· n
Import") and the Review dot (`attentionIds` in `useAdminAlerts`).

### Visibility in Review (UI-level hide)

Unclaimed curated events (`curation` set, `claimable !== false`) are shown in the Review tab,
the Review dot / header count and the "In Klärung" list **only to Super-Admins**, unless a
Super-Admin switches on `app_settings/importVisibility` = `{ moderatorsSeeInReview: boolean,
updatedAt }` (missing = off). The doc is readable by everyone (generic `app_settings` read; only
`import` and `instagram` are Super-Admin only) and writable only by Super-Admins (own rules
block: `hasOnly(['moderatorsSeeInReview','updatedAt'])`, bool).

This is **a hide in the client, not access control**. Firestore rules cannot filter query
results, and a moderator's query (`status == 'pending'` and `regionId in [...]`) must stay valid
or the whole Review tab fails, so the events read rules are unchanged: a moderator of the region
can still read these docs directly. What they contain is only public facts the organizer already
published on its own website. The filter (`filterCuratedForReview`) sits in the data layer
(`usePendingEvents`, `useEventsWithMessages`, `useAdminAlerts`, via `useReviewVisibility`), so
list, counts and badges agree. After a claim the event is a normal event again.

### Review comments and delete reasons for unclaimed curated events

An unclaimed curated event is owned by the curator account and has no `organizer.email`.
A comment or reason "to the organizer" would reach nobody (or the curator mailbox). So for
`isUnclaimedCuratedEvent`:

- UI: `requiresDeleteReason` is false (no reason field when trashing); the Review tab and the
  event page reject without a reason and say that no e-mail is sent; the message thread on the
  event page is labelled "Interne Notiz" and offers no rejection templates / mail templates.
- Backend (`notificationRouting.ts`, snapshot field `curatedUnclaimed`): no approved, trashed,
  rejected, unpublished or change-request mail for such an event (the "submitted" guard for
  `curated` stays). Needs a Cloud Functions deploy.
- After the claim (`claimable: false`, `createdBy` = the real user) everything works as for a
  normal event.

Approve is not offered for curated events without `curation.consentAt` (event page button
disabled with the Review-tab hint text; `approveBlockedReason`); a refusal by the rules shows
the same message.

Other places: the **Regionen** tab shows "Import: x von 15 Events, davon y mit Consent" for
inactive import regions with curated events. It is computed **client-side** from bounded reads
(published candidates with an `eventId`, organizers with a publishable consent;
`fetchImportProgress`), not by `adminListRegionActivation`, and does not change the activation
conditions. The **Review** tab marks curated events "importiert" (and "ohne Consent").

## Ingest (`scripts/import-curated-events.mjs`)

```bash
D=path/to/discovery
node scripts/import-curated-events.mjs --file $D/zuerich.json --file $D/tirol.json   # dry run, offline
node scripts/import-curated-events.mjs --file $D/tirol.json --dry-run --remote       # dry run against staging data (credentials)
node scripts/import-curated-events.mjs --file $D/tirol.json --apply                  # write to tribe-vbg-staging
```

- Input: discovery JSON (`{ region, organizers[], candidates[], notes }`), one region per file.
- Default project `tribe-vbg-staging`; anything else is refused (production only with
  `--allow-prod`, like the curator script). **Dry run is the default** and needs no credentials: it
  plans against empty state (no existing events / candidates / blocklist) and writes nothing.
  `--remote` lets a dry run read staging (ADC) so dedupe and blocklist are real. `--apply` always
  reads first and needs `app_settings/import.curatorUid` (else: run `ensure-curator-account.mjs`).
- Writes only `import_organizers`, `import_candidates` (status `found`, or `duplicate`) and one
  `import_runs` doc per file (counts, skip reasons, errors, source `file:<name>`). **No events.**
- Organizer: id = website host (`www.` stripped, non-alphanumerics -> `-`), `consent: none`,
  `syncMode: curated_once`, `legalForm` from the file. **`contactEmail` is never set for
  `legalForm: individual`.** Existing organizers only get new `sourceUrls` (and a missing mail);
  consent / syncMode / legalForm are never touched.
- Candidate id = first 40 hex chars of `fingerprint(sourceUrl, date, title)`, created with
  "must not exist": a second run on the same file writes nothing new (and leaves no run doc).
  Individuals' candidates are `found` but carry `pilotExcluded: true`.
- Candidate fields beyond the table above: `pilotExcluded`, `duplicateOf: { kind: 'event' |
'candidate', id }`; `rawExtract` additionally holds `bezirk` and `contribution: 'unknown'`
  where the page named no price. The rules do not restrict extra candidate keys.

### Validation (per candidate, reason in the summary)

| Reason                               | Rule                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------ |
| `missing-title`, `missing-dateQuote` | title and a verbatim date quote are required                                         |
| `invalid-sourceUrl`                  | https page, never Instagram / Facebook                                               |
| `invalid-date`, `past-date`          | real `YYYY-MM-DD`, strictly after today (Vienna)                                     |
| `unknown-organizer`                  | `organizerKey` not in the file's organizers (or the organizer has no usable website) |
| `blocked`                            | organizer mail, mail domain or website domain (incl. parent domains) is blocklisted  |
| `exists`                             | fingerprint / id already imported (idempotency, also the same event twice in a file) |
| (not a skip) bad `imageUrl`          | fails `isImageUrlAllowed` (other host, http, Instagram/Facebook CDN): stored as null |

### Dedupe

1. **Exact:** same fingerprint (source URL without tracking/www/fragment + date + normalised
   title) -> skipped as `exists`.
2. **Fuzzy:** same date, normalised titles with Dice bigram similarity >= 0.8 (or one title
   contained in the other, >= 10 characters), and no two different start times, against events of
   the same region, existing candidates (not marked duplicate) and candidates accepted earlier in
   the run -> the candidate is written with status `duplicate` and `duplicateOf` (reviewable, not
   published). It is counted as "Duplikat", not as imported.

### Category and district

`categoryGuess` is mapped to an **existing** name of `CATEGORY_COLORS` (exact, then keywords of
the guess, then keywords of the title), else `Sonstiges`; a category is never created. The district
(`bezirk`) comes from `placeAssignment` (offline place list) and is set only when the place lies in
the file's region. `lat`/`lng` are not set (no geocoding).

## Callables (Super-Admin only, `functions/src/eventImportAdmin.ts`)

| Callable                                         | Effect                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `importAcceptCandidate({ candidateId, force? })` | Writes the `pending` event (`candidateToEventData`, slug from `generateEventSlug` + `findFreeSlug`, `createdBy` = curator, `curation` without `consentAt`, no image, empty organizer mail), sets the candidate to `published` + `eventId`, adds an `admin_audit_log` entry (one transaction). Accepting twice returns the existing event. |
| `importRejectCandidate({ candidateId, reason })` | Candidate -> `rejected` (+ `rejectReason`), audit entry.                                                                                                                                                                                                                                                                                  |

Refusals (`failed-precondition`, `details.reason`): `blocked` (also with `force`), `organizer-declined`,
`organizer-missing`, `pilot-excluded` (candidate flagged or organizer `individual`, unless
`force: true`), `no-curator`, `status` (candidate not `found` / `reviewed` / `duplicate`).
The candidate is `published` only together with the event (same transaction).

**No submission mails for curated events:** `onEventCreated` / `onEventStatusChanged` would send
"neues Event eingereicht" for any new `pending` event (when `ADMIN_EVENT_EMAILS_ENABLED` is on).
`decideCreatedEventNotification` / `decideEventStatusNotification` now return nothing when the
event carries `curation` (`EventSnapshot.curated`, set in `notifications.ts`), so neither admins
nor organizers are mailed, independent of the flag.

## Claim

An organizer takes the curated events of their `import_organizers` doc over into an own
account. Callables in `functions/src/eventImportClaim.ts` (App Check observed like the other
callables, rate-limited per uid; account checks read Firebase Auth itself, not the possibly
stale ID token):

| Callable                                         | Who              | What                                                                                    |
| ------------------------------------------------ | ---------------- | --------------------------------------------------------------------------------------- |
| `claimCuratedEvents({ organizerId?, token? })`   | signed-in member | Claim, or create a claim request                                                        |
| `approveClaimRequest({ requestId, approve })`    | Super-Admin      | Decide a request; approving runs the same claim (actor = the admin in the audit log)    |
| `listMyClaimableEvents()`                        | signed-in member | `{ events: [{ title, date }], total }` waiting for the account's exact verified address |
| `findCuratedMatches({ title, date, regionId? })` | signed-in member | Wizard hint: up to 3 `{ organizerId, title, date }`, never contact data                 |

The account always needs a **confirmed e-mail address** (`email-not-verified` otherwise).

### Proofs

| Proof    | Condition                                                                                                                                                                                                                                          | Result                 |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `token`  | `hashPreviewToken(token)` (sha256 hex, the helper ticket 5 uses as well) equals `previewTokenHash`, `previewTokenExpiresAt` not passed                                                                                                             | automatic claim        |
| `email`  | Verified account address equals `contactEmail` (case-insensitive)                                                                                                                                                                                  | automatic claim        |
| `domain` | Same registrable domain (`registrableHost`) as the website or the contact address, and the account address is **not** free-mail (`FREE_MAIL_DOMAINS`: gmail, gmx.\*, web.de, outlook, hotmail, icloud, yahoo, proton, aon, bluewin, t-online, ...) | claim **request** only |
| `none`   | anything else (only with an `organizerId`, e.g. from the wizard hint)                                                                                                                                                                              | claim **request** only |

Without `organizerId` and token the call claims every organizer whose `contactEmail` is the
account's exact address (`no-organizer` if there is none).

### Refusals (`HttpsError.details.reason`)

`curator` (the curator account itself), `declined` (`consent` or `syncMode` declined),
`blocked` (blocklist: address, its domain, website domain and parents), `already-claimed`
(`linkedUid` is another account), `invalid-token`, `token-expired`, `no-organizer`,
`request-decided`. The client turns them into German sentences (`claimErrorMessage`).

### What the claim writes

- Every event with `curation.organizerRef == organizerId` whose `createdBy` is the curator (or
  already the claimer): `createdBy` = uid, `organizer.name` (kept, else the organizer's name),
  `organizer.email` = the verified address, `curation.claimable = false`, `curation.claimedAt`,
  `curation.claimedBy`. An event owned by anybody else is never taken.
- The organizer: `consent: 'claimed'`, `syncMode: 'self_managed'`, `linkedUid`, `claimedAt`.
  `consentRecord` is not touched.
- One `admin_audit_log` entry `claimCuratedEvents` (`proof`, `via: self | request`, `requestId`,
  `eventCount`); a rejected request writes `rejectClaimRequest`.
- **Claiming is not consent.** `curation.consentAt` and the event `status` stay as they are: a
  pending curated event without consent stays pending (and no client can approve it) until the
  consent callable (ticket 5) records consent. A token claim with consent already recorded
  changes nothing about consent either.
- Organizer, audit entry and the first `CLAIM_CHUNK_SIZE` (400) events go into **one
  transaction**; more events follow in further transactions of 400. Each step is idempotent: a
  repeated call by the same account (or approving an approved request again) resumes an
  interrupted claim without a second audit entry.
- The client rules are unchanged: an owner still cannot change `createdBy` or `curation`
  (rules tests "after a claim the new owner ...").

### `import_claim_requests/{organizerId}_{uid}`

`{ uid, organizerId, userEmail, proof: 'domain' | 'none', status: 'pending' | 'approved' |
'rejected', createdAt, decidedAt?, decidedBy? }`. Written only by the callables; the rules give
Super-Admins read and delete, nobody (Super-Admins included) create or update from the client.
One request per organizer and account: a pending one is returned again, a rejected one answers
`request-rejected`. There is no admin UI for the requests yet (admin tab, ticket 4).

### UI

- **`/uebernehmen?claim=<token>`** (`ClaimEventsPage`, lazy, `noindex`, `referrer:
no-referrer`). The page reads the token once, removes it from the address bar
  (`history.replaceState`) and keeps it in `localStorage` (`pendingClaimToken`, 14 days), so it
  is never in `from`, a Referer, GA (page views drop the query anyway) or the confirmation mail.
  Guests get "Konto anlegen" / "Ich habe schon ein Konto" (`/login` with `from: '/uebernehmen'`).
  `register()` sends `afterVerify: 'claimEvents'` while a token waits, so the confirmation link
  leads back with `next=/uebernehmen` (`AFTER_VERIFY_PATHS` on both sides). An unconfirmed
  account sees the verification banner (re-checked on focus and every 15 s). Then the page
  calls `claimCuratedEvents({ token })` and shows the result in German. Ticket 5's preview page sends
  "Ich verwalte meine Veranstaltungen selbst" (`self_manage`) here after recording the intent. `uebernehmen` is a reserved username.
- **Banner** in Verwaltung -> "Meine Events" (`ClaimableEventsBanner`): for confirmed accounts
  when `listMyClaimableEvents` finds events; "Events übernehmen" or "Später" (both hide it for
  good in this browser, `claimBannerDismissed:{uid}`).
- **Wizard hint** (`CuratedMatchHint`, step 3 under date/time): only signed-in members with a
  confirmed address, 800 ms debounce, errors ignored. "Übernehmen" calls
  `claimCuratedEvents({ organizerId })` (exact address: claim, else a request).

### Mails before and after the claim

| Mail                                                  | Recipient                                      | Before the claim                                                                | After      |
| ----------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------- | ---------- |
| Status mails (approved, rejected, Rückfrage, trashed) | `organizer.email` (`notificationRouting.ts`)   | empty on curated events: no mail                                                | new owner  |
| Kerzenraum message to the organizer (`chat.ts`)       | account of `createdBy`                         | curator mailbox; only possible for approved (= consented) events                | new owner  |
| "Zum Event anmelden" (`eventRegistration.ts`)         | account of `createdBy`, else `organizer.email` | **curator mailbox** for consented, approved, unclaimed events (see open points) | new owner  |
| Favorite cancelled (`eventCancellationNotify.ts`)     | favoriters, never `createdBy`                  | unaffected                                                                      | unaffected |

## Open points

- Preview / mail: consent wording (checkboxes, mail, `/datenschutz-import`) is a draft, not
  lawyer-approved. The mail uses "du" like the rest of the site.
- Preview: the link lives 7 days, the data 90: after day 7 the organizer can only answer by
  reply mail (the mail says so); a Super-Admin can make a fresh link with `createPreviewLink`
  (`regenerate: true`) and pass it on by hand, never a second mail.
- Preview: the static `index.html` still carries the site's default `og:image`; crawlers that do
  not run JavaScript see it (never the organizer's images). `X-Robots-Tag` keeps the page out of
  indexes.
- Outreach: Mailgun sends as `MAILGUN_FROM` (`admin@mg.thetribe.at`) with Reply-To
  `admin@thetribe.at`, not literally from admin@thetribe.at.
- Outreach: replies ("Nein") reach the admin inbox; declining by reply has to be done by hand
  (there is no admin action for it yet).
- Images: `scopes.persons` is recorded but does not gate the copy (only `scopes.images` does).
- No admin UI for preview link / outreach yet (callables only).

- The public JSON (`toPublicEvent`) passes `curation` through for consented events
  (`organizerRef`, `sourceUrl`); strip it if the UI does not need it.
- Region moderators can read curated pending events of their region (as every pending event) but
  cannot approve them before consent.
- Claim: a consented, approved curated event that is not claimed yet sends "Zum Event anmelden"
  registrations and Kerzenraum mails to the curator mailbox (`createdBy`). Either hide the
  registration button on unclaimed curated events or forward those mails before going live.
- Claim: the Admin-SDK update of the events is seen by the event triggers as an ordinary edit
  (revision / moderation log). Not verified against a real project.
- Claim: `contactEmail` should be stored lower-case by the import (ticket 3); the lookup asks
  the exact and the lower-cased spelling only.
- Claim requests have no admin UI and no mail to the Super-Admins yet.
