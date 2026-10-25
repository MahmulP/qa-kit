## QA automation (qa-kit)

This project uses **qa-kit** for QA automation memory. `.qa-kit/` holds what earlier
sessions learned about the app and its tests; read it before QA work and add to it after.

- CLI: `{{QA_KIT}}` (`scan`, `status`, `config`, `index`, `gaps`, `cases`, `next-id`, `memory search|add|forget`, `run`, `ingest`, `history`, `apps`).
- Project conventions qa-kit detected (fixtures import, catalog names, ID pattern, scopes, mutation tags, protected env vars) are in `.qa-kit/config.json`; qa-kit itself assumes no layout.
- MCP server `qa-kit` exposes the same as tools (`qa_status`, `qa_config`, `qa_memory_search`, `qa_memory_add`, `qa_find_cases`, `qa_coverage_gaps`, `qa_next_id`, `qa_test_history`, `qa_ingest_results`).
- Skills (in `.agents/skills/` or your harness's skills folder): `qa-automation` (start here), `qa-explore-app`, `qa-test-cases`, `qa-playwright-author`, `qa-run-triage`, `qa-memory`.

Loop for every QA task: **recall → explore → design cases → write spec → run (only when asked) → triage → learn**.

1. Recall: `{{QA_KIT}} status`, then `{{QA_KIT}} memory search "<area>"` and read `.qa-kit/memory/conventions.md`.
2. The project's own QA rules win over qa-kit defaults{{RULE_DOCS}}.
3. Expected results come from requirements (ticket, API contract, schema, UI copy), never from what the app does today. A known bug stays a failing test with an issue annotation and a catalog finding.
4. Do not run E2E suites unless the user asks; then run the narrowest scope. Never set the env vars in `e2e.protectedEnv`, never enable data-mutating flags or point tests at production yourself. Never write credentials into files.
5. After a run, results are recorded (`{{QA_KIT}} ingest` if your harness has no hook). Save durable lessons with `{{QA_KIT}} memory add --kind <fact|convention|selector|gotcha|bug|flaky|decision|data> "<text>" --scope <path>` (add `--global` for lessons true for every app).
