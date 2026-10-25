---
description: Automate test cases as Playwright specs (catalog first, project conventions, no run unless asked)
argument-hint: <page folder, menu, route, or case IDs> [run]
---


Automate tests for: $ARGUMENTS

Keep it fast and cheap: work in this session, read only what the rows need, and start
subagents only as step 2 allows.

1. **Scope first.**
   - No argument, or a whole module (e.g. `ffb`): run `node "${CLAUDE_PLUGIN_ROOT}/bin/qa-kit.mjs" index --page <module>` (one
     line per page with automated / todo / manual counts) and show it as a short table. Ask
     which pages to do and stop there. Do not read code or write anything yet.
   - One page or a list of case IDs: continue below in this session.
2. **Several pages, only when the user named them:** do up to 2 yourself, one after the
   other. For 3 or more, ask once whether to run them in parallel. If yes, start at most 3
   qa-author subagents at a time, and give each a brief with the page folder, the case IDs to
   automate, the fixtures import, and the path of one reference spec, so it does not rediscover
   them. Otherwise continue one page at a time.
3. **Recall once.** Per page: `node "${CLAUDE_PLUGIN_ROOT}/bin/qa-kit.mjs" cases --page <page>` (rows, status, linked specs) and
   `node "${CLAUDE_PLUGIN_ROOT}/bin/qa-kit.mjs" memory search "<page>"`. Read `.qa-kit/memory/conventions.md` once per session, not
   per page.
4. **Only what needs work:** rows with status todo, rows with missing-spec drift, or the IDs
   the user named. Never rewrite tests that already exist; add new tests to the existing spec
   file of that tab or page.
5. **Read only what those rows need:** the page component(s), its validation schema, the API
   types of the endpoints it calls (search the OpenAPI types for the endpoint, do not read
   the whole file), one existing spec of the same or a sibling page as style reference, and
   the shared helpers that spec already imports. Do not read backend source, other teams'
   folders, or unrelated modules unless a row cannot be written without it.
6. If rows are missing from the catalog, add them first (qa-test-cases skill, IDs from
   `node "${CLAUDE_PLUGIN_ROOT}/bin/qa-kit.mjs" next-id`). Then write the specs with the qa-playwright-author skill.
7. `node "${CLAUDE_PLUGIN_ROOT}/bin/qa-kit.mjs" index`, then `node "${CLAUDE_PLUGIN_ROOT}/bin/qa-kit.mjs" gaps --page <page>`: no drift for the page.
8. Run tests only if the request says "run": `node "${CLAUDE_PLUGIN_ROOT}/bin/qa-kit.mjs" run` at the narrowest scope (one page or
   `-g "<ID>"`), twice.
9. Save lessons with `node "${CLAUDE_PLUGIN_ROOT}/bin/qa-kit.mjs" memory add` and list their IDs in your answer.
