---
description: Design or update the test-case catalog for a page or ticket
argument-hint: <page/menu/route> [ticket ID]
---


Use the qa-test-cases skill for: $ARGUMENTS

- Recall first: `qa-kit memory search`, `qa-kit cases --page <page>`, `qa-kit gaps --page <page>`.
- If a ticket ID is given and a tracker tool is available, read its acceptance criteria first.
- New IDs only from `qa-kit next-id <PREFIX>`.
- Finish with `qa-kit index`, show the rows added/changed, and save decisions/findings with
  `qa-kit memory add`.

If `qa-kit` is not on PATH, use the CLI command that the `qa_status` tool prints.
