---
name: process-trello-ticket
description: Process a Trello ticket from analysis through implementation, testing, and moving to Testing list. Use when given a Trello ticket URL to implement. Project-specific skill for spiri-events-v.
---

# Process Trello Ticket

End-to-end workflow for processing a Trello ticket: analyze, plan, implement, test, commit, push, and move ticket to Testing.

## Prerequisites

- Trello ticket URL (e.g., `https://trello.com/c/leUdxGn4`)
- Trello board ID: `rebumcT4` (Conscious Community Vorarlberg Kalender)
- Testing list name: `Testing`

## Workflow

### 1. Fetch & Analyze Ticket

Extract the card short ID from URL (e.g., `leUdxGn4` from `https://trello.com/c/leUdxGn4`).

Use `trello_get_card` to fetch:
- Title and description
- Comments for context
- Labels for type (bugfix/feature)

Determine if code change is needed:
- Bug reports → likely needs fix
- Questions/queries → may not need code
- Documentation → may not need code

### 2. Create Branch

If code change is needed:

```
git checkout -b <type>/<short-id>_<kebab-case-title>
```

Types: `feature`, `bugfix`, `task`

Branch formula: `<type>/<short-id>_<descriptive-name>`

Examples:
```
bugfix/leUdxGn4_fix-event-date-display
feature/leUdxGn4_add-recurrence-option
```

Use `git checkout -b` directly (do not push yet).

### 3. Load Relevant Skills

For Vue/components: Load `vue-best-practices`
For Firebase/Firestore: Load `firebase-firestore`

### 4. Understand & Plan

Read relevant code:
- Event-related features → check `src/views/`, `src/components/`, `src/stores/`
- Firestore rules → check `firestore.rules`
- Tests → check `tests/e2e/`, `tests/integration/`

Plan minimal change that solves the problem.

### 5. Implement

Make the code change following project conventions:
- Vue 3 + Options API + TypeScript
- Pinia for state management
- Conventional commits: `fix:`, `feat:`, `chore:`, `docs:`

### 6. Test

Start emulators (if not running):
```bash
firebase emulators:start --import ./data-export
```

Run e2e tests:
```bash
npm run test:e2e
```

Run typecheck:
```bash
npm run typecheck
```

Run lint:
```bash
npm run lint
```

### 7. Commit & Push

```bash
git add .
git commit -m "<type>(<short-id>): <description>"
git push -u origin HEAD
```

Commit format: `<type>(<short-id>): <description>`
Examples:
- `fix(leUdxGn4): correct event date display for recurring events`
- `feat(leUdxGn4): add recurrence option to event form`

### 7.1 Merge to Main

After successful implementation and testing, merge the branch to main:

```bash
git checkout main
git pull origin main
git merge --no-ff <branch-name>
git push origin main
```

Delete the feature branch after merging:
```bash
git branch -d <branch-name>
git push origin --delete <branch-name>
```

### 8. Move Ticket to Testing

Use `trello_get_lists` to find the "Testing" list ID (board ID: `rebumcT4`).

Move card:
```
trello_move_card with idList = Testing list ID
```

### 9. Comment for Peter

Add comment with testing instructions:

**In German, non-technical language.**

Template:
```
@petermathis1 Die Änderung ist fertig und kann getestet werden!

Was wurde geändert:
• <1-2 sentence summary in plain German>

Wie getestet wird:
• <Clear, simple steps Peter can follow on production>

Link zum Testen:
<production URL if applicable>
```

Example:
```
@petermathis1 Die Änderung ist fertig und kann getestet werden!

Was wurde geändert:
• User können jetzt ihre eigenen Events wieder ansehen, auch wenn diese noch nicht freigegeben sind.

Wie getestet wird:
1. Logge dich als User ein (nicht als Admin)
2. Gehe zu "Meine Events"
3. Prüfe ob deine Events angezeigt werden, auch die mit Status "ausstehend"

Link: https://events.thetribe.at
```

## Important Notes

- **Always use emulators + real data dump for local testing** - never test against production locally
- **Peter tests on production** - provide production URLs
- **Write in German** - Peter is a German speaker
- **Non-technical language** - never mention: useEffect, hooks, queries, commits, branches, etc.
- **Short and clear** - focus on what works/doesn't work for users

## Related Skills

- `vue-best-practices` - for Vue component implementation
- `firebase-firestore` - for Firestore queries and rules
- `create-new-branch` - for branch naming convention reference
