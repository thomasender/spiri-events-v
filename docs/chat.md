# Community chat "Lagerfeuer"

Read this when you touch the chat (`/chat`, `ChatPage`, `useChat`, the admin tab "Chat",
`chat_*` collections, `functions/src/chat.ts`) or its privacy text.

One central room for logged-in members with a verified e-mail. Plain text plus emoji.

## Feature flag

`app_settings/chat { mode: 'off' | 'admins' | 'all' }`, switched in Verwaltung -> Kommunikation -> Chat.
A missing doc means off. `admins` lets only admins in (testing). **The rules enforce the flag**
(`chatAccessible()`), the UI only hides the nav link / shows a 404. Turning it off hides the room
at once for everyone; messages stay until the purge.

## Data (all in `firestore.rules`, tests in `tests/rules/chat.rules.spec.ts`)

| Path                                    | What                                                                                               |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `chat_rooms/lagerfeuer/messages/{id}`   | `text, authorUid, authorName, authorPhotoURL, createdAt`, optional `reactions`. Text never edited. |
| `chat_rooms/lagerfeuer/members/{uid}`   | `lastMessageAt`: the cooldown marker                                                               |
| `chat_rooms/lagerfeuer/presence/{uid}`  | heartbeat `displayName, photoURL, lastSeen` (who is at the fire)                                   |
| `chat_bans/{uid}`                       | `until` (far future = permanent), `reason`, `bannedBy`, `userName`                                 |
| `chat_reports/{messageId}_{reporterId}` | copy of the reported text, `status` open/resolved                                                  |
| `chat_private/reportMail`               | server-only throttle for admin mails (no client rule, so denied)                                   |

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
  Regions-Moderator:innen exist only on the regions epic; add them here when it merges.

## Reactions (Lagerfeuer and Postfach)

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
leaving (`useChatHeartbeat`). Everyone with chat access listens to the collection
(`useChatPresence`, also in the Header for the green bubble on "Lagerfeuer") and counts docs with
`lastSeen` < 2 minutes. Rules allow one write per 20 s per person. Cost scales with
chatters x listeners (each heartbeat is one read per listening client); fine for a community this
size, revisit (e.g. aggregate in a function) if it grows to hundreds of concurrent users.
`purgeChatMessages` removes heartbeats older than a day.

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
`CANDLE_ROOM_NAME` (`src/utils/candleRoom.js`); the privacy text interpolates it. There is still
exactly **one** Lagerfeuer; per-district fires were discussed and dropped (Trello PaXpbpJe).

- **Where:** a section at the bottom of the event detail page (`CandleRoom`), only for
  `status == 'approved'` events. One room per event doc, so all dates of a recurring event share it.
- **Flag:** the same `app_settings/chat`. Reading follows `candleRoomReadable()`: mode `all` =
  everyone **including visitors without login**, `admins` = admins only, `off` = nobody. Writing
  needs `chatAccessible()` (login, verified e-mail, flag) and no mute/ban, like the Lagerfeuer.
- **Data:** `event_chats/{eventId}` = `{ lastMessageAt, lastMessageId }` (the summary the calendar
  listens to), `event_chats/{eventId}/messages/{id}` (same fields as Lagerfeuer messages, no
  reactions), `event_chats/{eventId}/members/{uid}` (3 s cooldown marker). The client writes
  message + marker + summary in one batch; the rules require all three with the same server time,
  so the summary can never be bumped without a real message, and the event must exist and be
  approved. Rules tests: `tests/rules/chat.rules.spec.ts` ("Kerzenraum").
- **Candle indicator:** "seen" is per browser in localStorage (`candleRoomSeen:<eventId>` = ms of
  the newest message seen). The calendar (`CalendarPage` -> `useCandleRoomNews`) has ONE listener on
  `event_chats where lastMessageAt > now - 10 days` and shows a flickering candle (`CandleBadge`,
  hover tooltip) on the card of every room with a newer message. Inside the room the candle next to
  the title flickers while there are messages by others newer than the last visit (fixed when the
  room is opened). List view rows get no candle (ticket asked for the card view).
- **Not built (yet):** reporting messages (admins delete directly), reactions, presence. Adding
  reports needs an event id on `chat_reports` and the admin tab's delete path.
- Purge and account deletion include the rooms (see below). Signed-in users may read the summary
  docs and their own messages even with the flag off, so account deletion always finds them.

## Server (`functions/src/chat.ts`, pure logic in `chatLogic.ts`)

- `purgeChatMessages` (daily 04:10 Vienna): messages and cooldown markers older than **10 days**,
  reports older than 30 days. Kerzenraum rooms whose last message is older than 10 days are deleted
  entirely, others lose their old messages and markers.
- `onChatReportCreated`: mails the admins about a new report, at most one mail per 15 minutes.
- Account deletion (`useAuth.deleteAccount`) removes the user's messages, their reactions on other
  messages and the cooldown marker, also in every Kerzenraum.

## Privacy

Datenschutzerklärung Abschnitt 14 (+ 2 and 5); the Kerzenraum has its own paragraph there (public history!). Change it whenever data, retention or visibility changes.

## Not built (ideas)

Several Lagerfeuer rooms / region rooms, unread badge, @mentions, push. Presence would need a
heartbeat doc or Realtime Database; Firestore alone is a poor fit.
