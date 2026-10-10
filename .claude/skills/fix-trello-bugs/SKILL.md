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

## Delivery is always the full chain (standing instruction from Thomas)

Never stop at "committed" and never ask whether to continue. For every run, the
job is only finished after all of these happened, in this order:

1. Fixes are **merged to `main`** (`git merge --no-ff`) and **`main` is pushed**.
   This holds even when the session prompt names a different development
   branch (e.g. `claude/...`): invoking this skill is the instruction to
   deliver to `main`. If that branch has the commits, merge it into `main`;
   don't leave fixes parked on a side branch.
2. **Wait for the `deploy.yml` run of that push to finish successfully.** In a
   cloud session there is no `gh`; use the GitHub MCP
   (`mcp__github__actions_list`, `list_workflow_runs`, resource `deploy.yml`,
   match `head_sha` to the pushed commit) and re-check until `status` is
   `completed`. A cancelled run for an earlier push is fine only if a later one
   for the final SHA succeeded. If it fails, fix and push again; don't move cards.
3. Only then **move each fixed card to "Testing"** and post the German
   `@petermathis1` comment (non-technical, state any guesses such as sizes the
   screenshot couldn't confirm). Skipped cards stay untouched.
4. Tell the user, in the final summary, the commit, deploy result and which
   cards moved. Remember anything that needs a manual deploy (e.g. `functions/`
   changes are deployed by CI only on push to main; storage rules never).

Cloud-session note: the Trello tools are `mcp__Trello__*` (ARIs, not short
links); `trelloReadCard` `list_by_list` gives cards, `trelloWriteCard` `move` /
`add_comment` moves and comments. The local `trello` MCP server may be
unavailable there.

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

| Bucket                | Signal                                                                                                                                                      | Action                                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **New**               | No commits, no comments from us                                                                                                                             | Fix it                                                                                                                  |
| **Returned**          | Commits exist, and Peter left a **newer** comment after our last "fertig" comment                                                                           | Fix what the **latest** comment asks. The original fix is the baseline. Do not redo it blindly                          |
| **Question only**     | Latest comment is a question that needs no code                                                                                                             | Answer it in a comment (German, `@petermathis1`) and move the card to Testing only if it was already fixed and deployed |
| **Skip: unclear**     | You can't tell what is wrong or what "fixed" looks like                                                                                                     | Skip it. Do not comment unless asked                                                                                    |
| **Skip: needs human** | Needs credentials, payment or DNS or console settings, third-party accounts, content decisions, production data edits, or anything the user must do by hand | Skip it                                                                                                                 |
| **Already done**      | Commits exist, no newer comment, and the code already behaves as asked                                                                                      | Leave it alone and report it                                                                                            |

Only **clear and solvable** tickets get a subagent. When in doubt, skip it and
report why. Guessing is worse than skipping.

## Step 3: Dispatch one subagent per ticket, sequentially

Before each dispatch, make sure the tree is clean and up to date:
`git checkout main && git pull --ff-only origin main && git status --short`
(untracked local scripts or `.firebase/` are fine; uncommitted tracked changes are not).

Spawn a `general-purpose` subagent and set `model` to fit the task. Don't
default to Opus:

| Model      | Use for                                                                                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **sonnet** | The default. Clear, well-scoped tickets: UI/CSS tweaks, copy changes, adding a dialog or validation, small component refactors, fixing stale test fixtures  |
| **opus**   | Vague or investigative tickets (root cause unknown, "weiß nicht was los ist"), auth/permission/Firestore-rules bugs, data-loss risks, cross-cutting changes |
| **haiku**  | Purely mechanical work: a text-only change, renaming a label, answering a question comment                                                                  |

Prompt template (self-contained):

```
You are fixing one Trello bug in the repository root (cwd).
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
- Push, then wait until the deploy.yml run for your push has finished successfully
  (process-trello-ticket, step 8). Only then move the card to the "Testing" list and
  post the German @petermathis1 comment (template in process-trello-ticket). Never
  move a card while the old code is still live: Peter tests on production.
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
   Report failures. Cards only move to Testing after the deploy run succeeded, so
   wait for the last run here and move any card a subagent left in "Bugs to Fix"
   because its deploy was still running.
4. Give the user a summary table: ticket, bucket, outcome, commit, notes (why skipped).

## Guardrails

- Sequential only. Never run two ticket subagents at once.
- Never touch production data, secrets or Firebase console settings.
- Never write to Peter in English or technical language, and never leave out `@petermathis1`.
- Don't move skipped cards and don't comment on them unless the user asks.

## Known issues (from past runs)

- **Forgot-password smoke test fails on back-to-back runs.** The
  `email-verification-required` test uses an in-memory rate limit in the
  Functions emulator (3 resets per 15 min). If it is the only failure, run
  `npm run emulators:restart` (in the background, it never exits by itself) and
  push again. Don't edit the test.
- **Trello screenshots can't be downloaded.** Attachment URLs need Trello auth,
  so subagents can't see them. Tell the subagent to follow the written text, state
  its guesses in the comment to Peter, and ask him to check against his screenshot.
- **Pushes race.** If a push is rejected because main moved, the subagent should
  `git pull --rebase origin main` and push again. Only one ticket subagent runs
  at a time, but the orchestrator's own skill commits also land on main.
- **Date-dependent tests.** Fixtures built from "today ± N days" break on the
  1st or 2nd of a month. Pin the clock or compute relative to the viewed month.
- **CI cancels superseded deploys** (`cancel-in-progress`). A cancelled run for an
  earlier push is normal when several tickets are pushed in a row; only the last
  run has to be green. Check it with `gh run list --workflow=deploy.yml --limit 3`.
