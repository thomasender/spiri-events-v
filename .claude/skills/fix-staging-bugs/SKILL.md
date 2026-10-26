---
name: fix-staging-bugs
description: Orchestrate fixing every ticket in the "Bugs Staging" column of the spiri-events-v Trello board on the staging branch (currently feature/regions-epic, deployed to tribe-vbg-staging). Sibling of fix-trello-bugs, which stays the skill for main/production. Groups closely related tickets into one subagent run, merges to the staging branch, waits for deploy-staging.yml, moves cards to "Testing Staging" and reports to Peter. Use when asked to "fix the staging bugs", "process Bugs Staging", or similar.
---

# Fix Staging Bugs (orchestrator)

This is the staging twin of `fix-trello-bugs`. **Do not edit `fix-trello-bugs`**;
it stays the skill for bugs on `main` / production. Everything not overridden
below works as described there (triage buckets, history collection, model
choice, guardrails, known issues). Read it once, then apply the differences.

You are the **orchestrator**. You do not fix bugs yourself. You read the column,
triage, and hand work to subagents **one at a time** (never in parallel: shared
working tree, branch and emulator).

Read `AGENTS.md` once before starting. Subagents also follow
`.claude/skills/process-trello-ticket/SKILL.md` with the overrides below.

## Constants (differences to fix-trello-bugs)

- Board: `rebumcT4`, API board id `6a672fa782573b198141a15f`
- Source column: **Bugs Staging** (id `6ad06e1f632ed7ae3b4278fb`)
- Destination column after a fix: **Testing Staging** (id `6ad0792deab4ae31aacf706b`)
- **Staging branch: `feature/regions-epic`**. This is the only branch that deploys to
  staging today. When the epic is merged to main and a dedicated `staging` branch
  exists, change this one constant (and the workflow trigger it refers to) and
  nothing else.
- Firebase project: `tribe-vbg-staging` (**never** `spirieventsvbg`)
- Staging URL: look it up in `docs/staging-migration.md` / the hosting config; do not guess
- Peter's mention: `@petermathis1` (starts every comment to him; German, non-technical)

## Delivery chain

1. Fixes are merged into the **staging branch** with `git merge --no-ff` and the
   staging branch is pushed. **Never merge into or push `main`**, and never merge
   the epic into main.
2. A push to `feature/regions-epic` triggers `deploy-staging.yml` (hosting,
   Firestore rules and indexes; **not** Cloud Functions or storage rules). Wait
   until the run for the pushed SHA is `completed` and green
   (`gh run list --workflow=deploy-staging.yml --limit 3`). A cancelled run for an
   earlier push is fine when a later one for the final SHA succeeded
   (`cancel-in-progress`).
3. If a fix touched `functions/` or `storage.rules`, deploy by hand to staging only:
   `npx vite build --mode staging` (check `grep -c spirieventsvbg dist/assets/index-*.js`
   is 0), then `firebase deploy --only functions --project tribe-vbg-staging` or
   `--only storage --project tribe-vbg-staging`. Alternatively start
   `deploy-staging.yml` via workflow_dispatch with `backend: true`.
4. Only then move each fixed card to **Testing Staging** and post the German
   `@petermathis1` comment (non-technical, say that it is on the test version /
   Staging and state any guesses). Skipped cards stay untouched.
5. Final summary to the user: commit, deploy result, cards moved.

## Step 0: Pre-flight

On a clean, up-to-date staging branch
(`git checkout feature/regions-epic && git pull --ff-only origin feature/regions-epic`)
run `npx vitest run`. If it is red before any change, fix that first with one
subagent. Run `npm run emulators:check` only when a ticket needs emulator tests.

## Step 1: Collect and triage

As in `fix-trello-bugs`, but with the Bugs Staging column. Collect comments and
`git log --all` / `git branch -a` history per card (shortLink and card-id prefix).

**Grouping (staging-specific):** tickets that touch the same component or the same
concept (e.g. several tickets about the neutral header title) may be bundled into
**one** subagent run and one branch `bugfix/staging_<topic>`, with **one commit per
ticket** (`fix(<shortLink>): …`) so each card stays traceable. Group only when the
tickets clearly share code; otherwise one ticket per run. Decide the grouping
before dispatching and tell the user.

## Step 2: Dispatch

Before each dispatch: `git checkout feature/regions-epic && git pull --ff-only origin feature/regions-epic && git status --short`.

Spawn a `general-purpose` subagent (model: sonnet by default, opus for vague or
auth/rules/data-loss work, haiku for purely mechanical; see fix-trello-bugs).
Self-contained prompt:

```
You are fixing Trello bug(s) on the STAGING branch in the repository root (cwd).
Read AGENTS.md and .claude/skills/process-trello-ticket/SKILL.md first and follow
them, with these overrides: the base and merge target is feature/regions-epic, NOT
main; the Firebase project is tribe-vbg-staging; the deploy workflow is
deploy-staging.yml; the destination list is "Testing Staging" (id 6ad0792deab4ae31aacf706b).

Ticket(s): <shortLink — name (card id), desc, comments, prior commits, bucket>
(one block per ticket)

Rules:
- Branch: bugfix/<shortLink>_<kebab-title> (or bugfix/staging_<topic> for a group)
  from the up-to-date feature/regions-epic.
- Minimal fix. Regression test at the lowest tier that fails before the fix
  (usually Vitest in tests/components/). No new Playwright spec files.
  page.waitForTimeout is banned.
- One commit per ticket: `fix(<shortLink>): <what>`, ending with:
  Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_012JRKfZoYgBcbFKuC437JSa
- Merge into feature/regions-epic with `git merge --no-ff`, push feature/regions-epic,
  delete the branch locally and remotely. NEVER touch main.
- Prefer letting hooks run; --no-verify only if the hook fails for reasons unrelated
  to your change, and say so in the report.
- Do NOT deploy to production, never use project spirieventsvbg.
- Do NOT move cards or comment on Trello: the orchestrator does that after the
  deploy-staging.yml run is green. Report back instead.
- If a ticket turns out not solvable (needs manual action, unclear), stop, change
  nothing, and report why.

Report in at most 10 lines: status per ticket (fixed / skipped + reason), commit
SHAs, files changed, tests added, hooks or --no-verify, whether functions/storage
need a manual staging deploy.
```

Wait for each subagent; keep only its short report in context.

## Step 3: After the subagent(s)

1. Wait for the `deploy-staging.yml` run of the final push; do manual
   functions/storage deploys to staging if needed.
2. Move fixed cards to Testing Staging and comment to Peter (template in
   `process-trello-ticket`, step 10, plus "auf der Testversion").
3. Summary table for the user: ticket, bucket, outcome, commit, notes.

## Guardrails

- Sequential only. Never write to `main`, never touch production data, secrets
  or console settings, never use the production Firebase project.
- Never write to Peter in English or technical language; never omit `@petermathis1`.
- Don't move or comment on skipped cards unless the user asks.
