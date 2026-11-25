# Event erstellen ohne Konto (guest draft)

> Read this when you touch who may open `/admin/new`, the wizard's draft storage
> (`wizardDraftStorage.js`, `wizardDraftFiles.js`), its end page for guests / unconfirmed
> e-mails, or the `next` of the confirmation mail (`sendVerificationEmail`, `AuthActionPage`).

## What it is

Everybody can fill in the "Event erstellen" wizard: guests, and members whose e-mail is
not confirmed yet. Only **submitting** needs a confirmed account; the rules are unchanged
(`firestore.rules` / `storage.rules`: event and image writes stay with confirmed accounts).

- `/admin/new` has no `ProtectedRoute`; `EventFormPage` renders `EventFormWizard` for
  everybody (keyed by uid, so it starts again from the draft after a login). Editing
  (`/admin/edit/:id`) still needs an account.
- Header, `CreateEventFab`, the calendar CTA and the Verwaltung button link straight to
  `/admin/new` (with `?region=` on a coming-soon page). No locked buttons any more.

## Draft storage

- Text: `localStorage` `eventWizardDraft:{uid}`, for guests `eventWizardDraft:guest`
  (`wizardDraftOwner`). It also keeps the Titelbild crop (`imageFocalPoint`, `imageZoom`) and
  the Instagram choice. A guest draft older than 14 days is dropped when read.
- Photos (Titelbild, extra Instagram photo): IndexedDB `eventWizardDraft` / store `files`,
  key = same owner id, stored as ArrayBuffer (`wizardDraftFiles.js`). A copy stays in memory
  for the running page, so `/login` and back (no reload) restores them at once. Entries older
  than 14 days are pruned on every wizard start. Best-effort: without IndexedDB the person
  uploads the Titelbild again.
- After login / signup the wizard calls `adoptGuestWizardDraft(uid)` and
  `adoptGuestWizardDraftFiles(uid)` once: the guest draft wins over an older account draft
  (fields merged), the guest entries are deleted.
- Both are cleared after a successful save (submit or "Als Entwurf speichern").
- Every save re-checks step 2 (Titelbild required): a draft that lost its photo goes back to
  step 2 instead of being submitted without one.

## End of the wizard (step 4)

- Guest: no "Einreichen" / "Als Entwurf speichern", but "Konto erstellen" / "Ich habe schon
  ein Konto". Both validate steps 2–4, save the draft and go to `/login` with
  `state = { from: '/admin/new…', authMode, createEventDraft: true, displayName?, email? }`
  (pattern of `pendingRegistration`). `AuthForm` shows a short hint and returns to `from`
  after login, signup and Google (Google accounts are confirmed, so "Einreichen" is there).
  Description photos need Storage, so a guest gets "Bilder in der Beschreibung kannst du nach
  der Anmeldung einfügen" instead of an upload.
- Signed in, e-mail not confirmed (`!canCreateEvents`): `EmailVerificationBanner` with its
  own wording ("Mail erneut senden" asks for the link back, see below). The wizard re-checks
  the e-mail on focus / tab switch and every 15 s (`refreshEmailVerified`) and unlocks
  "Einreichen" by itself.
- The hidden organizer e-mail is filled with the account e-mail once signed in, only while
  empty; a guest is not asked for it in step 1.

## Back from the confirmation mail

- `useAuth.register` sends `afterVerify: 'createEvent'` to `sendVerificationEmail` when a
  guest draft reached the last page (`hasGuestWizardDraft`; merely opening the wizard also
  stores a draft); the banner's resend in the wizard does the same.
- `sendVerificationEmail` maps it via the fixed `AFTER_VERIFY_PATHS` to
  `&next=/admin/new` (never a client path, no open redirect). `AuthActionPage` honours `next`
  only from `AFTER_VERIFY_PATHS` in `src/utils/returnPath.js` (else `/`) and navigates with
  `state.afterVerify`; the wizard then opens the draft on step 4.
- Link opened on another device / browser: no draft there, so the wizard says "Dein
  Event-Entwurf liegt im ursprünglichen Browser" and starts empty.

## Tests

Vitest: `wizardDraftStorage.spec.ts`, `wizardDraftFiles.spec.ts` (fake-indexeddb),
`EventFormWizardValidation.spec.tsx` (guest / unconfirmed end page, step-2 check),
`EventFormPage.spec.tsx`, `AuthActionPage.spec.tsx`, `returnPath.spec.ts`,
`useAuth.spec.ts`, `tests/lib/sendVerificationEmail.spec.ts`. Wizard specs seed a Titelbild
with `seedCover()` (in-memory copy of `wizardDraftFiles`).
