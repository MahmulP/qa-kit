---
description: Run Playwright tests at the narrowest scope, record results, and triage failures
argument-hint: <page path, case ID, or tag> [--script <package script>]
---


The user asked to run: $ARGUMENTS

1. Work out the narrowest scope (page folder and/or `-g "<ID>"`) and the right script/project
   from `qa-kit status` and `.qa-kit/memory/conventions.md`. Show the command with
   `qa-kit run --dry-run …` if anything is ambiguous.
2. Run it with `qa-kit run [--script <script>] -- <args>` (run in the background if it may take
   more than two minutes). Do not add data-mutation switches or change the target environment.
3. Triage the failures in this session with the qa-run-triage skill, grouped by feature and
   error so the same cause is analysed once. Use the qa-triager subagent only for more than 15
   distinct failures across 3 or more features, and ask first.
4. Update catalogs for confirmed bugs and save lessons with `qa-kit memory add`.

If `qa-kit` is not on PATH, use the CLI command that the `qa_status` tool prints.
