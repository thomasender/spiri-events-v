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

| Path                                    | What                                                                |
| --------------------------------------- | ------------------------------------------------------------------- |
| `chat_rooms/lagerfeuer/messages/{id}`   | `text, authorUid, authorName, authorPhotoURL, createdAt`. No edits. |
| `chat_rooms/lagerfeuer/members/{uid}`   | `lastMessageAt`: the cooldown marker                                |
| `chat_rooms/lagerfeuer/presence/{uid}`  | heartbeat `displayName, photoURL, lastSeen` (who is at the fire)    |
| `chat_bans/{uid}`                       | `until` (far future = permanent), `reason`, `bannedBy`, `userName`  |
| `chat_reports/{messageId}_{reporterId}` | copy of the reported text, `status` open/resolved                   |
| `chat_private/reportMail`               | server-only throttle for admin mails (no client rule, so denied)    |

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

## Server (`functions/src/chat.ts`, pure logic in `chatLogic.ts`)

- `purgeChatMessages` (daily 04:10 Vienna): messages and cooldown markers older than **10 days**,
  reports older than 30 days.
- `onChatReportCreated`: mails the admins about a new report, at most one mail per 15 minutes.
- Account deletion (`useAuth.deleteAccount`) removes the user's messages and cooldown marker.

## Privacy

Datenschutzerklärung Abschnitt 14 (+ 2 and 5). Change it whenever data, retention or visibility changes.

## Not built (ideas)

Several rooms / region rooms, online presence, unread badge, @mentions, push. Presence would need a
heartbeat doc or Realtime Database; Firestore alone is a poor fit.
