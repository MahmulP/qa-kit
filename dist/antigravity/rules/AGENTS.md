# qa-kit: QA automation memory

For any QA work on a web app (test cases, Playwright specs, test runs, triage, coverage
questions), use the `qa-automation` skill and the `qa-kit` MCP tools.

1. Start with the `qa_status` tool, passing `root` = the absolute path of the app under test.
   If it reports no store, call `qa_scan` first. CLI equivalent: `qa-kit status`.
2. Before planning or writing tests for an area, call `qa_memory_search` and read the
   project's own QA rules that `qa_status` lists. They win over qa-kit defaults.
3. Expected results come from requirements (ticket, API contract, schema, UI copy), never
   from what the app does today. A known bug stays a failing test with an issue annotation
   and a catalog finding.
4. Do not run E2E suites unless the user asks; then run the narrowest scope. Never set the
   env vars listed under `e2e.protectedEnv`, never point tests at production, never write
   credentials into files.
5. Before finishing, save durable lessons with `qa_memory_add` (add `global: true` for
   lessons that hold for every app) and tell the user the memory IDs.
