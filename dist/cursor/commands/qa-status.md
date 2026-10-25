---
name: qa-status
description: Show what qa-kit knows - stack, coverage, test health, gaps, and top lessons
---


1. Run `qa-kit status`. If "the text the user typed after the command" names an area, also run `qa-kit gaps --page "the text the user typed after the command"`
   and `qa-kit history --query "the text the user typed after the command"`.
2. Summarize for the user: coverage (automated / todo / manual), drift between catalogs and
   specs, failing and flaky tests, empty memory sections, and the three most useful next steps.

If `qa-kit` is not on PATH, use the CLI command that the `qa_status` tool prints.
