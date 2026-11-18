# Push notifications (PWA, event review)

> Read this when you touch Web Push: `public/push-sw.js`, `src/lib/pushMessaging.js`, the push
> part of `NotificationPreferencesCard.jsx`, `functions/src/push.ts` / `pushRouting.ts`, or `pushTokens`.

Web Push via Firebase Cloud Messaging (FCM) for event review topics only (Trello 6afe0f78). No
chat, Kerzenraum, favourites or campaigns. E-mail stays the reliable channel and is unchanged.

## Switched off until a VAPID key exists

Everything hangs on the build variable `VITE_FIREBASE_VAPID_KEY`. While it is empty (today):
no push part in the profile, no permission prompt, no token, the Messaging SDK is never
loaded (`pushSupportState` returns `'disabled'`, `PushTokenRefresh` does nothing). The
functions still run their push step, but nobody has a token or an opt-in, so nothing is sent.

## How it is built

| Part                                                                                   | Where                                                                      |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `push` + `notificationclick` handlers (no Firebase SDK, data-only payload)             | `public/push-sw.js`, pulled into the Workbox SW by `workbox.importScripts` |
| Support state, permission (only on click), token, refresh on app start, logout cleanup | `src/lib/pushMessaging.js`, `usePushDevice`, `PushTokenRefresh`, `useAuth` |
| Profile switch + topics                                                                | `NotificationPreferencesCard.jsx`                                          |
| Who gets what (pure, Vitest)                                                           | `functions/src/pushRouting.ts`                                             |
| Sending, dead-token cleanup                                                            | `functions/src/push.ts`                                                    |
| Hooks into the mail triggers                                                           | `notifications.ts`                                                         |

There is one service worker (vite-plugin-pwa, `autoUpdate`), no `firebase-messaging-sw.js`.
`getToken` gets the existing registration (`serviceWorkerRegistration`). In `npm run dev` there
is no service worker, so push cannot be tried locally; use a build (`vite preview`) or staging.

**Data.** `users/{uid}/pushTokens/{sha256(token)}` = `{ token, platform, createdAt, lastSeenAt }`,
owner-only in the rules (`tests/rules/users-onboarding.rules.spec.ts`). The device remembers
"push on for this account" in `localStorage` (`tribe.pushDevice.<uid>` = the hash). Switching off,
logging out and deleting the account delete the token doc; FCM's "not registered" answers
delete it server-side. Opt-ins on `users/{uid}` (default **false**): `pushOnEventStatus`,
`pushOnReviewMessage`, `pushStaffReview` (`userPreferences.ts`, rules whitelist). Switching on the
first device turns the topics on; they then apply to every device of the account.

**Who gets what** (texts carry only the event title, never chat content):

| Event                                                  | Recipient               | Opt-in                |
| ------------------------------------------------------ | ----------------------- | --------------------- |
| approved (`published` after pending/draft/trash)       | organizer (`createdBy`) | `pushOnEventStatus`   |
| rejected                                               | organizer               | `pushOnEventStatus`   |
| team question in the review chat (`changes_requested`) | organizer               | `pushOnReviewMessage` |

Reused decisions: `decideEventStatusNotification`, `decideAdminMessageNotification`. Not pushed:
back to draft, deleted, edits of an approved event. Never the person who caused it
(`approvedBy` / `trashedBy` / message author). The push runs before and independent of the mail
(`sendPushPlan` never throws, also when Mailgun is not configured).

## Platforms

- **Android / Chrome, desktop browsers:** works with the page closed, after the permission.
- **iPhone / iPad:** only iOS/iPadOS **16.4+**, and only in the app added to the home screen
  (Safari: Teilen -> "Zum Home-Bildschirm"), opened from there. In a Safari tab there is no
  push; the profile says so (`'ios-tab'`). The permission prompt only appears after a tap.
- Blocked permission: the profile explains how to allow it again in the browser settings.

## Manual setup (once per project, by hand)

1. Firebase console -> project **spirieventsvbg** -> Project settings -> **Cloud Messaging** ->
   "Web configuration" / **Web Push certificates** -> **Generate key pair**. Copy the public key.
2. Same for **tribe-vbg-staging** (each project has its own key pair).
3. GitHub -> Settings -> Secrets and variables -> Actions -> **Variables**:
   `VITE_FIREBASE_VAPID_KEY` = production key, `STAGING_VITE_FIREBASE_VAPID_KEY` = staging key.
   (A public key, so a variable, not a secret; read by `deploy.yml` / `deploy-staging.yml`.)
4. Check that the **Firebase Cloud Messaging API** (V1) is enabled in Google Cloud for both
   projects (console -> APIs & Services). The functions' default service account may send.
5. Deploy (push to main / staging). The next build shows the push part in the profile.

## Testing

Vitest only (no Playwright: push cannot be checked meaningfully in a browser test):
`tests/lib/pushRouting.spec.ts`, `tests/lib/push.spec.ts`, `tests/components/pushMessaging.spec.ts`,
`NotificationPreferencesCard.spec.tsx`, `userPreferences.spec.ts`, rules spec above.
By hand on staging: Android Chrome and an iPhone with the app on the home screen; switch on in
the profile, then approve / reject / ask a question as another account.
