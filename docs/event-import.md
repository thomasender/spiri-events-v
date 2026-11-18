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

Ticket 1 (this state) is the data model, rules, helpers, leak guards and the curator account.
Crawling, the review UI, the preview page, the outreach mail and the consent callable follow in
later tickets.

## Code

| Where                                | What                                                                                                                                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `functions/src/eventImport.ts`       | Pure module (no Firebase): constants/enums, `fingerprint`, `blocklistId` / `blocklistKind` / `isBlocked`, `isCuratedEvent`, `isCuratedWithoutConsent`, `countsForActivation`, `isImageUrlAllowed`, `candidateToEventData` |
| `src/utils/eventImport.js`           | Synced copy of the constants and the two predicates (for scripts such as `prerender.mjs` and a later admin UI) plus the pure core of the curator script. `tests/lib/eventImport.spec.ts` fails on drift.                  |
| `scripts/ensure-curator-account.mjs` | Curator account (see below)                                                                                                                                                                                               |
| `firestore.rules`                    | `import_*` blocks, `events` (`isCurationUntouched`, `isCuratedApprovalWithoutConsent`), `app_settings/import` read                                                                                                        |
| `tests/lib/eventImport.spec.ts`      | Helper tests                                                                                                                                                                                                              |
| `tests/rules/regions.rules.spec.ts`  | Rules tests ("event import")                                                                                                                                                                                              |

## Collections

All four collections (and the `outreach` subcollection) are **Super-Admin only** in
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

`import_organizers/{id}/outreach/{id}`: one doc per mail, `{ sentAt, templateVersion, status }`
(`status`: `queued` \| `sent` \| `bounced` \| `replied` \| `failed`).

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
`curation.consentAt`; the consent callable (later ticket) sets both together with
`consentRecord`.

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
cannot be approved before consent, so today only consented curated events can count. Whether
they should count towards the 15 events at all is open: `countsForActivation(event)` (false for a
curated event without consent) is ready to count them separately, but activation still counts
every approved event. Decide before activating a region that holds curated events.

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

Other places: the **Regionen** tab shows "Import: x von 15 Events, davon y mit Consent" for
inactive import regions with curated events. It is computed **client-side** from bounded reads
(published candidates with an `eventId`, organizers with a publishable consent;
`fetchImportProgress`), not by `adminListRegionActivation`, and does not change the activation
conditions. The **Review** tab marks curated events "importiert" (and "ohne Consent").

## Open points

- Each curated event written as `pending` triggers the usual "neues Event eingereicht" mail to
  the admins (`onEventCreated`). A bulk import may want to suppress it.
- The public JSON (`toPublicEvent`) passes `curation` through for consented events
  (`organizerRef`, `sourceUrl`); strip it if the UI does not need it.
- Region moderators can read curated pending events of their region (as every pending event) but
  cannot approve them before consent.
