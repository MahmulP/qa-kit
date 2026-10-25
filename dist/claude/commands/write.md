---
description: Automate test cases as Playwright specs for a page (catalog first, project conventions, no run unless asked)
argument-hint: <page/menu/route or case IDs> [run]
---


Automate tests for: $ARGUMENTS

1. Recall: `node "${CLAUDE_PLUGIN_ROOT}/bin/qa-kit.mjs" status`, `node "${CLAUDE_PLUGIN_ROOT}/bin/qa-kit.mjs" knowledge conventions`, `node "${CLAUDE_PLUGIN_ROOT}/bin/qa-kit.mjs" memory search "<page>"`,
   `node "${CLAUDE_PLUGIN_ROOT}/bin/qa-kit.mjs" cases --page <page>`.
2. If the page has no catalog or the rows are missing, do the qa-test-cases skill first.
3. Write specs with the qa-playwright-author skill. For several pages, run one qa-author
   subagent per page in parallel.
4. `node "${CLAUDE_PLUGIN_ROOT}/bin/qa-kit.mjs" index` and `node "${CLAUDE_PLUGIN_ROOT}/bin/qa-kit.mjs" gaps --page <page>` must show no drift for the page.
5. Run tests only if the request says so ("run"), via `node "${CLAUDE_PLUGIN_ROOT}/bin/qa-kit.mjs" run` at the narrowest scope, twice.
6. Save lessons with `node "${CLAUDE_PLUGIN_ROOT}/bin/qa-kit.mjs" memory add` and list their IDs in your answer.
