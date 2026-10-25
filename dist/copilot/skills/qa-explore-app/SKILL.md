---
name: qa-explore-app
description: Learn a web application for QA - read its file structure, routes/menus, page components, validation schemas, API contracts, permissions, and existing E2E tests, optionally walk the running app in a browser, then record the knowledge in .qa-kit/memory so later test design starts from facts. Use when onboarding a project, before testing an unfamiliar module or page, or when memory says a knowledge section is still empty.
---

# Explore the app and remember it

Goal: after this skill, `.qa-kit/memory/app.md`, `conventions.md`, and `glossary.md` describe
the project well enough that another agent can design and write tests without re-reading
everything. Exploration is read-only: do not change app code or tests here.

qa-kit assumes no folder layout, naming scheme, language, or team structure. Everything
project-specific is either detected by `scan` into `.qa-kit/config.json` or written by you
into the memory files.

## 1. Start from what is already known

```bash
qa-kit status                        # or qa_status
qa-kit scan                          # refresh structure: stack, e2e layout, routes, rule docs
qa-kit memory search "<module>"      # earlier findings for this area (project + global)
```

`scan` writes `.qa-kit/index/structure.json` (routes with a heuristic `covered` flag,
specs, fixtures, page objects, tags, scripts, env var names, rule docs, test areas). Read it
instead of re-walking the tree.

## 2. Read the project's own rules, then confirm the detected conventions

Read every QA-related doc the scan lists (agent instruction files, rule folders, `docs/**`
guides about tests, the e2e README). Summarize the rules that constrain test writing into
`conventions.md`, each with a link to its source. Do not copy whole documents; link them.

Then check what the scan detected and correct what is wrong; runs, the index, and the
hooks depend on it:

```bash
qa-kit config                                        # all detected conventions
qa-kit config set e2e.projects '["admin","shop"]'    # projects computed in code
qa-kit config set e2e.scopes '[{"path":"e2e/admin","project":"admin","script":"test:e2e:admin"}]'
qa-kit config set catalog.languages '["en"]'         # languages the catalogs are written in
qa-kit config set catalog.idPattern '[A-Z]{2,5}-\d{3}'
```

Write the folder layout rule (for example "one folder per page, mirroring the sidebar
menu" or "one spec per user journey") into `conventions.md` → "Where things live".

## 3. Map the area you were asked about

Map one module or page at a time, in the main session. For a whole project, list the modules
first and let the user pick; start parallel `qa-explorer` subagents (at most 3) only when the
user asks for several modules at once. Explore only what memory does not already describe,
and find code by targeted search instead of opening every file.

| Question | Where to look (adapt to the framework) |
| --- | --- |
| Which pages exist, URL of each | `structure.json` routes; menu/sidebar/navigation config; router files |
| Which component renders the page | route file → imported feature/module components |
| Visible text the tests will use | headings, table titles, column headers, button labels, dialog titles, toast messages, empty-state text |
| Validation rules | Zod/Yup/Valibot/class-validator schemas, form `required`/`maxlength`/`min`/`max`, custom validators |
| API calls and payload shapes | OpenAPI/GraphQL types, API client modules, query/mutation hooks |
| Who may do what | permission maps, route guards, permission-wrapper components, role checks |
| Existing tests and helpers | specs and page objects under the e2e dir; shared fixtures |

When a code-graph tool or a docs MCP is available, prefer it for "where is X used" questions.

## 4. Walk the running app (only if the user allows it and an environment is running)

Use a browser tool (Playwright MCP, Chrome DevTools MCP, the harness browser) on a
non-production URL. Log in only with credentials the project already provides for tests
(env files, never typed into chat or files). Capture:

- the accessibility tree / role + name of key controls (these become locators),
- the real labels vs the code (translations, dynamic text),
- loading and empty states, toasts, dialogs.

Never create, edit, or delete data while exploring.

## 5. Write it down

- `app.md`: modules table (module, route prefix, owner, notes), auth/roles, environments,
  recurring UI patterns (which shared components render tables/forms/dialogs/exports and
  how to locate them), fragile areas.
- `glossary.md`: UI terms as displayed (in the app's language) and their meaning.
- `conventions.md`: only test-writing rules, each linked to its source.
- Atomic facts that do not fit a section:

```bash
qa-kit memory add --kind fact --scope src/features/invoices "Invoice form validation lives in invoice-form.tsx validate() (L40-58): only number, customer and due date are required."
qa-kit memory add --kind selector --scope e2e/billing/invoices "Currency select has no linked label; locate it with #invoice-currency."
```

Keep entries short, specific, with `file:line` evidence. Do not save what `scan` already
derives (counts, file lists) or anything secret (passwords, tokens, session files, real
customer data). Lessons that hold for every app (tooling, Playwright behaviour) go in with
`--global`.

## 6. Report

Tell the user what you mapped, which memory sections you filled, which detected
conventions you corrected, the coverage picture (`qa-kit gaps`), and the riskiest untested
areas you saw. Suggest the next pages to cover.
