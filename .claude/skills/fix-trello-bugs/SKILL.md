---
name: fix-trello-bugs
description: Orchestrate fixing every ticket in the "Bugs to Fix" column of the spiri-events-v Trello board. Processes tickets one at a time through subagents, re-checks tickets that came back with new comments, skips unclear tickets or ones that need manual action, merges to main, pushes, deploys rules, and reports to Peter. Use when asked to "fix the bugs on the board", "process Bugs to Fix", or similar.
---

# Fix Trello Bugs (orchestrator)

You are the **orchestrator**. You do not fix bugs yourself. You read the
column, decide what each ticket needs, and hand each solvable ticket to a
subagent, **one at a time** (never in parallel: they share one working tree,
`main` and the emulator). This keeps your own context small.

Read `AGENTS.md` once before starting. It is the source of truth for testing,
deployment and how to talk to Peter. The per-ticket workflow lives in the
`process-trello-ticket` skill. Subagents follow it, with the changes below.

## Constants

- Board: `rebumcT4` (Conscious Community Vorarlberg Kalender)
- Source column: **Bugs to Fix**
- Destination column after a fix: **Testing**
- Peter's mention: `@petermathis1` (must start every comment to him; German, non-technical)
- Firebase project: `spirieventsvbg`
- Production: https://www.thetribe.at

## Step 0: Pre-flight (is main green?)

Run `npx vitest run` and `npm run emulators:check` on a clean, up-to-date main.
If Vitest is already red before any change, every ticket commit fails the
pre-commit hook. Fix that first with one subagent (often date-dependent fixtures
that went stale; pin the clock instead of skipping tests), so the ticket
subagents don't all fall back to `--no-verify`. Start the emulators
(`npm run emulators:start`, in the background) if the check fails.

## Step 1: Collect the tickets

1. `get_lists` on the board, then find the "Bugs to Fix" list ID.
2. `trello_get_list_cards`, then note each card's id, shortLink, name and desc.
3. For each card, collect history **before** deciding anything:
   - `trello_get_card_actions` (filter `commentCard`): all comments, newest first.
   - `git log --all --oneline -i -E --grep="<shortLink>|<first 8 chars of card id>"`:
     earlier commits for this ticket. Older commits sometimes use the card-id
     prefix (e.g. `fix(6abf99cb): …`) instead of the shortLink, so search both.
   - `git branch -a | grep -iE "<shortLink>|<card-id prefix>"`: leftover branches.
   - If we already posted a "fertig" comment but neither search finds a commit,
     grep the code for a distinctive string from that comment.

## Step 2: Triage each ticket

Sort each ticket into one bucket:

| Bucket                | Signal                                                                                                                                                      | Action                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **New**               | No commits, no comments from us                                                                                                                             | Fix it                                                                                                     |
| **Returned**          | Commits exist, and Peter left a **newer** comment after our last "fertig" comment                                                                           | Fix what the **latest** comment asks. The original fix is the baseline. Do not redo it blindly             |
| **Question only**     | Latest comment is a question that needs no code                                                                                                             | Answer it in a comment (German, `@petermathis1`) and move the card to Testing only if it was already fixed |
| **Skip: unclear**     | You can't tell what is wrong or what "fixed" looks like                                                                                                     | Skip it. Do not comment unless asked                                                                       |
| **Skip: needs human** | Needs credentials, payment or DNS or console settings, third-party accounts, content decisions, production data edits, or anything the user must do by hand | Skip it                                                                                                    |
| **Already done**      | Commits exist, no newer comment, and the code already behaves as asked                                                                                      | Leave it alone and report it                                                                               |

Only **clear and solvable** tickets get a subagent. When in doubt, skip it and
report why. Guessing is worse than skipping.

## Step 3: Dispatch one subagent per ticket, sequentially

Before each dispatch, make sure the tree is clean and up to date:
`git checkout main && git pull --ff-only origin main && git status --short`
(untracked local scripts or `.firebase/` are fine; uncommitted tracked changes are not).

Spawn a `general-purpose` subagent with a self-contained prompt. Template:

```
You are fixing one Trello bug in /Users/thomasender/Desktop/playground/spiri-events-v.
Read AGENTS.md and .claude/skills/process-trello-ticket/SKILL.md first and follow them.

Ticket: <shortLink> — <name>  (card id <id>)
Description: <desc>
Comments (oldest → newest): <comments, with author + date>
Prior commits for this ticket: <git log lines or "none">
Bucket: <New | Returned>. <For Returned: "The earlier fix is in place; address ONLY the latest feedback: …">

Rules:
- Branch: bugfix/<shortLink>_<kebab-title> from up-to-date main.
- Minimal fix. Regression test at the lowest tier that fails before the fix
  (usually Vitest in tests/components/). No new Playwright spec files.
  page.waitForTimeout is banned.
- Commit as `fix(<shortLink>): <what>` and end the message with:
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
- Merge to main with `git merge --no-ff`, push main, delete the branch locally and remotely.
- Prefer letting hooks run. Use --no-verify only if the hook fails for reasons
  unrelated to your change (e.g. degraded emulator after `npm run emulators:restart`
  did not help) or the smoke suite would block for an unreasonable time. If you
  do, say so and why in your report.
- Pushing main triggers CI, which deploys hosting, functions and firestore rules/indexes.
  CI does NOT deploy storage rules. If you changed storage.rules, run
  `firebase deploy --only storage --project spirieventsvbg`. If you changed
  firestore.rules or firestore.indexes.json, also run
  `firebase deploy --only firestore:rules,firestore:indexes --project spirieventsvbg`
  so the rules are live right away.
- Move the card to the "Testing" list and post the German @petermathis1 comment
  (template in process-trello-ticket).
- If you find the ticket is NOT solvable after all (needs manual action, unclear),
  stop, change nothing on main or Trello, and report back why.

Report back in at most 10 lines: status (fixed / skipped + reason), commit SHA,
files changed, tests added, whether hooks ran or --no-verify was used, deploys run.
```

Wait for each subagent to finish before starting the next. Keep only its short
report in your context.

## Step 4: After all tickets

1. `git checkout main && git pull` and make sure no stray branches or uncommitted changes are left.
2. Make sure rules are deployed. If any ticket touched `firestore.rules`, `firestore.indexes.json` or
   `storage.rules` and the subagent didn't deploy them, deploy now:
   `firebase deploy --only firestore:rules,firestore:indexes,storage --project spirieventsvbg`.
   Deploying unchanged rules is harmless, so when unsure, deploy them.
3. Check the CI run for the last push: `gh run list --workflow=deploy.yml --limit 3`.
   Report failures. Don't wait for a long run if the user didn't ask.
4. Give the user a summary table: ticket, bucket, outcome, commit, notes (why skipped).

## Guardrails

- Sequential only. Never run two ticket subagents at once.
- Never touch production data, secrets or Firebase console settings.
- Never write to Peter in English or technical language, and never leave out `@petermathis1`.
- Don't move skipped cards and don't comment on them unless the user asks.
