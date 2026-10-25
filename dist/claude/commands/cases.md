---
description: Design or update the test-case catalog for a page or ticket
argument-hint: <page/menu/route> [ticket ID]
---


Use the qa-test-cases skill for: $ARGUMENTS

- Recall first: `node "${CLAUDE_PLUGIN_ROOT}/bin/qa-kit.mjs" memory search`, `node "${CLAUDE_PLUGIN_ROOT}/bin/qa-kit.mjs" cases --page <page>`, `node "${CLAUDE_PLUGIN_ROOT}/bin/qa-kit.mjs" gaps --page <page>`.
- If a ticket ID is given and a tracker tool is available, read its acceptance criteria first.
- New IDs only from `node "${CLAUDE_PLUGIN_ROOT}/bin/qa-kit.mjs" next-id <PREFIX>`.
- Finish with `node "${CLAUDE_PLUGIN_ROOT}/bin/qa-kit.mjs" index`, show the rows added/changed, and save decisions/findings with
  `node "${CLAUDE_PLUGIN_ROOT}/bin/qa-kit.mjs" memory add`.
