# Test conventions

How tests are written in THIS project. Agents read this before writing a spec and update
it when a reviewer corrects them. Prefer the project's own rule files (AGENTS.md,
`.agent/rules`, `docs/`) as the source; summarize and link them here.

## Where things live

- Test folder layout:
- Test-case catalog file and template:
- Shared fixtures / page objects (import path):

## Naming

- Test title format (e.g. `<ID> <description>`), ID prefix rules, language of titles.

## Locators & waiting

- Preferred locator strategy, banned patterns (CSS classes, fixed sleeps, `page.goto`?).

## Data & mutation safety

- How tests that create/update/delete data are tagged, named, and cleaned up.

## Tags & projects

- `@smoke`, other tags, Playwright projects and how to run a narrow scope.

## Known bugs policy

- How a known app bug is kept visible (failing test + annotation + catalog entry).

## Review feedback log

- YYYY-MM-DD: correction received and the rule it became.
