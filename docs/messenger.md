# Private messenger "Postfach"

Read this when you touch the messenger (`/postfach`, `MessengerPage`, `useMessenger`, `MemberCard`,
`dm_*` collections, `functions/src/chat.ts` DM parts) or its privacy text. Built on the chat
(`docs/chat.md`): same composer (`MessageComposer`: emoji finder, `:shortcodes`, emoticons).

1:1 conversations between logged-in members with a verified e-mail. Plain text, 1000 characters.
**No e-mail notifications** (decision: in-app bubbles are enough).

## Feature flag

`app_settings/messenger { mode: 'off' | 'admins' | 'all' }` (Verwaltung -> Kommunikation -> Chat, second
block). Independent of the chat flag. Enforced in the rules (`messengerAccessible()`).

## Data (rules + tests: `tests/rules/messenger.rules.spec.ts`)

| Path                               | What                                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| `dm_threads/{uidA_uidB}`           | `participants[2], lastMessageText/At/By, readAt{uid: ts}, createdAt`. Id = sorted uids |
| `dm_threads/{id}/messages/{id}`    | `text, authorUid, createdAt`. No edits; the author deletes                             |
| `dm_blocks/{blocker}_{blocked}`    | block; readable only by the blocker                                                    |
| `dm_settings/{uid}`                | `allowDirectMessages` (default on); readable by members for the member card            |
| `dm_starters/{uid}`                | `lastThreadAt, day, count`: new conversations 20 s apart, 30 per day                   |
| `dm_reports/{threadId}_{reporter}` | copy of the last 6 messages as text; only admins read                                  |

- **Privacy:** only the two participants read. Admins can NOT read threads or messages (no staff rule),
  only `dm_reports`. Membership is read off the thread id (`threadId.split('_')`), so no `get()`.
- **Send** = one batch: message + thread summary (`update`, or `create` with a `dm_starters` write).
  The message rule checks via `getAfter` that the summary got the same `request.time`; the summary
  update enforces a 2 s cooldown. A block or "no private messages" of the recipient and a chat
  mute/ban of the sender deny the write; the client shows a deliberately vague error.
- **Unread** = last message is from the other person and newer than my `readAt` entry. One listener
  (`useThreads`) feeds the inbox and the red bubble on the menu item. `useConversation.markRead`
  writes `readAt.<me>` when the conversation is open and the tab visible.
- Names/photos are NOT stored in threads (they could be spoofed): the client reads the
  counterpart's `users/{uid}/publicProfile/data` (`useMemberInfo`, cached). Deleted accounts show as
  "Gelöschtes Mitglied".
- Starting a conversation: click an avatar/name in the Lagerfeuer -> `MemberCard` -> `/postfach/<uid>`.

## Server (`functions/src/chat.ts`)

- `purgeChatMessages` also purges private messages older than **90 days** (whole thread if its last
  message is older), stale `dm_starters` and reports older than 30 days.
- `onDmReportCreated` mails the admins (shares the 15-minute throttle with chat reports); the mail
  never contains message text.
- Account deletion (`useAuth.deleteAccount`) removes the user's messages in all threads, blocks,
  settings and starter marker. Threads themselves stay for the other person until the purge.

## Privacy

Datenschutzerklärung Abschnitt 15 (+ 2 and 5). Keep it true: admins cannot read, not end-to-end
encrypted, 90 days.

## Not built (ideas)

Read receipts, search, mute/delete a whole conversation, group chats, push/e-mail notifications.
