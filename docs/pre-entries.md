# Vorab eingetragene Events (pre-entries)

**Read this when** you touch pre-entered events: `functions/src/preEntries*.ts`, the system
account "Dein Tribe" (`systemAccount.*`, `scripts/seed-dein-tribe.mjs`), `/vorschau/:token`,
the admin tab "Vorab eingetragene Events", `app_settings/preEntries` or the rules of
`pre_entries` / `pre_entry_tokens`. Trello 6afb1116.

## What it does

A Regions-Moderator:in or Super-Admin enters an event that already exists elsewhere
(Verwaltung -> Events -> "Vorab eingetragene Events" -> "Event vorab eintragen", which opens
the normal wizard with `?vorab=1` plus a section "Veranstalter-Kontakt (nur intern)"). The
organizer gets a secret preview link and can, without an account, publish the event (under
"Dein Tribe") or decline it. To edit it they create a profile / sign in and take the event
over; from then on it is their own event (normal form, normal review, revision history).

## Data model

- `events/{id}`: stays a normal event. While pre-entered: `status: 'draft'`,
  `createdBy: SYSTEM_UID` (`system-dein-tribe`), `preEntry: true`, `organizer.email: ''`,
  `instagramConsent: false`. **No contact data**: the doc becomes public on approval.
- `pre_entries/{eventId}` (server only): contact data, internal note, status
  (`draft | contacted | published | claimed | rejected`; "abgelaufen" / "in Bearbeitung" are
  derived), link expiry, revocation time, views, contact attempts, organizer comment,
  check-out holder, audit log (capped at 200 entries). Times are epoch millis.
- `pre_entry_tokens/{sha256}` (server only): `{ eventId, kind: 'preview' | 'takeover',
createdAtMs, createdBy, usedAtMs }`. The link carries 32 random bytes (base64url, 43
  chars); only the hash is stored (pattern of `moderatorInvites.ts`). Every "Kontaktieren"
  issues a fresh token, so the moderator always has a link to paste; all preview tokens
  share the entry's expiry and die together on "Alle Links widerrufen". A takeover token
  (after publishing without profile) works once and does not expire with the preview.
- `app_settings/preEntries` (public read, Super-Admin write, validated in the rules):
  `mode` (`off` default / `admins` / `all`), `validDays` (14), `reminderDays` (4),
  `autoDeleteDays` (30, 0 = never), `templates` (only overrides of the built-in texts in
  `src/utils/preEntries.js`). Defaults and limits are duplicated in
  `functions/src/preEntriesLogic.ts`; `tests/lib/preEntries.spec.ts` compares them.

## Functions (`functions/src/preEntries.ts`, europe-west3, App Check like the others)

- `preEntryAdmin({ action })`, staff of the event's region (`list`, `create`, `update`,
  `issueLink`, `extend`, `revoke`, `logContact`, `sendEmail`, `setStatus`, `publish`,
  `checkout`, `checkin`, `delete`). Flag: `all` = all staff, `admins` = Super-Admins; with
  `off` only Super-Admins can still `list` / `delete`.
- `preEntryOrganizer({ action, token })`: `view` (rate-limited, logs the first view),
  `publish` (needs `rightsConfirmed`), `reject` (optional comment), `claim` (signed in;
  optional `publish`). With the flag `off` every link reads as gone.
- `preEntriesDaily` (04:20 Vienna): logs the expiry once; with `autoDeleteDays > 0` deletes
  expired / rejected entries (incl. tokens and the still system-owned event) that many days
  later. Published or taken-over entries are never deleted automatically.
- The moderator who entered the event gets a mail on first view, publish, reject and takeover.

Publishing by the organizer (unchanged content prepared by staff) approves at once
(`approvedBy` = the moderator who entered it); a takeover before publishing gives the
organizer a draft, and their edits go through the normal review ("verändert -> zur Prüfung").

## Editing by staff

The event belongs to the system account, so the rules give moderators no direct access
(tests in `tests/rules/regions.rules.spec.ts`). "Bearbeiten" checks the event out
(`createdBy` = the moderator), opens the normal edit form, and saving checks it back in
(`EventForm`, `isPreEntry`). Super-Admins could edit directly but use the same flow.

## System account "Dein Tribe"

`SYSTEM_UID = 'system-dein-tribe'`, username `dein-tribe` (reserved). Disabled Auth user,
profile page `/dein-tribe`, never in the directory. Exceptions: no owner mails
(`notificationRouting.ts`), online events count as staff (`onlineEventEligibility`), the
event page shows "Eingetragen von Dein Tribe" and does not link the organizer name to the
system profile. Seed (dry run by default, allowlisted projects only):

```bash
node scripts/seed-dein-tribe.mjs --project tribe-vbg-staging          # dry run
node scripts/seed-dein-tribe.mjs --project tribe-vbg-staging --apply
```

## Privacy

Datenschutzerklärung section 21 (`#vorab-eintraege`, Art. 14 DSGVO) and a bullet in the
Nutzungsbedingungen (section 4). `/vorschau/**` is `noindex` (meta, `X-Robots-Tag` and
`Referrer-Policy: no-referrer` in `firebase.json`, `robots.txt` incl. AI crawlers); the
token is cut from analytics paths (`redactSecretPath`). The staging mirror drops both
collections.
