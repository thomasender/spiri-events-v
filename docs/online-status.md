# Online status (opt-in)

Read this when you touch the online dot (directory, public profile, member card, Postfach), the
`presence` collection, `useOnlineStatus`, the profile option or the privacy text about it.

Green = online, **no dot = offline or the person does not share** (default; there is no red dot). Only verified,
logged-in members see dots; logged-out visitors never see one.

## Feature flag

`app_settings/onlineStatus { mode: 'off' | 'admins' | 'all' }` (Verwaltung -> Kommunikation -> Chat,
third block). **A missing doc means `admins`** (test mode): only admins see the profile option and the
dots and may write/read `presence`. This is the only flag that does not default to off; set it to
`all` to open it for every member, to `off` to close it. Enforced in the rules (`onlineStatusOpen()`),
the UI follows via `useOnlineStatusAccess`. In test mode a non-admin who ticked the option earlier
cannot beat and shows as red to admins.

## Data and rules (`tests/rules/presence.rules.spec.ts`)

- The opt-in is `showOnlineStatus` (bool) on `users/{uid}` and `users/{uid}/publicProfile/data`
  (`PUBLIC_PROFILE_FIELDS`); saved with the normal profile form ("Meinen Online-Status anzeigen").
  The public profile copy is what the directory and member cards read.
- `presence/{uid}` = `{ lastSeen }`. The rules let a person write it only for themselves, only with a
  server timestamp, only while their public profile has `showOnlineStatus == true` (a `get()` per
  heartbeat) and at most once per 20 s. Reading needs a verified e-mail.
- Online = `lastSeen` younger than 2 minutes (`ONLINE_WINDOW_MS`).

## Client

- `OnlineStatusBeacon` (mounted in `App`) runs `useOnlineBeacon`: beat now and every 60 s while the
  tab is visible; deletes the doc on opt-out, logout, unmount and `pagehide`. A hidden tab stops
  beating and drops offline after 2 minutes.
- `useOnlineStatus()` listens to the whole `presence` collection (only opted-in people write there)
  and returns `statusOf(uid, shares)` -> `'online' | 'offline' | null`. Always pass the person's
  `showOnlineStatus`; `null` means no dot. `OnlineDot` draws it (put it in a `position: relative` wrapper).
- Cost: every beat is one read for each viewer on a page that listens (directory, profile, member
  card, Postfach). Fine for a community this size.
- Not the same as the Lagerfeuer presence strip (`chat_rooms/lagerfeuer/presence`): that shows who has
  the chat open, regardless of this option (the profile help text says so).

## Server

`purgeChatMessages` deletes `presence` docs older than a day. Account deletion removes the doc.

## Privacy

Datenschutzerklärung Abschnitt 16 (+ 2 and 5): consent based, default off.
