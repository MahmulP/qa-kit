---
description: Automate test cases as Playwright specs for a page (catalog first, project conventions, no run unless asked)
argument-hint: "<page/menu/route or case IDs> [run]"
---

Automate tests for: {{ARGS}}

1. Recall: `{{CLI}} status`, `{{CLI}} knowledge conventions`, `{{CLI}} memory search "<page>"`,
   `{{CLI}} cases --page <page>`.
2. If the page has no catalog or the rows are missing, do the qa-test-cases skill first.
3. Write specs with the qa-playwright-author skill. For several pages, run one qa-author
   subagent per page in parallel.
4. `{{CLI}} index` and `{{CLI}} gaps --page <page>` must show no drift for the page.
5. Run tests only if the request says so ("run"), via `{{CLI}} run` at the narrowest scope, twice.
6. Save lessons with `{{CLI}} memory add` and list their IDs in your answer.
