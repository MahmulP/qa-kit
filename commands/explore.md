---
description: Map the app (or one module/page) for QA and record the knowledge in qa-kit memory
argument-hint: "[module, page, or route; empty = whole app]"
---

Use the qa-explore-app skill for: {{ARGS}} (empty means the whole app).

- Start with `{{CLI}} status` and `{{CLI}} memory search "{{ARGS}}"`.
- For the whole app or several modules, run one qa-explorer subagent per module in parallel,
  then merge their proposed additions into `.qa-kit/memory/app.md` and `glossary.md` yourself.
- Finish with `{{CLI}} gaps` for the explored area and a short list of the riskiest uncovered pages.
