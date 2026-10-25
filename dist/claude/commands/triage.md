---
description: Explain failing or flaky tests from the last run and propose fixes and bug reports
argument-hint: [page, case ID, or empty for all failures]
---


Triage: $ARGUMENTS

1. `node "${CLAUDE_PLUGIN_ROOT}/bin/qa-kit.mjs" ingest` (records the latest run if it is not recorded yet), then
   `node "${CLAUDE_PLUGIN_ROOT}/bin/qa-kit.mjs" history --filter failing` and `node "${CLAUDE_PLUGIN_ROOT}/bin/qa-kit.mjs" history --filter flaky`, filtered to the request.
2. Follow the qa-run-triage skill; use the qa-triager subagent when there are many failures.
3. Present one table: ID, class (app bug / test bug / environment / flaky / known), evidence,
   proposed action. Ask before changing tests or filing bugs.
4. Save certain lessons with `node "${CLAUDE_PLUGIN_ROOT}/bin/qa-kit.mjs" memory add`.
