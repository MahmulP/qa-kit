---
description: Design or update the test-case catalog for a page or ticket
argument-hint: "<page/menu/route> [ticket ID]"
---

Use the qa-test-cases skill for: {{ARGS}}

- Recall first: `{{CLI}} memory search`, `{{CLI}} cases --page <page>`, `{{CLI}} gaps --page <page>`.
- If a ticket ID is given and a tracker tool is available, read its acceptance criteria first.
- New IDs only from `{{CLI}} next-id <PREFIX>`.
- Finish with `{{CLI}} index`, show the rows added/changed, and save decisions/findings with
  `{{CLI}} memory add`.
