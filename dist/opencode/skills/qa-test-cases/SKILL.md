---
name: qa-test-cases
description: Design or update the test-case catalog for a page or feature (a markdown catalog next to its specs) - scenarios, steps, expected results derived from tickets, business rules, API contracts and schemas, automation status, and a findings section for bugs. Use before writing specs, when a ticket arrives, when requirements change, or when asked what should be tested.
---

# Design test cases

The catalog says what **should** be tested, automated or not. Specs say how. The catalog
is written first and kept where the project's layout puts it (usually next to the specs).

## 1. Recall and locate

```bash
qa-kit memory search "<page or module>"
qa-kit cases --page <page folder or route fragment>   # existing rows, status, linked specs
qa-kit gaps --page <fragment>                          # todo rows, drift
qa-kit config get catalog                              # file names, ID pattern, languages
```

Follow the project's catalog template if it has one (check `conventions.md` and the rule
docs). Otherwise use [references/catalog-template.md](references/catalog-template.md).
Write in the language the project's catalogs already use; qa-kit reads column headers and
status words through language packs (`lib/vocab.mjs`), and a team can add its own words
with `qa-kit config set catalog.vocabulary '{"todo":["…"]}'`.

## 2. Collect expectations, in this priority

1. Ticket / acceptance criteria / business rules (ask the user for the ticket ID, or use a
   tracker MCP if available).
2. API contract: request/response shapes, required fields, enum values, error codes.
3. Validation schema and form attributes: required, length, format, ranges.
4. UI copy in components: titles, labels, messages (assert on these words).
5. Permissions: which roles see which buttons.

Where the code disagrees with the requirement, the requirement is the expected result and
the difference is a **finding** (with `file:line`). Record open questions for the BA/PO
instead of guessing.

## 3. Write the rows

- Group by tab/section. One short uppercase prefix per page or section (`INV`, `CHK`).
  New IDs: `qa-kit next-id <PREFIX>`. Never renumber or reuse an ID.
- Columns: `ID | Scenario | Steps | Expected result | Automation`.
- Expected results are observable: exact text, element state, API status, row
  present/absent. "Works correctly" is not an expected result.
- Automation column: `spec` / `spec @smoke` / `spec <mutation tag>` (or the file name),
  `not automated`, `manual (reason)`, or the same words in the catalog's language. Mark
  known failures, e.g. `spec, **failing: bug** (Finding 2)` or `spec, **suspected fail**
  (Finding 3)`.

Coverage checklist per page type (keep what applies; add the project's own mandatory checks
from `conventions.md`):

| Page type | Cases |
| --- | --- |
| List / index | loads with title and columns (smoke), search hit, search miss/empty state, pagination, sort, filters, export, row actions per permission |
| Create / edit form | open/cancel, required fields, length/format/range limits, enum options, duplicate key rejected, success message + row visible, edit keeps immutable fields locked |
| Delete | cancel keeps row, confirm removes row, delete blocked when referenced |
| Detail / read-only | all fields shown, nothing editable |
| Workflow / status | allowed transitions, forbidden transitions, who may act |
| Auth / permission | redirect or "access denied" for roles without permission |

Tests that create/update/delete data carry the project's mutation tag
(`qa-kit config get e2e.mutationTags`) and clean up after themselves; write that into the
steps.

## 4. Findings section

Keep a `## Findings` section (or the project's own heading for it in its language):
numbered, each with test ID, evidence (`file:line`, run date, environment), and status
(suspected from code reading vs confirmed by a run).

## 5. Sync and learn

```bash
qa-kit index && qa-kit gaps --page <fragment>     # no new drift on this page
qa-kit memory add --kind decision --scope <page dir> "<clarification agreed with BA/QA>"
qa-kit memory add --kind bug --scope <page dir> "<ID>: <finding>, evidence <file:line>"
```

Then continue with `qa-playwright-author` if the user wants the cases automated.
