---
description: Show what qa-kit knows - stack, coverage, test health, gaps, and top lessons
argument-hint: [page or module to focus on]
---


1. Run `qa-kit status`. If "$ARGUMENTS" names an area, also run `qa-kit gaps --page "$ARGUMENTS"`
   and `qa-kit history --query "$ARGUMENTS"`.
2. Summarize for the user: coverage (automated / todo / manual), drift between catalogs and
   specs, failing and flaky tests, empty memory sections, and the three most useful next steps.

If `qa-kit` is not on PATH, use the CLI command that the `qa_status` tool prints.
