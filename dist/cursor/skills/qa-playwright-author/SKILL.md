---
name: qa-playwright-author
description: Write, extend, or repair Playwright E2E specs and page objects that follow the project's own conventions (fixtures, folder layout, test IDs, tags, locator rules, mutation safety) as recorded in .qa-kit memory, config, and the project's rule docs. Use when automating catalog rows, fixing a broken locator or flaky test, or adding a page object.
---

# Write Playwright tests the project's way

## 1. Load the conventions before typing

```bash
qa-kit status                                   # detected conventions, rule docs, test language
qa-kit knowledge conventions                    # how tests are written here
qa-kit memory search "<page/module> selector"   # locators and gotchas found before
qa-kit cases --page <page dir>                  # rows to automate, their IDs and status
```

Open one existing spec closest to the page you work on as a style reference (`qa-kit index`
lists pages with the most tests), or the reference implementation the project's rules name.
Read only the code the rows you automate need: the page component, its validation schema,
and the API types of the endpoints it calls. Do not read backend source or other teams'
folders unless a row cannot be written without them.

Project conventions always win. Fall back to
[references/playwright-patterns.md](references/playwright-patterns.md) only for what the
project does not decide.

## 2. Where the files go

- Follow the folder layout in `conventions.md`. If there is none, put the spec next to the
  page's catalog and ask before inventing a new layout.
- One spec per tab or scenario group; a page object (`<page>.page.ts` or the project's
  naming) when there are several tabs/forms or shared API patterns.
- Import `test`/`expect` from the project's fixtures module
  (`qa-kit config get e2e.fixturesImport`), not straight from `@playwright/test`, when such
  a module exists.
- Do not import across scope folders (`e2e.scopes`) or other owners' areas. Do not edit
  shared support code unless the user asked; propose it instead.

## 3. Test shape

- Title starts with the catalog ID: `test('INV-05 <description in the project's test language>', …)`
  so `-g "INV-05"` runs it and the index links it to the catalog.
- Tags: the smoke tag for quick "page opens and lists data" checks only; the project's
  mutation tag (`e2e.mutationTags`) for anything that writes data.
- Locators by role, label, or text (`getByRole`, `getByLabel`, `getByText`), test IDs if
  the project uses them, or the fixture page objects. Element IDs are acceptable when a
  label is not linked. No CSS utility classes, no XPath on layout.
- No fixed sleeps (`waitForTimeout`). Wait on a locator, a URL, or an API response.
- Register the response wait **before** the click that triggers it, then assert it
  succeeded before navigating or reloading.
- Mutating tests: unique data with a recognisable prefix (e.g. `E2E` + timestamp), cleanup
  in `afterEach` so data is removed even when the test fails, never depend on records
  someone else may delete.
- Skip only for missing data, with a reason. Never `test.only`.
- Known app bug: keep the real assertion, add
  `annotation: { type: 'issue', description: '<ticket ID>' }`, and add or update the
  finding in the catalog. Do not use `test.fail`/`fixme` to turn it green.
- Assertion messages (second argument to `expect`) explain the requirement, so a failure
  reads like a bug report.

## 4. Verify statically, then (only if asked) by running

```bash
qa-kit index && qa-kit gaps --page <page dir>   # every automated row has its test, no orphans
```

Type-check or lint only with the commands the project allows. Run the new tests only
when the user asks (see `qa-run-triage`), narrowest scope, twice in a row: both runs must
agree.

## 5. Update catalog and memory

- Set the Automation column for each row you automated; record new findings.
- Save what you learned:

```bash
qa-kit memory add --kind selector --scope <page dir> "<element>: <locator that works and why>"
qa-kit memory add --kind gotcha --scope <page dir> "<what slowed you down and the fix>"
qa-kit memory add --kind convention "<rule a reviewer gave you>" --source "review <date>"
qa-kit memory add --global --kind gotcha "<Playwright/tooling lesson true for any app>"
```

When a reviewer corrects your style, also add the rule to `conventions.md` under
"Review feedback log" so it is applied on every future spec.
