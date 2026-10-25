# Application knowledge

Curated by agents and QA. Keep each section short and factual; link to source files
(`path:line`) instead of copying code. Replace placeholders the first time you learn the
answer. Atomic facts that do not fit a section go to `lessons.jsonl` via `qa-kit memory add`.

## Product & domain

- What the app does, who uses it, main business objects.

## Modules / areas

| Module | Route prefix | Owner | Notes |
| --- | --- | --- | --- |

## Authentication & roles

- How login works, test accounts (names of env vars only, never values), role/permission model.

## Environments & backends

- Which backends tests hit, what is safe to mutate, base URLs (no secrets).

## Recurring UI patterns

- Tables, forms, dialogs, toasts, exports: which shared components render them and how to locate them.

## Known risks / fragile areas

- Areas that break often, slow endpoints, data that other teams delete.
