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

Ticket 1 is the data model, rules, helpers, leak guards and the curator account. Ticket 7 adds
the **claim** (an organizer takes the curated events over into an own account, see "Claim"
below). Crawling, the review UI, the preview page, the outreach mail and the consent callable
follow in other tickets.

## Code

| Where                                                                        | What                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `functions/src/eventImport.ts`                                               | Pure module (no Firebase): constants/enums, `fingerprint`, `blocklistId` / `blocklistKind` / `isBlocked`, `isCuratedEvent`, `isCuratedWithoutConsent`, `countsForActivation`, `isImageUrlAllowed`, `candidateToEventData`, `hashPreviewToken`, `claimTitleSimilarity` |
| `src/utils/eventImport.js`                                                   | Synced copy of the constants and the two predicates (for scripts such as `prerender.mjs` and a later admin UI) plus the pure core of the curator script. `tests/lib/eventImport.spec.ts` fails on drift.                                                              |
| `scripts/ensure-curator-account.mjs`                                         | Curator account (see below)                                                                                                                                                                                                                                           |
| `firestore.rules`                                                            | `import_*` blocks, `events` (`isCurationUntouched`, `isCuratedApprovalWithoutConsent`), `app_settings/import` read                                                                                                                                                    |
| `functions/src/eventImportClaim.ts`                                          | Claim callables `claimCuratedEvents`, `approveClaimRequest`, `listMyClaimableEvents`, `findCuratedMatches` (pure decision helpers, handlers with injected deps, wiring)                                                                                               |
| `src/utils/eventClaim.js`, `src/lib/eventClaim.js`                           | Claim token storage and German messages; callable wrappers (inert stand-in in `tests/vitest.setup.ts`)                                                                                                                                                                |
| `src/pages/ClaimEventsPage.jsx`                                              | `/uebernehmen?claim=<token>`                                                                                                                                                                                                                                          |
| `src/components/ClaimableEventsBanner.jsx`, `CuratedMatchHint.jsx`           | Banner in Verwaltung -> "Meine Events"; hint in step 3 of the event wizard                                                                                                                                                                                            |
| `tests/lib/eventImportClaim.spec.ts`, `tests/components/eventClaim.spec.tsx` | Claim logic (in-memory world) and claim UI                                                                                                                                                                                                                            |
| `tests/lib/eventImport.spec.ts`                                              | Helper tests                                                                                                                                                                                                                                                          |
| `tests/rules/regions.rules.spec.ts`                                          | Rules tests ("event import")                                                                                                                                                                                                                                          |

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
  calls `claimCuratedEvents({ token })` and shows the result in German. Ticket 5's preview page
  ("self_manage") links here. `uebernehmen` is a reserved username.
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

- Each curated event written as `pending` triggers the usual "neues Event eingereicht" mail to
  the admins (`onEventCreated`). A bulk import may want to suppress it.
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
