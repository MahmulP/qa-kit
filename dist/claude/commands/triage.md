---
description: Explain failing or flaky tests from the last run and propose fixes and bug reports
argument-hint: [page, case ID, or empty for all failures]
---


Triage: $ARGUMENTS

1. `node "${CLAUDE_PLUGIN_ROOT}/bin/qa-kit.mjs" ingest` (records the latest run if it is not recorded yet), then
   `node "${CLAUDE_PLUGIN_ROOT}/bin/qa-kit.mjs" history --filter failing` and `node "${CLAUDE_PLUGIN_ROOT}/bin/qa-kit.mjs" history --filter flaky`, filtered to the request.
2. Group failures by feature and by error message first: failures with the same cause are
   triaged once. Check memory and the catalog findings before reading code; known bugs need
   no new investigation.
3. Follow the qa-run-triage skill in this session. Use the qa-triager subagent only when
   there are more than 15 distinct failures across 3 or more features, and ask before
   starting it.
4. Present one table: ID, class (app bug / test bug / environment / flaky / known), evidence,
   proposed action. Ask before changing tests or filing bugs.
5. Save certain lessons with `node "${CLAUDE_PLUGIN_ROOT}/bin/qa-kit.mjs" memory add`.
