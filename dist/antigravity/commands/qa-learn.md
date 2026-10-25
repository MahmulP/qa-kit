---
description: Save what was learned in this session (or a specific fact/correction) into qa-kit memory
argument-hint: [what to remember, or empty to review the session]
---


Use the qa-memory skill.

- If the user gave a fact or correction ("$ARGUMENTS"), save it with `qa-kit memory add` using
  the right kind and the narrowest scope; if it replaces an older entry, find it with
  `qa-kit memory search` and pass `--supersedes <ID>`. Reviewer corrections also go into
  `.qa-kit/memory/conventions.md` → "Review feedback log".
- If empty, review this session: list the durable lessons (selectors, gotchas, bugs, flaky
  causes, decisions, conventions) not yet in memory, save them, and consolidate duplicates.
- Report the memory IDs saved or retired.

If `qa-kit` is not on PATH, use the CLI command that the `qa_status` tool prints.
