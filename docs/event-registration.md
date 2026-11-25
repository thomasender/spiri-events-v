# Event registration ("Zum Event anmelden")

Read this when you touch the registration button / modal, `submitEventRegistration`,
`events/{id}/registrations`, the `pendingRegistration` guest flow or its privacy section.

## Admin switch (default: off)

Verwaltung -> Kommunikation -> Chat -> "Event-Anmeldung": On/Off, stored in
`app_settings/eventRegistration { enabled }`. A missing doc means **off**, so the feature stays dark
on every environment until an admin turns it on. Off means: `EventRegistrationButton` renders nothing
(`useEventRegistrationEnabled`), and the callable refuses with `failed-precondition` / `reason:
'disabled'` (`isEventRegistrationEnabled`), so nobody can register by calling it directly either.
Registrations already stored stay untouched. The doc is publicly readable (like all of
`app_settings`), written by admins only (`firestore.rules`, cases in `revisions.rules.spec.ts`).

## What it is

A pure notification, no participant list and no seat limit. Every published, upcoming,
not cancelled event shows a button on the detail page (and in `EventModal`):
"Zum Event anmelden", or "Über Tribe anmelden" when the event has an external
"Anmeldung" text (which stays visible). The form asks for name and **one** contact,
e-mail or phone number (prefilled from the account, editable).

## Flow

- Client: `src/components/EventRegistrationButton.jsx` -> `EventRegistrationModal.jsx`;
  validation, pending storage and the callable wrapper in `src/lib/eventRegistration.js`.
- Callable `submitEventRegistration` (`functions/src/eventRegistration.ts`, pure logic in
  `eventRegistrationLogic.ts`, europe-west3, App Check like every callable, in-memory rate
  limits per caller (uid/IP), per contact and per event):
  1. validates (honeypot `website`), checks the event is approved, not cancelled, not over;
  2. stores `events/{id}/registrations/{auto}` `{ name, contact, contactType, occurrenceDate, uid, createdAt }`;
  3. signed in: creates `users/{uid}/favorites/{eventId}`;
  4. mails the organizer (always, no switch): account e-mail of `createdBy`, else
     `organizer.email`, else an e-mail in `kontakt`; none -> `organizerNotified: false` and the
     modal tells the guest to use the event's contact data. Reply-To = the guest's e-mail;
  5. e-mail contact only: one confirmation per event and address, guarded by the marker
     `events/{id}/registration_mails/{sha256(email)}` (`create()` fails when it exists).
- The date is written colloquially, in the form ("Du meldest dich an für: ...") and in both mails:
  "heute Dienstagabend um 19:30 Uhr", "morgen Mittwochvormittag um 10:00 Uhr", "diese Woche am
  Freitagmorgen um 8:00 Uhr" (until Sunday of the current week), otherwise "am Dienstag, 24. November,
  abends um 19:30 Uhr" (year only when not the current one); without a time only the day. Parts of
  the day: morgens 5-10, vormittags 10-12, mittags 12-14, nachmittags 14-18, abends 18-22, nachts
  22-5. "Today" is the day in Europe/Vienna. Pure function `describeOccurrence(date, time, now)` in
  `functions/src/occurrenceDescription.ts` with an identical client twin
  `src/utils/occurrenceDescription.js` (change both, `tests/components/occurrenceDescription.spec.ts`
  runs the same cases against both).
- Series: the chosen date (`occurrenceDate`) comes from `?occurrenceDate=` on the detail page. List
  links carry none by design, so `EventRegistrationModal` falls back to
  `getNextUpcomingOccurrence(event)`, then `event.date`, and sends that date. The callable itself
  falls back to `event.date` only for single events, never for a series.
- Templates: `buildEventRegistrationOrganizerPayload` / `buildEventRegistrationConfirmationPayload`
  in `emailTemplates.ts`.

## Guests

After submitting, a guest sees "Konto erstellen" / "Ich habe schon ein Konto". Before that the
modal stores `sessionStorage.pendingRegistration = { eventId, eventTitle, name, email }`; the
links pass `authMode`, `email`, `displayName`, `registrationEventTitle` as router state to
`AuthForm` (prefill + hint). Once signed in, `favoritesStore` saves the favorite and clears the
key; `useAuth.register` reads the event id first and sends it as optional `pendingEventId` to
`sendVerificationEmail`, whose mail then names the event. The organizer was already informed
at submit time, verified account or not.

## Data, rules, retention

- `firestore.rules`: `registrations` readable by the event owner and admins only, no client
  writes; `registration_mails` server-only. Cases in `tests/rules/revisions.rules.spec.ts`.
- `purgeExpiredEvents` deletes both subcollections once the event's last date has passed (the
  event itself goes 30 days later). Privacy policy: section "Anmeldung zu Events" in
  `LegalPage.jsx`.
- Regions: nothing region-specific; mails never name a region (dark launch safe).
