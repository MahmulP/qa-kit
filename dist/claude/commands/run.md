---
description: Run Playwright tests at the narrowest scope, record results, and triage failures
argument-hint: <page path, case ID, or tag> [--script <package script>]
---


The user asked to run: $ARGUMENTS

1. Work out the narrowest scope (page folder and/or `-g "<ID>"`) and the right script/project
   from `node "${CLAUDE_PLUGIN_ROOT}/bin/qa-kit.mjs" status` and `.qa-kit/memory/conventions.md`. Show the command with
   `node "${CLAUDE_PLUGIN_ROOT}/bin/qa-kit.mjs" run --dry-run …` if anything is ambiguous.
2. Run it with `node "${CLAUDE_PLUGIN_ROOT}/bin/qa-kit.mjs" run [--script <script>] -- <args>` (run in the background if it may take
   more than two minutes). Do not add data-mutation switches or change the target environment.
3. Triage every failure with the qa-run-triage skill (qa-triager subagent for many failures).
4. Update catalogs for confirmed bugs and save lessons with `node "${CLAUDE_PLUGIN_ROOT}/bin/qa-kit.mjs" memory add`.
