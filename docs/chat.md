# Community chat "Lagerfeuer"

Read this when you touch the chat (`/chat`, `ChatPage`, `useChat`, the admin tab "Chat",
`chat_*` collections, `functions/src/chat.ts`) or its privacy text.

One room per active region for logged-in members with a verified e-mail. Plain text plus emoji.
Guests read along without writing (below).

## Guests read along (Trello 6af1955f)

- **Who:** with flag mode `all`, visitors without login and signed-in people whose e-mail is not
  verified yet see the "Lagerfeuer" nav link (`useChatAccess().readable`) and open `/chat`
  read-only. Mode `admins` / `off`: nothing changes for them (no link, 404).
- **Only messages marked for guests:** every message sent since then carries
  `guestReadable: true` (`useChat.send`); the rules let guests read a message only with that
  marker (`resource.data.get('guestReadable', false) == true`, only in mode `all`, only in an open
  room). Older messages were written under "members only" and stay that way until the 10-day
  purge; that is why there is a marker and not simply an open read rule. The guest query is
  `where('guestReadable', '==', true)` + `orderBy('createdAt', 'desc')` (composite index on
  `messages` in `firestore.indexes.json`; without it the guest view shows the load error).
- **What guests do not get:** presence (no heartbeat, no listener; the rules deny it anyway),
  member card (names are not clickable), reactions (pills visible but disabled), reports, delete,
  the unread bubble and the rules dialog. Instead of the input: "Melde dich an, um im Lagerfeuer
  mitzuschreiben" (link to `/login`, back to the room afterwards), or for unverified people the
  "E-Mail bestätigen" button. Cooldown markers (`members/*`) have no read rule at all.
- **What guests still see in the message doc** (rules cannot hide fields): `authorUid`,
  `authorName`, `authorPhotoURL`, the `mentions` map (uid -> name) and the `reactions` map
  (uid -> emoji), the same as in the public Kerzenraum.
- **Members are told:** the page header says "Schreiben können alle Mitglieder, mitlesen können
  alle" (mode `all`), and the chat rules name the new audience; their localStorage key was renamed
  to `chatRulesAccepted2`, so everyone confirms them once more before writing.
- `/chat` stays `noindex`. Privacy: Datenschutzerklärung section 14.

## One Lagerfeuer per region (Trello 6aef2dad)

- **Room ids:** Vorarlberg keeps `chat_rooms/lagerfeuer` (no migration, history stays); every
  other region's room is `chat_rooms/{regionId}` (`chatRoomIdFor(regionId, regionMode)` in
  `src/utils/chat.js`, `chatRoomRegionId` the other way round). `chat_rooms/vorarlberg` is never used.
- **Dark launch:** with fewer than two active regions everything is as before: room
  `lagerfeuer`, title "Lagerfeuer", no region name, no chooser (`resolveChatRoom` with
  `regionMode` false). From two active regions on the room follows the region, but the title stays
  plain "Lagerfeuer" for members (Peter: the region is clear anyway); only Admins see "Lagerfeuer <Region>".
- **Which room /chat shows** (`useChatRoom`, pure `resolveChatRoom`): the person's own: region of
  the header place (`placeSelection.regionId`, "Wo bist du?"), else of the Feuerplatz in the profile
  (`regionForPosition`, Bundesland / Kanton / Liechtenstein outlines loaded on demand, so a
  Feuerplatz in Germany gives none), else the last region this browser visited
  (`tribe:lastRegion`, only if active; `ownChatRegionId`, Trello K0Ord0L9), and only then Vorarlberg's. Members cannot switch fires (Peter, Trello
  6aef2dad: regional is the USP); `?raum=` and the select "Anderes Feuer" (navigates to
  `/chat?raum=<id>`) exist for Admins only (`canChoose`). Own region not open yet: hint "Das
  Lagerfeuer deiner Region startet, sobald die Region online geht", no chat, no chooser.
- **Access is soft (rules only, the UI limits members to their own fire):** whoever has chat access reads and writes in every active fire
  (`isChatRoom(roomId)` in the rules: `lagerfeuer` or a valid region id other than `vorarlberg`
  whose `regions/{id}` doc is `active`). Own data in a room of a region switched off again stays
  deletable (`isChatRoomId`, no `get`). Kerzenräume are unchanged.
- **Moderation:** Regions-Moderator:innen may delete messages in their region's room
  (`isRegionModeratorFor(chatRoomRegion(roomId))`, `lagerfeuer` counts as Vorarlberg; the
  delete button shows for them only in region mode). Nothing else: no mute/ban, no reports.
- **Unread bubble:** only the person's own room counts; seen marker per room
  `lagerfeuerSeen:<uid>:<roomId>`, Vorarlberg's `lagerfeuer` keeps `lagerfeuerSeen:<uid>`.
- **Reports** carry an optional `roomId` (set only for a region's room, absent = `lagerfeuer`);
  the admin tab names "Lagerfeuer <Region>" with a link, `useChatAdmin.deleteMessage(messageId,
eventId, roomId)` deletes there; the report mail says "im Chat „Lagerfeuer <Region>“" only with
  two or more active regions.
- **Logout / account deletion** clean presence, messages, reactions and markers in `lagerfeuer`
  plus every active region's room (`chatRoomIdsToClean`; logout uses the regions this page
  already loaded, account deletion also queries `regions where active == true`).
- **Server:** `purgeChatMessages` walks `chat_rooms` with `listDocuments()` (room docs are never
  written, only subcollections); `onLagerfeuerMention` listens on
  `chat_rooms/{roomId}/messages/{messageId}` and stores `roomId` on the notification, the bell
  links to `/chat?raum=<roomId>#msg-<id>` (old notices without `roomId`: `/chat#msg-<id>`).
  The `@` search stays platform-wide.

## Feature flag

`app_settings/chat { mode: 'off' | 'admins' | 'all' }`, switched in Verwaltung -> Kommunikation -> Chat.
A missing doc means off. `admins` lets only admins in (testing); `all` also lets guests read along
(above). **The rules enforce the flag** (`chatAccessible()`, plus `chatMode() == 'all'` for the guest
read), the UI only hides the nav link / shows a 404. Turning it off hides the room
at once for everyone; messages stay until the purge.

## Data (all in `firestore.rules`, tests in `tests/rules/chat.rules.spec.ts`)

| Path                                    | What                                                                                                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chat_rooms/{room}/messages/{id}`       | `text, authorUid, authorName, authorPhotoURL, createdAt`, optional `reactions`, `mentions`, `guestReadable` (only `true`). Text never edited.         |
| `chat_rooms/{room}/members/{uid}`       | `lastMessageAt`: the cooldown marker                                                                                                                  |
| `chat_rooms/{room}/presence/{uid}`      | heartbeat `displayName, photoURL, lastSeen` (who is at the fire)                                                                                      |
| `chat_bans/{uid}`                       | `until` (far future = permanent), `reason`, `bannedBy`, `userName`                                                                                    |
| `chat_reports/{messageId}_{reporterId}` | copy of the reported text, `status` open/resolved, optional `eventId` (set = reported in that event's Kerzenraum) or `roomId` (a region's Lagerfeuer) |
| `chat_private/reportMail`               | server-only throttle for admin mails (no client rule, so denied)                                                                                      |

- **Rate limit (3 s)** lives in the rules: a message may only be created in the same batch that
  updates `members/{uid}.lastMessageAt` to `request.time`, and that update must be > 3 s after the
  previous value. `useChat.send` does exactly that (batch of two writes).
- **Photo URL** must be Firebase Storage / `*.googleusercontent.com` / local emulator; the client
  drops anything else (`chatPhotoUrl`, keep in sync with the regex in the rules).
- Text limit: 500 characters as users count them (graphemes, `chatTextLength`); the rules only cap
  at 2000 UTF-16 units. Control, zero-width and bidi-override characters are stripped
  (`normalizeChatText`), ZWJ stays so emoji sequences survive.
- Messages are rendered as React text, links only for `http(s)` (`splitChatLinks`). Never use
  `dangerouslySetInnerHTML` here.
- Admins moderate (delete any message, mute/ban). `isChatStaff()` is used instead of
  `isAdminOrEmulatorAdmin()` because the latter errors for users without a `role` claim.
  Regions-Moderator:innen only delete messages in their region's Lagerfeuer (see above).

## Reactions (Lagerfeuer, Kerzenraum and Postfach)

Five fixed emoji (`src/utils/reactions.js`: 👍 ❤️ 😂 😮 🙏; the same list is in `firestore.rules`,
keep both in sync). Stored **on the message** as `reactions: { [uid]: emoji }`, so one reaction per
person and message. The only allowed update of a message changes nothing but your own map entry
(`isOwnReactionChange()`); setting one needs the same gate as sending (chat: `chatAccessible()`, no
mute/ban; DM: participants only, not blocked, recipient takes DMs, no mute/ban), taking it back is
always allowed. Admins get no new access (no read on DMs, no update of other people's entries).

Why a map and not a `reactions/{uid}` subcollection: zero extra listeners or reads (the existing
message listener carries them live), they vanish with the message (own delete, 10-/90-day purge),
so no orphans can be read, and no collection-group query/rules are needed. Cost: each reaction
rewrites the message doc, i.e. one read per listening client, like a new message. There is no rate
limit in the rules; the client sends at most one reaction write per message at a time and coalesces
taps meanwhile (latest wins). Account deletion removes own
entries with `where(FieldPath('reactions', uid), 'in', REACTION_EMOJIS)` (automatic single-field
index on the map subfield, no composite index).

UI: `MessageReactions` wraps the bubble. Double-tap / double-click toggles ❤️ (two clicks within
350 ms; the bubble has `touch-action: manipulation`, a double-click does not select a word), the
smiley button (hover/focus on desktop) or a long-press (touch) opens the bar with the five emoji
plus "Text kopieren" (on touch screens the bubble has no text selection, hence the copy button).
Pills under the bubble show emoji + count, own highlighted; tapping a pill toggles/replaces your own.

Your own reaction is optimistic: `MessageReactions` shows it at once and never locks or greys out the
message; a rejected write rolls it back with a notice (`REACTION_FAILED`). "Pending" (greyed, no
reactions) means only an unsent message (`isUnsentMessage`: `createdAt` server timestamp still
unresolved), never `metadata.hasPendingWrites` alone: the ack of a reaction changes no data, so
Firestore raises no snapshot for it and such a flag would stick until something else changes.

Layout (both views): own messages on the right without avatar (`chat-message--own`,
`chat-bubble--own`, `MessageReactions align="end"`), others on the left with avatar and name.

## Presence ("who sits at the fire")

The open chat page writes `presence/{uid}` every 60 s while the tab is visible and deletes it on
leaving (`useChatHeartbeat`): navigating away, `pagehide`, and as soon as the tab is hidden (other tab
or app, locked phone; on mobile closing a tab often fires no `pagehide`). Logout deletes it (and the
online-dot heartbeat) _before_ signing out (`dropHeartbeats` in `useAuth`), since the rules refuse the
delete afterwards. Everyone with chat access listens to the collection
(`useChatPresence`, chat page only) and counts docs with
`lastSeen` < 2 minutes. Rules allow one write per 20 s per person. Cost scales with
chatters x listeners (each heartbeat is one read per listening client); fine for a community this
size, revisit (e.g. aggregate in a function) if it grows to hundreds of concurrent users.
`purgeChatMessages` removes heartbeats older than a day.

## Unread bubble in the Header

The green number on "Lagerfeuer" is the count of unread messages by others in the person's own room
(`useChatUnread`, max "9+", hidden at 0), not the people online. One listener on the newest 10 messages;
"seen" is per browser, person and room in localStorage (`lagerfeuerSeen:<uid>` for `lagerfeuer`,
`lagerfeuerSeen:<uid>:<roomId>` otherwise, `markLagerfeuerSeen`). First visit on a browser starts
counting from now. While `/chat` is open everything counts as seen, so leaving resets to 0.

## Emoji picker and `:shortcodes`

The picker has curated tabs plus a search over all ~1900 emoji with German names and keywords.
Typing `:fire` (or `:feuer`) in the input suggests emoji (arrows + Enter/Tab, Esc closes);
`:fire:` with the closing colon converts at once. The index `src/data/emojiIndex.json` is generated
from the `emojibase-data` dev dependency (`npm run emoji:build`, commit the result) and loaded
lazily on first use (`src/utils/emojiSearch.js`), so it is not in the main bundle.

Text emoticons (`:)`, `;)`, `<3`, ... see `src/utils/emoticons.js`) turn into emoji when a space is
typed after them (Backspace right after undoes it) and when a message ends with one. Only whole
words, so URLs and times are safe. The picker closes on Escape and on a click/tap outside; on
desktop the message field is focused on entry (not on phones, the keyboard would cover the chat).

## Kerzenraum (one small room per event)

Working title "Kerzenraum" (Peter does not love it yet): the name lives only in
`CANDLE_ROOM_NAME` (`src/utils/candleRoom.js`); the privacy text interpolates it. There is one
Lagerfeuer per active region (above); per-district fires were discussed and dropped (Trello PaXpbpJe).

- **Where:** a section at the bottom of the event detail page (`CandleRoom`), only for
  `status == 'approved'` events. One room per event doc, so all dates of a recurring event share it.
- **Flag:** the same `app_settings/chat`. Reading follows `candleRoomReadable()`: mode `all` =
  everyone **including visitors without login**, `admins` = admins only, `off` = nobody. Writing
  needs `chatAccessible()` (login, verified e-mail, flag) and no mute/ban, like the Lagerfeuer.
- **Data:** `event_chats/{eventId}` = `{ lastMessageAt, lastMessageId }` (the summary the calendar
  listens to), `event_chats/{eventId}/messages/{id}` (same fields as Lagerfeuer messages, incl.
  optional `reactions`), `event_chats/{eventId}/members/{uid}` (3 s cooldown marker). The client writes
  message + marker + summary in one batch; the rules require all three with the same server time,
  so the summary can never be bumped without a real message, and the event must exist and be
  approved. Rules tests: `tests/rules/chat.rules.spec.ts` ("Kerzenraum").
- **Candle indicator:** "seen" is per browser in localStorage (`candleRoomSeen:<eventId>` = ms of
  the newest message seen). The calendar (`CalendarPage` -> `useCandleRoomNews`) has ONE listener on
  `event_chats where lastMessageAt > now - 10 days` and shows a flickering candle (`CandleBadge`,
  hover tooltip) on the card of every room with a newer message. Inside the room the candle next to
  the title flickers while there are messages by others newer than the last visit (fixed when the
  room is opened). List view rows get no candle (ticket asked for the card view).
- **Same as the Lagerfeuer:** the Kerzenraum behaves like the Lagerfeuer, only the room differs
  (decision of the product owner, Trello lIFGjH33). Reactions: same map on the message and same
  rule (`allow update` on `event_chats/{eventId}/messages`, `isOwnReactionChange()` + `chatAccessible()`
  - not banned + fixed emoji, removal always allowed); `useCandleRoom.react`. Account deletion drops
    own reactions per room (can be denied for rooms while the flag is off; the entry then stays until
    the 10-day purge). Reporting: `useCandleRoom.report` writes the same `chat_reports` doc plus
    `eventId`; the admin tab (`ChatTab`, `useChatAdmin.deleteMessage(messageId, eventId)`) shows room
    and event link and deletes in the right room; the report mail (`buildReportMail`) says "im Event Chat zu
    <Titel>" or "im Chat Lagerfeuer"; the 15-minute mail throttle is shared. Also there: member card on
    avatar/name, "Ältere Nachrichten laden" (50 per step, max 500), "Neue Nachricht" jump button.
- **E-mail to the organizer** (`onKerzenraumMailNotify`, logic in `chatMailNotify.ts`, Trello
  6ae5bb2c; this reverses the earlier "no e-mail" stance for this case): a new message mails the
  event's creator (`events.createdBy`, address from Firebase Auth) "Neue Nachricht im Event Chat:
  <Titel>" with author name (public profile), a ~140-character excerpt and a button to
  `/event/<slug>#kerzenraum`. **At most one mail per organizer and calendar day (Vienna), across all
  their events**: marker `event_chat_notify/{organizerUid}` `{ day, lastMailAt }`, claimed in a
  transaction, Functions only (rules deny every client), purged after two days. No mail for the
  organizer's own messages, with the flag off (`admins`: only admin organizers), when
  `notifyOnEventChat` is off (profile, default on, switch only visible while the chat is open), when
  the organizer blocked the author in the Postfach, for muted/banned authors, deleted/disabled
  accounts or events that are not approved. Presence is not a criterion.
- **Not built, on purpose:** presence ("who is here"). A heartbeat plus a listener per event would
  cost reads for every open event page and gives little for a room that is mostly a message board.
  `useChat` and `useCandleRoom` are still two hooks (no shared abstraction), so the Lagerfeuer cannot regress.
- Purge and account deletion include the rooms (see below). Signed-in users may read the summary
  docs and their own messages even with the flag off, so account deletion always finds them.

## @mentions (Lagerfeuer and Kerzenräume, never the Postfach)

Typing `@` at the start of a word in the composer suggests people (a bare `@` lists everyone A–Z, max 20, in a scrolling list); the picked name goes into the text
as `@Anna Maria` and into `mentions: { [uid]: name }` on the message. The text stays plain text; the
map says which person a name means, so an `@Name` without an entry is never highlighted
(`src/utils/mentions.js`, `splitMentions`). The composer only enables this with `mentionsEnabled`
(the Postfach composer does not pass it). A name that is deleted from the draft drops its entry.

- **Opt-in:** profile option "Andere dürfen mich erwähnen" = `allowMentions` (bool, default off) on
  `users/{uid}` and `publicProfile/data`. While it is on, `useProfile.save` also keeps `mentionName`
  (display name lower case, no accents; `foldName`) on the public profile, removed when switched off.
  Only people with the option on can be found or notified.
- **Search:** `searchMentionableUsers` (`src/lib/mentionSearch.js`) is a collection-group query on
  `publicProfile`: `allowMentions == true` + prefix range on `mentionName`. It needs the composite
  index in `firestore.indexes.json` (without it the dropdown silently stays empty and the console
  warns). It searches the whole platform, not only the room. Debounced 150 ms, max 6 hits.
- **Limit:** `MENTION_MAX = 10` per message (`src/utils/mentions.js`, `functions/src/chatLogic.ts`
  and the rules, keep all three in sync). The number is arbitrary; it only exists so that one
  message cannot create hundreds of notifications.
- **Rules:** `mentions` is an optional map of at most 10 entries on both message paths. The rules
  cannot check the entries, so the server does (below).
- **Notification:** the functions `onLagerfeuerMention` / `onKerzenraumMention` (`chat.ts`) write
  `users/{uid}/mentions/{messageId}` `{ kind, eventId, eventSlug, eventTitle, messageId, fromUid,
fromName, excerpt, read, createdAt }`. Only the server creates them (rules: no client create), per
  target it re-checks `allowMentions` on the public profile, drops the author, and honours the chat
  flag (`off`: nobody, `admins`: only admins). The owner reads, sets `read: true` (nothing else may
  change) and deletes. The document id is the message id, so a retry does not duplicate. No e-mail
  for mentions (decision of the product owner; the organizer mail below is a separate thing).
- **Bell:** `MentionBell` next to the Postfach in the header (row in the phone menu), fed by
  `useMentionNotifications` (latest 20 + unread count). A click opens `/chat#msg-<id>` or
  `/event/<slug>#msg-<id>`; `useMessageJump` scrolls to the message and highlights it. A message
  that mentions you also gets a marked bubble. The Kerzenraum section has the anchor `#kerzenraum`.
- **Purge:** `purgeChatMessages` deletes mention notifications older than 10 days
  (`collectionGroup('mentions')`, single-field index override); account deletion removes the
  `users/{uid}/mentions` subcollection.
- Not built: e-mail or push for mentions, `@everyone`, mentions in reports.

## Server (`functions/src/chat.ts`, pure logic in `chatLogic.ts`)

- `purgeChatMessages` (daily 04:10 Vienna): in every room of `chat_rooms`, messages and cooldown markers older than **10 days**,
  reports older than 30 days. Kerzenraum rooms whose last message is older than 10 days are deleted
  entirely, others lose their old messages and markers.
- `onChatReportCreated`: mails the admins about a new report (Lagerfeuer, with region name in region mode, or Event Chat, the latter
  with the event title read from `events/{eventId}`), at most one mail per 15 minutes.
- Account deletion (`useAuth.deleteAccount`) removes the user's messages, their reactions on other
  messages and the cooldown marker in `lagerfeuer` and every active region's room, also in every Kerzenraum.

## Privacy

Datenschutzerklärung Abschnitt 14 (+ 2, 3, 4 and 5); the Kerzenraum has its own paragraph there (public history!), including the organizer mail with excerpt (Mailgun, section 4). Change it whenever data, retention or visibility changes. Open since lIFGjH33: that paragraph still has to mention reactions and reports for the Event Chat (not edited by the developer on purpose).

## Not built (ideas)

Push, e-mail for the Lagerfeuer or for mentions. Presence would need a
heartbeat doc or Realtime Database; Firestore alone is a poor fit.
