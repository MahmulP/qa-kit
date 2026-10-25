---
description: Set up qa-kit memory for this project (scan structure, index test cases, optional adapters for other agents)
argument-hint: "[targets: agents-md,skills,codex,cursor,gemini,copilot,antigravity|all]"
---


Set up qa-kit for the current project.

1. Run `node "${CLAUDE_PLUGIN_ROOT}/bin/qa-kit.mjs" init`. If the user named adapter targets ("$ARGUMENTS"), add `--targets <list>`.
2. Show the scan summary and catalog counts. Point out everything the scan guessed (test dir,
   fixtures import, Playwright projects, scopes folder→project/script, suite script, catalog file
   names, ID pattern, catalog languages, mutation tags, protected env vars) and ask the user to
   confirm or correct it with `node "${CLAUDE_PLUGIN_ROOT}/bin/qa-kit.mjs" config set <path> <value>`.
3. Read the project's QA rule docs listed by the scan and summarize the test-writing rules
   (including the folder layout) into `.qa-kit/memory/conventions.md` with links to the sources.
4. Offer the next step: map the app with the qa-explore-app skill (one qa-explorer subagent per
   module), or start on a specific page.
5. Remind the user to commit `.qa-kit/` (index/ and history/ are git-ignored).
