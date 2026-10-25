---
description: Show what qa-kit knows - stack, coverage, test health, gaps, and top lessons
argument-hint: [page or module to focus on]
---


1. Run `node "${CLAUDE_PLUGIN_ROOT}/bin/qa-kit.mjs" status`. If "$ARGUMENTS" names an area, also run `node "${CLAUDE_PLUGIN_ROOT}/bin/qa-kit.mjs" gaps --page "$ARGUMENTS"`
   and `node "${CLAUDE_PLUGIN_ROOT}/bin/qa-kit.mjs" history --query "$ARGUMENTS"`.
2. Summarize for the user: coverage (automated / todo / manual), drift between catalogs and
   specs, failing and flaky tests, empty memory sections, and the three most useful next steps.
