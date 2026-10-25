---
name: qa-triage
description: Explain failing or flaky tests from the last run and propose fixes and bug reports
---


Triage: the text the user typed after the command

1. `qa-kit ingest` (records the latest run if it is not recorded yet), then
   `qa-kit history --filter failing` and `qa-kit history --filter flaky`, filtered to the request.
2. Follow the qa-run-triage skill; use the qa-triager subagent when there are many failures.
3. Present one table: ID, class (app bug / test bug / environment / flaky / known), evidence,
   proposed action. Ask before changing tests or filing bugs.
4. Save certain lessons with `qa-kit memory add`.

If `qa-kit` is not on PATH, use the CLI command that the `qa_status` tool prints.
