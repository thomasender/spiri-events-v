# Private messenger "Postfach"

Read this when you touch the messenger (`/postfach`, `MessengerPage`, `useMessenger`, `MemberCard`,
`dm_*` collections, `functions/src/chat.ts` DM parts) or its privacy text. Built on the chat
(`docs/chat.md`): same composer (`MessageComposer`: emoji finder, `:shortcodes`, emoticons).

1:1 conversations between logged-in members with a verified e-mail. Plain text, 1000 characters.
**E-mail notification** for a new message (Trello 6ae5bb2c: the product owner reversed the earlier
"in-app bubbles are enough" decision), see "E-mail notification" below.

## Feature flag

`app_settings/messenger { mode: 'off' | 'admins' | 'all' }` (Verwaltung -> Kommunikation -> Chat, second
block). Independent of the chat flag. Enforced in the rules (`messengerAccessible()`).

## Data (rules + tests: `tests/rules/messenger.rules.spec.ts`)

| Path                               | What                                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| `dm_threads/{uidA_uidB}`           | `participants[2], lastMessageText/At/By, readAt{uid: ts}, createdAt`. Id = sorted uids |
| `dm_threads/{id}/messages/{id}`    | `text, authorUid, createdAt`, optional `reactions` (docs/chat.md). Text never edited   |
| `dm_blocks/{blocker}_{blocked}`    | block; readable only by the blocker                                                    |
| `dm_settings/{uid}`                | `allowDirectMessages` (default on); readable by members for the member card            |
| `dm_starters/{uid}`                | `lastThreadAt, day, count`: new conversations 20 s apart, 30 per day                   |
| `dm_reports/{threadId}_{reporter}` | copy of the last 6 messages as text; only admins read                                  |
| `dm_notify/{threadId}_{recipient}` | `lastMailAt`: mail throttle, written by Functions only, no client access (rules)       |

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
- Starting a conversation: click an avatar/name in the Lagerfeuer -> `MemberCard` -> `/postfach/<uid>`;
  directory cards and the public profile page show a "Nachricht" button (`DirectMessageLink`) when the
  messenger is open for the viewer. Add it wherever else a person is shown the same way.

## Server (`functions/src/chat.ts`)

- `purgeChatMessages` also purges private messages older than **90 days** (whole thread if its last
  message is older), stale `dm_starters` and reports older than 30 days.
- `onDmReportCreated` mails the admins (shares the 15-minute throttle with chat reports); the mail
  never contains message text.
- Account deletion (`useAuth.deleteAccount`) removes the user's messages and reactions in all
  threads, blocks, settings and starter marker. Threads themselves stay for the other person until the purge.

## E-mail notification (`onDirectMessageMailNotify`, logic in `chatMailNotify.ts`)

On every new `dm_threads/{id}/messages/{id}` the other participant gets a mail "Neue Nachricht von
<Name>" with a ~140-character excerpt (one line, cut at a word, "…", HTML-escaped, control/bidi
characters dropped; `chatMailExcerpt` in `emailTemplates.ts`), a button to `/postfach/<sender uid>` and
the footer with the link to the notification settings (that is the opt-out).

- **Throttle:** at most one mail per conversation and recipient per hour (fixed window from the last
  mail). The marker `dm_notify/{threadId}_{recipient}` is claimed in a transaction, so parallel triggers
  do not mail twice. Messages inside the window get no mail (no digest). Purged after a day.
- **No mail** when: flag off (`admins` mode: only admins as recipients), recipient switched
  `notifyOnDirectMessage` off (profile, default on; switch only visible while the Postfach is open for
  them), a block in either direction, recipient has "keine Privatnachrichten", author muted/banned,
  either account deleted or disabled, recipient without verified e-mail, empty text. Presence / online
  status is deliberately not a criterion.
- Names come from the public profiles (sender name in subject and text). Logs carry ids and the skip
  reason, never message text. Staging links go to `tribe-vbg-staging.web.app`.

## Sammelnachricht (admin -> many members, `functions/src/adminBroadcast.ts`)

Verwaltung -> Mitglieder, button "Nachricht senden" (Super-Admins only; moderators do not get it).
Recipients: the ticked members, else every member of the chosen list (ticks win). Dialog: text
(1000 characters) with counter and preview -> dry run "Wird an X Mitglieder gesendet, Y
übersprungen" with reasons -> confirm -> result. Each table row also has a "Nachricht" link
(`DirectMessageLink`) while the Postfach is open for the viewer.

- Callable `adminSendBroadcastDm({ recipientUids, text, dryRun, requestId })`, App Check like every
  callable. One normal 1:1 message per recipient from the admin's **own** account into
  `dm_threads/{uidA_uidB}`, same fields as the client (`threadWrite` / `messageWrite` in
  `adminBroadcastLogic.ts`), plus `broadcastId` on the message. Answers land in her Postfach.
- Refused unless the flag is `'all'` and the admin is verified, active and not muted
  (`broadcastRefusal`). Skipped per recipient (`decideBroadcastRecipient` in `chatMailNotify.ts`):
  the admin herself, deleted/disabled accounts, unverified addresses, a block in either direction,
  "keine Privatnachrichten". `dm_starters` (30 new threads/day) does not apply; instead: at most 500
  recipients, one Sammelnachricht per admin every 10 minutes (`admin_broadcast_locks/{uid}`,
  server-only), idempotent per `requestId` (`admin_broadcasts/{uid}_{requestId}`).
- **No e-mail:** `onDirectMessageMailNotify` stops on messages with `broadcastId`.
- Writes go in batches of 200 recipients (thread summary + message atomic per recipient); a failed
  batch is counted as `write_failed`, the others still go out.
- Log `admin_broadcasts/{id}`: sender, time, counts, skip-reason counters and the full text (it is the
  admin's own text); read by Super-Admins only, written only by the function. `admin_audit_log`
  gets `action: 'sendBroadcastDm'`. Cloud logs carry counts and reasons, never the text.

## Privacy

Datenschutzerklärung Abschnitt 15 (+ 2, 3, 4 and 5). Keep it true: admins cannot read, not end-to-end
encrypted, 90 days, the notification mail contains an excerpt and goes through Mailgun (section 4),
the team's Sammelnachricht skips "keine Privatnachrichten" and sends no e-mail.

## Not built (ideas)

Read receipts, search, mute/delete a whole conversation, group chats, push notifications, a mail digest.
