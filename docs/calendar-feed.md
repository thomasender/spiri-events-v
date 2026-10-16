# Kalender-Export (.ics download and subscription)

**Read this when** you touch `calendarFeed`, `getCalendarFeedToken`, `calendarRoutes.ts` or the
"im eigenen Kalender speichern" UI. Region/combined-view feed parameters: [regions.md](./regions.md) section 9.

Only for signed-in users, like Favoriten (no verified e-mail needed). Calendar
apps cannot send a Firebase login or App Check token, so every calendar URL
carries the user's personal secret: `?token=` on `/calendar/feed.ics` and
`/calendar/event/<slug>.ics`.

- **Token:** `calendarFeedTokens/{uid}` = `{ token, createdAt }`, 32 random bytes
  base64url. Server-only collection (`firestore.rules` denies every client
  access). Issued by the callable `getCalendarFeedToken`
  (`functions/src/calendarFeedToken.ts`): `{}` returns/creates it,
  `{ regenerate: true }` replaces it ("Neuen Link erzeugen" in the calendar),
  `{ revoke: true }` deletes it (called by account deletion in `useAuth`).
- **Check:** `calendarFeed` validates the format first (`calendarRoutes.ts`),
  then looks the token up (5 min in-memory cache) and also refuses tokens of
  deleted or disabled accounts. Missing/unknown token: `401`, `no-store`.
- **Caching:** valid responses stay `public, s-maxage=3600`; the Hosting CDN
  keys on the full URL including the token. A revoked token can therefore
  still be served from the CDN for about an hour.
- **Revoke by hand:** delete `calendarFeedTokens/{uid}` in the Firestore console
  (the user gets a new token the next time they open the export).
- The frontend asks for the token only when the user opens "im eigenen Kalender
  speichern" or clicks "Zum Kalender hinzufügen" (`useCalendarFeedToken`).
