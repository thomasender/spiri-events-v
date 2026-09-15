# spirituelle-events-vorarlberg

Project instructions live in **[AGENTS.md](./AGENTS.md)** — read it before working
in this repo. It is the single source of truth for both Claude Code and opencode.

Two things that catch people out, called out here so they are not missed:

- **Testing policy** (`AGENTS.md` → Testing). The default is _not_ to write a new
  Playwright test. Logic and component behaviour go into Vitest
  (`tests/components/`, ~5 s for the whole suite). Playwright is reserved for
  behaviour that genuinely needs a real browser and real Firebase, and new tests
  are added to existing spec files rather than one file per ticket.
  `page.waitForTimeout()` is banned.

- **Peter is the product owner** and tests on production, not locally. Comments
  to him go in German, in non-technical language, and must start with
  `@petermathis1` or he is not notified.
