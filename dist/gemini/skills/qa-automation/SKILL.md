---
name: qa-automation
description: Entry point for any QA automation work on a web app - planning test cases, writing or fixing Playwright E2E tests, running and triaging test results, reviewing coverage, or asking what is already tested. Loads the project's QA memory (.qa-kit/), routes to the specialised qa-* skills, and makes sure what was learned is saved for the next session.
---

# QA automation loop

qa-kit gives every agent the same long-term QA memory for a project. The memory lives in
`<project>/.qa-kit/` and is reachable through the `qa-kit` CLI or the `qa-kit` MCP server
(tools `qa_*`). Use whichever your harness has; they do the same thing.

CLI invocation: `qa-kit <command>`. If `qa-kit` is not on PATH, use the command printed at
session start or by `qa_status` (`node "<kit>/bin/qa-kit.mjs"`), the `kit.cli` value in
`.qa-kit/config.json`, or run it without installing: `npx -y github:MahmulP/qa-kit <command>`
(needs Node.js 18+). Pass `--root <project>` when your cwd is not the project.

qa-kit is app-agnostic: it assumes no framework, folder layout, team structure, catalog
language, or naming scheme. Each app's conventions are detected into
`.qa-kit/config.json` (`qa-kit config`) and described in its memory files; lessons that hold
for every app live in the global store (`--global`). Several apps can use qa-kit side by
side; `qa-kit apps` lists them.

## Every task follows the same loop

1. **Recall** (always, takes seconds)
   - `qa-kit status` / `qa_status`: stack, e2e layout, coverage, health, top lessons.
   - No `.qa-kit/` yet: `qa-kit init` first, then the `qa-explore-app` skill.
   - `qa-kit memory search "<area words>" --scope <path>` / `qa_memory_search` for the area
     you are about to touch.
   - Read `.qa-kit/memory/conventions.md` before writing any test.
   - Read the project's own rules listed under "Project rules to obey". They win over
     anything in qa-kit. The "Detected conventions" line tells you the fixtures import,
     catalog names, ID pattern, suite script, scopes, and mutation tags; if one is wrong,
     fix it with `qa-kit config set` before working.
2. **Explore**: understand the page/feature from code, contracts, and (if allowed) the
   running app → skill `qa-explore-app`.
3. **Design cases**: catalog what should be tested, with expectations from requirements
   → skill `qa-test-cases`.
4. **Write specs**: Playwright tests that follow the project's conventions → skill
   `qa-playwright-author`.
5. **Run, only when the user asks**: narrowest scope, results recorded automatically →
   skill `qa-run-triage`.
6. **Triage**: app bug vs test bug vs environment vs flaky; keep known bugs visible.
7. **Learn** (never skip): save what will matter next time → skill `qa-memory`.

Pick the entry point from the request:

| Request | Start at |
| --- | --- |
| "What's tested / coverage / what's missing for X" | `qa-kit gaps --page X`, `qa-kit cases --page X` |
| "Learn this app / onboard / map the modules" | `qa-explore-app` |
| "Make test cases for page/ticket X" | `qa-test-cases` |
| "Write/automate tests for X", "fix this spec" | `qa-test-cases` (catalog first) → `qa-playwright-author` |
| "Run tests for X", "why did these fail" | `qa-run-triage` |
| "Remember that…", reviewer feedback, "that's wrong, we do it like…" | `qa-memory` |

## Rules that hold in every project

- **Expectations come from requirements**: ticket acceptance criteria, business rules, API
  contract (OpenAPI/types), validation schema, UI copy. Never assert whatever the app does
  today just because it does it. Where code and requirement disagree, the requirement is the
  expectation and the gap is a finding.
- **A known bug stays a failing test.** Do not weaken the assertion or hide it with
  skip/fixme. Annotate it with the issue ID and record it in the catalog's findings section.
- **Do not run E2E suites unless the user asks.** When asked, run the narrowest scope (one
  page, one ID). Never set the env vars in `e2e.protectedEnv` or other data-mutation
  switches, never point tests at production, never write credentials or session files
  anywhere.
- **IDs are stable.** Get new ones with `qa-kit next-id <PREFIX>`; never renumber.
- **Catalog and spec change together.** After editing either, `qa-kit index` and check
  `qa-kit gaps` for drift on that page.
- **Leave the memory better than you found it.** End every QA task by saving at least the
  lessons that would have saved you time today (see `qa-memory`). Say in your final message
  what you saved.

## Work budget: fast and cheap by default

- Work in the main session. One page, one module, or one failing feature never needs a
  subagent.
- A request without a clear scope ("write tests", "explore the app", a whole module) gets a
  short plan first: the pages or modules with their todo and gap counts from `qa-kit gaps`.
  Ask which to do before reading code.
- Start subagents only when the user named 3 or more pages or modules and agreed to run them
  in parallel; at most 3 at a time. Brief each one with what you already know (page folder,
  case IDs, fixtures import, a reference spec, empty memory sections) so it does not
  rediscover it.
- Recall with the compact commands (`status`, `cases --page`, `gaps --page`,
  `memory search`) instead of opening catalogs and specs one by one. Read conventions once
  per session.
- Read only the code the current rows need: the page component, its schema, and the API
  types of the endpoints it calls (searched, not read whole). Skip backend source, other
  teams' folders, and unrelated modules unless a row cannot be done without them.
- Never rewrite tests that already exist; only add what is missing.

## Subagents (Claude Code plugin; other harnesses can follow the same briefs)

- `qa-explorer`: read-only mapping of one module or page into memory.
- `qa-author`: catalog + spec for one page.
- `qa-triager`: analyse a large failed run, classify, propose fixes and bug reports.

Use them only within the work budget above; each one reads memory first and saves lessons
at the end.
