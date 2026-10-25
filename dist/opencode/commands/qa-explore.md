---
description: Map the app (or one module/page) for QA and record the knowledge in qa-kit memory
---


Use the qa-explore-app skill for: $ARGUMENTS

Keep it fast and cheap: work in this session and start subagents only as allowed below.

1. Start with `qa-kit status` and `qa-kit memory search "$ARGUMENTS"`. Skip anything memory
   already describes; explore only the gaps.
2. **No argument:** list the app's modules or test areas (from `status` and
   `.qa-kit/index/structure.json`) with what memory already knows about each, ask which to
   map, and stop there.
3. **One module or page:** map it yourself in this session.
4. **Several modules named by the user:** do up to 2 yourself, one after the other. For 3 or
   more, ask once whether to run them in parallel; if yes, start at most 3 qa-explorer
   subagents at a time, each with a brief naming its module folder, its route prefix, and the
   memory sections that are still empty. Merge their proposed additions into
   `.qa-kit/memory/app.md` and `glossary.md` yourself.
5. Read code by targeted search (routes, the module's components, schemas, the endpoints it
   calls), not by opening every file. Do not read backend source unless the user asks.
6. Finish with `qa-kit gaps` for the explored area and a short list of the riskiest uncovered
   pages.

If `qa-kit` is not on PATH, use the CLI command that the `qa_status` tool prints.
