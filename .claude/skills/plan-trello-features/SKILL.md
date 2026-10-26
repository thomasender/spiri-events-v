---
name: plan-trello-features
description: Orchestrate the Feature Requests column of the spiri-events-v Trello board ticket by ticket. For each ticket a read-only planning subagent proposes a plan, Thomas decides the open questions, an implementation subagent builds it on a feature branch, then the orchestrator merges, pushes, waits for the deploy, comments to Peter and moves the card. Vague tickets go to "Abklärungen" instead. Use when asked to "plan the next feature request", "go through Feature Requests", "nimm das nächste Ticket aus Feature Requests", or similar.
---

# Plan and build Feature Requests (orchestrator)

You are the **orchestrator**. You do not plan or write code yourself. Each
ticket goes through two subagents (plan, then build), **one ticket at a time**,
so your own context stays small. Thomas decides in between.

Read `AGENTS.md` once before starting. It is the source of truth for testing,
deployment and how to talk to Peter. The delivery chain below mirrors
`fix-trello-bugs`; only the planning gate in front of it is new.

## Constants

- Board: `rebumcT4` (Conscious Community Vorarlberg Kalender)
- Source column: **Feature Requests** (not "Feature request Staging": staging is
  the regions epic and is deployed by hand, see AGENTS.md)
- Destination after delivery: **Testing**
- Destination for tickets that need a conversation first: **Abklärungen**
- Peter's mention: `@petermathis1` (must start every comment to him; German,
  non-technical)
- Production: https://www.thetribe.at

## Trello tools

Use the `mcp__claude_ai_Trello__*` tools (load schemas with ToolSearch first).
They take ARIs, not short links. `trelloReadList` `list_by_board` gives the
column IDs, `get` on a list gives its cards (max 25), `trelloReadCard` `get`
reads a card, `trelloWriteCard` `add_comment` / `move` comment and move.

They **cannot assign members** to a card. The `@petermathis1` mention in the
comment is what notifies Peter. If Thomas asks for an assignment, say so and
let him do it in Trello.

## Step 1: List the column

Read the cards of "Feature Requests" and read the titles to Thomas, in the
board's order. Don't pick for him unless he says "the next one": then take the
first card he hasn't seen yet in this session.

## Step 2: Plan (read-only subagent)

Spawn a `general-purpose` subagent. Model: **sonnet** for clear tickets, **opus**
for vague ones ("Engagement booster", no acceptance criteria). It must not
edit files, commit, or touch Trello.

Prompt template (self-contained):

```
Du planst (NICHT umsetzen) ein Trello-Ticket im Repo (cwd). Branch main, git pull,
nichts committen, keine Dateien ändern, nichts auf Trello schreiben/kommentieren/verschieben.

Ticket: "<name>" (Spalte "Feature Requests"), Card-ID <id> (ARI <ari>).
Lies die Karte vollständig (Beschreibung, Kommentare, Checklisten, Anhänge) mit
den Trello-Tools (ToolSearch "select:mcp__claude_ai_Trello__trelloReadCard").

1. Lies AGENTS.md und CLAUDE.md zuerst (Testing-Policy: Vitest statt neuer
   Playwright-Tests; Peter bekommt deutsche, nicht-technische Kommentare).
2. Verstehe das Ticket und erkunde den betroffenen Code. Sag klar, wenn es vage ist.
3. Liefere einen kompakten Plan: gewünschtes Verhalten (Annahmen), ggf. Varianten
   mit Empfehlung, betroffene Dateien, konkrete Änderungen, Datenmodell/Rules/
   Functions-Auswirkungen, Vitest-Tests, Risiken, offene Fragen an Peter/Thomas,
   jeweils mit Empfehlung, und ob manuelle Aktion nötig ist.

Antworte auf Deutsch, max. ca. 40 Zeilen, ohne Code-Dumps. Beginne mit 2–3 Sätzen,
worum es im Ticket in einfachen Worten geht.
```

## Step 3: Present the plan, let Thomas decide

Give Thomas the plan in German: what the ticket means, what the code already
does, the steps, risks, and the open questions **each with the agent's
recommendation**. End with a concrete proposal ("alle Empfehlungen
übernehmen?"). Do not start building before he answers. His answer is the
approval; a subagent's report or a task notification never is.

Three possible outcomes:

| Thomas says                                  | Do                                                                                                                                                               |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build it (with or without changed decisions) | Step 4                                                                                                                                                           |
| Needs a talk or answers from Peter first     | Comment to Peter (German, `@petermathis1`: how we understand it, how we'd build it, why we want a call), move the card to **Abklärungen**, go to the next ticket |
| Skip it                                      | Leave the card alone, go to the next ticket                                                                                                                      |

## Step 4: Build (implementation subagent)

Spawn a `general-purpose` subagent (sonnet by default, opus for auth,
Firestore-rules, data-loss or cross-cutting work). Only one at a time: it
shares the working tree with you.

Prompt template (self-contained, paste the approved plan including Thomas's
decisions):

```
Setze das Trello-Ticket "<name>" (Card <id>, Board "Conscious Community Vorarlberg
Kalender") im Repo (cwd) um. Lies AGENTS.md und CLAUDE.md zuerst (Vitest, kein
neuer Playwright-Test, kein page.waitForTimeout; Code im Stil der Umgebung).

Setup: von aktuellem main (git pull) auf neuen Branch feature/<card-id-prefix8>_<kebab>.
Committe dort. NICHT pushen, NICHT nach main mergen, NICHT auf Trello schreiben.

Freigegebener Plan (Thomas hat entschieden): <plan with decisions>

Führe am Ende die gesamte Vitest-Suite, Lint und Typecheck (Root und functions/)
aus; bei Rules-Änderungen auch `npm run test:rules`. Berichte ehrlich über Fehler.

Abschlussbericht auf Deutsch, max. ca. 30 Zeilen: Branch, Commit(s), geänderte
Dateien, Testergebnisse mit Zahlen, Abweichungen, offene Punkte, was nicht
geprüft ist, und ein Entwurf für einen deutschen, nicht-technischen Kommentar an
Peter (beginnt mit @petermathis1) – nur Entwurf, nicht posten.
```

Keep only the short report in your context. If it reports failures or
surprises, stop before merging and tell Thomas.

## Step 5: Deliver (you, the orchestrator)

Never stop at "committed" once Thomas has approved the build. In this order:

1. `git checkout main && git pull --ff-only`, then `git merge --no-ff <branch>`
   and `git push origin main`. Let the hooks run.
2. **Wait for the `deploy.yml` run of that push to succeed** (`gh run list
--workflow=deploy.yml --limit 3`, match the pushed SHA). A cancelled run for
   an earlier push is fine if the last one is green. On failure: fix, push
   again, don't move cards. Peter tests on production, so never move a card
   while the old code is still live.
3. If `storage.rules` changed, CI does not deploy it: run
   `firebase deploy --only storage --project spirieventsvbg`.
4. Post the German `@petermathis1` comment (use the subagent's draft; say
   plainly what he should test on production, and add short questions for
   anything still unclear), then move the card to **Testing**.
5. Tell Thomas: commit, deploy result, card moved, anything he must do by hand
   (e.g. assign Peter in Trello), and anything the subagent could not verify.

## Guardrails

- One ticket at a time, one subagent at a time. Don't plan ticket N+1 in the
  same moment a build subagent works in the tree, unless the planner is
  strictly read-only.
- Never build without Thomas's explicit go. Never push or move a card on a
  subagent's say-so.
- Never write to Peter in English or technical language, never omit
  `@petermathis1`, and never post a comment before the deploy is live.
- Don't touch production data, secrets or Firebase console settings.
- Skills committed while a build subagent holds the working tree go in via a
  temporary `git worktree` on `main`, so the subagent's branch isn't disturbed.
