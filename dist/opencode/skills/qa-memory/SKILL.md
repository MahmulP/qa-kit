---
name: qa-memory
description: Read, write, correct, and consolidate QA memory - per-project knowledge files and searchable lessons in .qa-kit/memory, plus global lessons shared by every app in ~/.qa-kit - so every agent and session keeps learning about the apps and their tests. Use when the user says remember/forget something, when a reviewer corrects a test, at the end of any QA task, or when memory looks stale or contradictory.
---

# QA memory

## What lives where

| Store | Holds | How to change |
| --- | --- | --- |
| `.qa-kit/config.json` | Detected conventions: test dir, fixtures import, catalog names/ID pattern/languages, scopes, mutation tags, protected env vars | `qa-kit config set <path> <value>` |
| `.qa-kit/memory/app.md` | Modules, routes, auth/roles, environments, UI patterns, fragile areas | Edit the file |
| `.qa-kit/memory/conventions.md` | How tests are written here, folder layout (+ review feedback log) | Edit the file |
| `.qa-kit/memory/glossary.md` | UI terms and meanings | Edit the file |
| `.qa-kit/memory/<topic>.md` | Any other curated topic you need (e.g. `test-data.md`) | Create it |
| `.qa-kit/memory/lessons.jsonl` | Atomic, searchable project entries with kind + scope (IDs `M-…`) | `qa-kit memory add/forget` or `qa_memory_add/forget` |
| `~/.qa-kit/lessons.jsonl` | Global lessons shared by every app on this machine (IDs `G-…`) | `qa-kit memory add --global` |
| `.qa-kit/index/` | Derived from code (structure, test-case index) | `qa-kit scan` / `qa-kit index`, never by hand |
| `.qa-kit/history/` | Run results per test (local, ignored by git) | `qa-kit run` / `qa-kit ingest` |

`.qa-kit/config.json` and `.qa-kit/memory/` are meant to be committed so the whole team
(and every harness) shares them.

## Recall

At the start of a task: `qa-kit status`, then
`qa-kit memory search "<words>" --scope <path>` for the exact area. Scope matching uses path
prefixes, so `e2e/billing` also returns entries saved for pages under it. Search always
includes global lessons.

## Project or global?

- **Project** (default): anything about this app — pages, data, selectors, bugs, rules.
- **Global** (`--global`): true for every app you test — Playwright/tooling behaviour, the
  team's review habits, CI quirks shared across repos. Never put app-specific facts there.
  `qa-kit apps` lists the apps on this machine that share these lessons.

## What is worth saving

Save it when the next agent would otherwise lose time or make the same mistake:

- a reviewer correction or a user decision (`convention`, `decision`),
- a locator that works for a tricky control, or one that looked right but is not (`selector`),
- a cause of wasted time: environment quirk, slow page, session conflict (`gotcha`),
- a confirmed or suspected bug with evidence (`bug`), a flaky test and its cause (`flaky`),
- data that must exist / how to create it (`data`), how the app behaves (`fact`).

Do **not** save: what the code or `scan` already says plainly, one-off task state, secrets
(passwords, tokens, cookies, session files), personal data, long code.

Write each entry as one or two self-contained sentences with evidence (`file:line`, test ID,
run date, ticket). Use the narrowest true scope.

```bash
qa-kit memory add --kind convention --source "review 2026-10-24" \
  "List pages need a search-miss test that asserts the empty-state text."
qa-kit memory add --kind bug --scope e2e/billing/invoices \
  "INV-06: export reads row.total instead of row.amount.total (invoice-table.tsx:84-91)."
qa-kit memory add --global --kind gotcha \
  "Playwright's html reporter folder must not be inside outputDir, or each run wipes the report."
```

Saving the same text again does not duplicate it; it raises its `seen` count, which ranks it
higher in recall and in the session digest. Repetition is a signal: things saved three times
belong in the curated `.md` files.

## Correct and consolidate

- Wrong or obsolete entry: `qa-kit memory forget <ID> --reason "…"`.
- Changed fact: add the new one with `--supersedes <old ID>`.
- Wrong detected convention: `qa-kit config set …` (it is never overwritten by later scans
  once set).
- Periodically (or when `status` shows many lessons): read `qa-kit memory list`, merge
  repeated lessons into the right `.md` section, retire the merged entries, and remove
  sections in the `.md` files that the code now contradicts. Keep files short; link sources.

## End of every QA task

Before your final message, ask yourself: what did I learn that is not in memory yet? Save
it, then tell the user in one line what you saved (IDs). If nothing new, say so.
