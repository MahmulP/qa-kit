---
description: Explain failing or flaky tests from the last run and propose fixes and bug reports
argument-hint: "[page, case ID, or empty for all failures]"
---

Triage: {{ARGS}}

1. `{{CLI}} ingest` (records the latest run if it is not recorded yet), then
   `{{CLI}} history --filter failing` and `{{CLI}} history --filter flaky`, filtered to the request.
2. Follow the qa-run-triage skill; use the qa-triager subagent when there are many failures.
3. Present one table: ID, class (app bug / test bug / environment / flaky / known), evidence,
   proposed action. Ask before changing tests or filing bugs.
4. Save certain lessons with `{{CLI}} memory add`.
