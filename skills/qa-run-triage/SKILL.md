---
name: qa-run-triage
description: Run Playwright tests at the narrowest useful scope when the user asks, record results into qa-kit history, and triage failures into app bug, test bug, environment/permission problem, or flaky test - with evidence, catalog updates, and bug reports grouped per feature. Use for "run the tests for X", "why did this fail", "is this flaky", or after any Playwright run.
---

# Run and triage

## Running (only on request)

Do not start E2E runs on your own. When the user asks:

1. Pick the narrowest scope: one page folder, or one case with `-g "<ID>"`.
2. Prefer running through qa-kit: it picks the package script or Playwright project from
   the configured scopes (`qa-kit config get e2e.scopes`), captures a JSON report, and
   updates history:

```bash
qa-kit run --dry-run -- e2e/billing/invoices            # show the resolved command first
qa-kit run -- e2e/billing/invoices -g "INV-04"          # script/project chosen from scopes
qa-kit run --script test:e2e:admin -- users             # or name the package script
qa-kit run -- --project=chromium tests/checkout         # or pass Playwright flags directly
```

   Any other Playwright command also works; then record results with `qa-kit ingest` (the
   Claude Code plugin does this automatically after the command).
3. Never set the env vars listed in `e2e.protectedEnv` (data-mutation or production
   switches), never change the target environment, never print or copy credentials or
   session files. If a test needs a switch the user has not set, report that it was
   skipped and why.
4. A new or changed spec runs twice; both results must match.

## Read what happened

```bash
qa-kit history --filter failing      # current failures with last error
qa-kit history --filter flaky        # status flips over the last runs (p F ~ s)
qa-kit memory search "<test ID or page>" --kind bug
qa-kit cases --id <ID>               # expectation, known issue, catalog finding
```

For each failure open the error and the screenshot/trace in the project's output dir
(`qa-kit config get e2e.outputDir`; `error-context.md` holds the error and an accessibility
snapshot).

## Classify (decide before changing anything)

| Evidence | Class | Action |
| --- | --- | --- |
| Backend rejected the UI's request (4xx with validation errors) and the payload differs from the API contract | **App bug** | Keep test failing, annotate, add finding, report |
| UI differs from the requirement (missing control, wrong text, wrong rule) | **App bug** | Same as above |
| Locator not found after an intended UI change; test assumed wrong data | **Test bug** | Fix the test; save a selector/gotcha lesson |
| Redirect / access denied / missing menu for the test account | **Permission / environment** | Not an app bug; note role + environment in memory (`data` or `gotcha`) |
| Timeouts on first test, server not ready, login/session conflicts | **Environment** | Re-run once; save a gotcha if it repeats |
| Passes on re-run without changes; history shows flips | **Flaky** | Find the timing/data dependency and fix it; record a `flaky` lesson with the cause |
| Already listed as a known issue in the catalog / memory | **Known bug** | Do not re-report; confirm it still fails |

Never "fix" an app bug by weakening an assertion, adding skip/fixme, or copying the
current wrong behaviour into the expectation.

## Report

- Group confirmed app bugs **per feature**, not per test: test IDs, run command, environment
  and role (no passwords), expected vs actual, evidence path. Use a tracker MCP if the user
  wants it filed, otherwise give a ready-to-paste report.
- Update the page catalog: Automation column (e.g. `failing: bug`, in the catalog's
  language) and Findings with run date and environment.

## Learn (mandatory)

```bash
qa-kit memory add --kind bug   --scope <page dir> "<IDs>: <bug>, confirmed <date> on <env>, issue <ID>"
qa-kit memory add --kind flaky --scope <page dir> "<ID> flips because <cause>; fixed by <change>"
qa-kit memory add --kind gotcha "<environment lesson for this app>"
qa-kit memory add --global --kind gotcha "<lesson true for every app, e.g. a Playwright behaviour>"
```

If an earlier memory entry was wrong (e.g. a "bug" that was a permission problem), retire it:
`qa-kit memory forget <ID> --reason "<why>"` or add the corrected entry with
`--supersedes <ID>`.
