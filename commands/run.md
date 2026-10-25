---
description: Run Playwright tests at the narrowest scope, record results, and triage failures
argument-hint: "<page path, case ID, or tag> [--script <package script>]"
---

The user asked to run: {{ARGS}}

1. Work out the narrowest scope (page folder and/or `-g "<ID>"`) and the right script/project
   from `{{CLI}} status` and `.qa-kit/memory/conventions.md`. Show the command with
   `{{CLI}} run --dry-run …` if anything is ambiguous.
2. Run it with `{{CLI}} run [--script <script>] -- <args>` (run in the background if it may take
   more than two minutes). Do not add data-mutation switches or change the target environment.
3. Triage every failure with the qa-run-triage skill (qa-triager subagent for many failures).
4. Update catalogs for confirmed bugs and save lessons with `{{CLI}} memory add`.
