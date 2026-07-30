# Plan: Profil Verwaltung (Profile Management)

**Ticket:** [qGMTOAUu](https://trello.com/c/qGMTOAUu) — Profil Verwaltung
**Board:** MVP TODOs
**Type:** Feature (new page + new Firestore collection + Auth changes)

## Context & Goal

Users currently have no way to view or change their own data, and no way to delete their account. After registering they only see their events in `/admin` — there is no profile page, no account menu, no email-change path, no delete-account path.

The ticket requests a profile page where a signed-in user can manage:
- Name (Anzeigename)
- E-Mail (the ticket itself asks whether this should also update the Firebase Auth login email — confirmed: yes)
- Profile photo (Profilfoto)
- Link to a private website
- Contact option (Kontaktmöglichkeit; pre-populated with the Auth email, but editable)
- Short bio (max 500 characters)
- Delete the account

## Acceptance Criteria

A signed-in user can:
1. Navigate to `/profil` via a new header link.
2. See their current profile data pre-filled in a form.
3. Edit Name, Bio (≤ 500 chars), Website link, Contact, and Profile photo, then save. Changes persist to Firestore.
4. Change their login email — must re-enter the current password (reauth) before the change takes effect. Firebase Auth email is updated; `emailVerified` may become false (standard Firebase behavior).
5. Upload a new profile photo (client-side compressed, stored in Firebase Storage at `users/{uid}/avatar/...`); replace or remove an existing photo.
6. Delete their account via a confirmation modal. Requires re-entering password. After confirmation: Auth user is deleted, `users/{uid}` profile doc is deleted, all files under `users/{uid}/` in Storage are deleted. The user's previously created events are NOT deleted (UI already falls back to "Unbekannt" for missing createdBy profiles; verified in `EventDetailPage`).
7. All operations show clear German validation/error messages and a success toast.

A signed-out user visiting `/profil` is redirected to `/login`.

## Affected Areas

**New files**
- `src/pages/ProfilePage.jsx` + `src/pages/ProfilePage.css`
- `src/components/ProfileForm.jsx` + `src/components/ProfileForm.css` (form + fields)
- `src/components/ChangeEmailForm.jsx` + `src/components/ChangeEmailForm.css` (email section, requires reauth)
- `src/components/DeleteAccountSection.jsx` + `src/components/DeleteAccountSection.css` (danger zone + confirmation modal)
- `src/components/ProfilePhotoUpload.jsx` (reuses compression from `imageUpload.js`)
- `src/hooks/useProfile.js` (subscribe to + update `users/{uid}` doc)
- `tests/integration/profile.spec.ts` (Playwright integration tests)
- `tests/components/ProfilePage.spec.tsx` (Vitest component tests)

**Modified files**
- `src/App.jsx` — add `/profil` route under `ProtectedRoute`
- `src/components/Header.jsx` — add "Mein Profil" link next to "Verwaltung"
- `src/hooks/useAuth.js` — extend `register()` to create initial `users/{uid}` doc; add `reauthenticate(password)`, `changeEmail(newEmail, password)`, `deleteAccount(password)` helpers
- `src/lib/imageUpload.js` — generalise `uploadImage` to accept a storage path prefix, OR add `uploadProfileImage(file, uid)` (recommend the latter to keep event-uploads untouched)
- `firestore.rules` — add `match /users/{uid}` (read self; write self)
- `storage.rules` — add `match /users/{uid}/{filename}` (write self only; read public so avatars show in event lists if we ever wire that)
- `firestore.indexes.json` — no changes expected (single-doc reads)
- `data-export/firestore-export/manifest.json` — `users` is already listed; export script (`scripts/export-firestore.mjs`) may need updating to handle the new collection (verify during implementation)
- `tests/__mocks__/firebase.ts` — extend mocks for new auth methods (`EmailAuthProvider`, `reauthenticateWithCredential`, `updateEmail`, `deleteUser`)

## Approach

### Data model — `users/{uid}` Firestore document

```js
{
  displayName: string,           // max 80 chars
  bio: string,                   // max 500 chars
  website: string,               // URL or empty
  contact: string,               // free-form (email, phone, "DM @handle"…) — pre-filled with auth email on create
  photoURL: string | null,       // Firebase Storage download URL
  createdAt: serverTimestamp,    // set on register
  updatedAt: serverTimestamp     // updated on every profile save
}
```

The `email` field lives on Firebase Auth (not duplicated in Firestore), since changing it must trigger a Firebase Auth update anyway. Display code reads `user.email` from the auth hook, never from the Firestore doc.

The `role` / `admin_users` collection is **unchanged**. Admin role is still resolved via `useAuth` (`getIdTokenResult` + Firestore fallback).

### Email change

Firebase requires reauthentication for sensitive operations (`updateEmail`, `deleteUser`). We use `EmailAuthProvider.credential(email, password)` + `reauthenticateWithCredential`, then `updateEmail`. Standard Firebase pattern.

If `updateEmail` succeeds and the email domain is not in the user's trusted providers, `emailVerified` becomes false. We do **not** trigger `sendEmailVerification` automatically — that's a separate concern. We surface a non-blocking warning in the UI.

### Account deletion order (important)

1. Reauth.
2. Delete the profile photo from Storage (`users/{uid}/avatar/...`).
3. Delete the `users/{uid}` Firestore doc.
4. Delete the Firebase Auth user (`deleteUser`).
5. Sign out + redirect to `/`.

If step 4 fails after steps 2 & 3, log a warning and show a German error — the user's data is mostly gone but we don't force-signout a session whose Auth user is still valid (we just `signOut` and ask them to retry deletion).

### Photo upload

Reuse `compressImage` from `imageUpload.js`. Add `uploadProfileImage(file, uid)` that uploads to `users/{uid}/avatar/{timestamp}_{name}`. On the form, deleting the current photo also calls `deleteImageByUrl` against the same path.

### Header link

Insert a single new `Link to="/profil"` in `Header.jsx:39-53` between "Verwaltung" and "Event erstellen", using `UserCircle` from `lucide-react`. Text: "Mein Profil".

### Routing

Add a single `<Route path="/profil" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />` in `App.jsx` alongside the existing protected routes.

## Implementation Steps

1. **Branch** — `git checkout -b feature/qGMTOAUu_profile-management`.
2. **Firestore rules** — add `match /users/{uid}` block in `firestore.rules`:
   - `allow read: if isAuthenticated() && request.auth.uid == uid;`
   - `allow create: if isAuthenticated() && request.auth.uid == uid && request.resource.data.keys().hasOnly(['displayName','bio','website','contact','photoURL','createdAt','updatedAt']);`
   - `allow update, delete: if isAuthenticated() && request.auth.uid == uid;`
3. **Storage rules** — add `match /users/{uid}/{filename}` block in `storage.rules`:
   - `allow read: if true;` (avatars may appear anywhere)
   - `allow write: if isAuthenticated() && request.auth.uid == uid && request.resource.size < 15*1024*1024 && request.resource.contentType.matches('image/.*');`
4. **`useProfile` hook** — `src/hooks/useProfile.js`. Subscribes to `users/{uid}` doc with `onSnapshot`, returns `{ profile, loading, save }`. `save()` writes the doc via `setDoc` (merge) with `updatedAt: serverTimestamp()`.
5. **`useAuth` extensions** — add helpers (don't break the existing `register`/`login`/`logout` contract):
   - `reauthenticate(password)` — uses `EmailAuthProvider.credential(auth.currentUser.email, password)` + `reauthenticateWithCredential`. Throws German error message on wrong password.
   - `changeEmail(newEmail, password)` — reauth → `updateEmail`.
   - `deleteAccount(password)` — reauth → delete Storage avatar → delete Firestore profile doc → `deleteUser` → `signOut`.
   - Update `register` to also create `users/{uid}` with `{ displayName, contact: email, createdAt, updatedAt }` (the rest default to empty).
6. **`uploadProfileImage` helper** — extend `src/lib/imageUpload.js` (or add a new sibling file `src/lib/profileUpload.js` — keeping it in `imageUpload.js` is simpler).
7. **Components** — build `ProfileForm`, `ChangeEmailForm`, `DeleteAccountSection`, `ProfilePhotoUpload` with co-located CSS. Follow existing style (German labels, `useState` + native form submit, lucide icons). Reference styling from `AuthForm.css` / `EventForm.css`.
8. **Page** — `ProfilePage.jsx` composes the three sections, plus a loading spinner.
9. **Route + header link** — wire in `App.jsx` and `Header.jsx`.
10. **Tests** — see Testing plan below.
11. **Data export** — re-export production data so `data-export/firestore-export/users.json` is no longer empty (after first user lands). This unblocks future integration tests. Add `users` field handling to `scripts/export-firestore.mjs` if missing.
12. **Lint / typecheck / tests** — `npm run lint`, `npm run typecheck` (note: source is `.jsx`, types may be limited), `npm run test:all`.

## Edge Cases & Risks

- **Re-auth popup / new-password field** — for now use a simple password prompt. If we later want OAuth providers, this expands; not in scope.
- **Email change while another tab is open** — Firebase Auth will pick it up via `onAuthStateChanged`. No extra handling needed.
- **Concurrent profile edits** — last-write-wins. Acceptable for an MVP; no locking.
- **Bio overflow** — clamp on the client with `maxLength={500}` and a live counter; also enforce in Firestore rules via `request.resource.data.bio.size() <= 500`.
- **Photo too large** — `compressImage` + `MAX_INPUT_SIZE_BYTES` already cover this; surface a German error if compression itself fails (already does at `imageUpload.js:59`).
- **Orphaned events on delete** — events keep `createdBy = <deleted uid>`; `EventDetailPage` already handles missing profiles (UI shows "Unbekannt"). Confirmed in earlier exploration.
- **Admin role** — deleting a user's account does NOT touch `admin_users/{uid}`. Add cleanup there if/when an admin-self-delete becomes relevant. For MVP, an admin who deletes themselves effectively loses admin role on next login (since `admin_users/{uid}` is checked but the Auth user is gone).
- **Refresh after delete** — `onAuthStateChanged` will fire `null`; the layout redirects are handled by `ProtectedRoute`.
- **Custom claim `role`** — unchanged. Admin role still flows through the token + `admin_users` fallback. `register()` does not set a claim.
- **First-time user without a profile doc** — `users/{uid}` doesn't exist yet (legacy users who registered before this feature). The `useProfile` hook must handle a missing doc gracefully (treat it as empty default values, and `save()` creates the doc).

## Testing Plan

Per `AGENTS.md`, every feature needs automated tests.

### 1. Playwright integration tests — `tests/integration/profile.spec.ts`

Use existing `signInWithEmailAndPassword` / `clearEmulatorData` helpers from `tests/helpers/auth.ts`.

- `user can navigate to /profil from header`
- `user sees existing profile values prefilled` (using a seeded `users/{uid}` doc)
- `user can edit name, bio, website, contact and save — values persist after reload`
- `user can upload a profile photo — file appears in Storage at users/{uid}/avatar/*`
- `user can remove an existing profile photo`
- `bio is rejected when longer than 500 characters`
- `change email requires current password and updates Firebase Auth email`
- `change email fails with a German error on wrong password`
- `delete account requires current password — confirms modal — then auth user and profile doc are gone`
- `unauthenticated visit to /profil redirects to /login`

### 2. Vitest component tests — `tests/components/ProfilePage.spec.tsx`

- Renders loading state then sections once `useAuth` resolves.
- Form fields are pre-filled from `useProfile`.
- Submitting the form calls `save` with the right payload.
- Delete-account button is disabled until reauth succeeds.

### 3. Firebase mock extension

Add stubs to `tests/__mocks__/firebase.ts` for `EmailAuthProvider`, `reauthenticateWithCredential`, `updateEmail`, `deleteUser`, `onSnapshot`, `setDoc`, `doc`, `getDoc`, `serverTimestamp`.

### 4. Verification

Run all three suites locally against the emulators:
```bash
firebase emulators:start --import ./data-export &
npm run test:all
npm run lint
```

## Out of Scope

- Public profile pages (other users viewing this user's profile) — not requested.
- Email verification flow / verification banner after `updateEmail` resets `emailVerified`.
- Self-service admin role management.
- Two-factor authentication.
- Bulk user import/export.
- GDPR data-export endpoint (separate ticket likely needed).
- Migrating legacy `displayName` from Firebase Auth into the new `users/{uid}` doc on first login (acceptable to leave legacy `displayName` as a fallback display source in the header for users without a Firestore profile doc).