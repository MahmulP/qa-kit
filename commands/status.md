---
description: Show what qa-kit knows - stack, coverage, test health, gaps, and top lessons
argument-hint: "[page or module to focus on]"
---

1. Run `{{CLI}} status`. If "{{ARGS}}" names an area, also run `{{CLI}} gaps --page "{{ARGS}}"`
   and `{{CLI}} history --query "{{ARGS}}"`.
2. Summarize for the user: coverage (automated / todo / manual), drift between catalogs and
   specs, failing and flaky tests, empty memory sections, and the three most useful next steps.
