# Catalog template

Use the project's own template when it has one. This default is in English; write it in the
language the project's catalogs already use (headings and status words are recognised
through the language packs). Name the file as `qa-kit config get catalog` says
(`fileNames`, or `newFileName` for the first catalog).

```markdown
# Test Case: <Area> › <Menu> › <Page>

Page `/<route>`. <One sentence: what the page does, dialogs vs separate pages.>

Expected results come from:

- **Ticket**: <ID> (AC-1 … AC-n, business rules).
- **API contract**: `<path to OpenAPI/types>` — `<endpoint>`.
- **App code**: `<component folder>` (UI copy, validation messages, toasts).

The Automation column refers to `<page>.spec.ts`. Tests tagged with the mutation tag create,
change, or delete data and only run when the project's mutation switch is on. Test data uses
the prefix `E2E<digits>`; `afterEach` removes it.

## List

| ID | Scenario | Steps | Expected result | Automation |
| --- | --- | --- | --- | --- |
| ABC-01 | List loads | Open the menu | Table "<title>" with columns <…>; no error | spec `@smoke` |
| ABC-02 | Search hit | Type an existing code | The row with that code is shown | spec |
| ABC-03 | Search miss | Type `ZZZ-E2E-NONE` | Empty state "<text>" | spec |

## Form

| ID | Scenario | Steps | Expected result | Automation |
| --- | --- | --- | --- | --- |
| ABC-04 | Required fields | Leave <fields> empty | "<message>" per field; Save disabled | spec |

## Save, edit, delete

| ID | Scenario | Steps | Expected result | Automation |
| --- | --- | --- | --- | --- |
| ABC-05 | Create, edit, delete | Create › edit name › delete | Messages "<…>"; row appears, changes, disappears | spec `<mutation tag>` |

## Findings

Run <date> against <environment>, tenant/site <x>, role <y>. Items marked *suspected* come
from code reading and are not confirmed by a run yet.

1. **<Short title>** (ABC-0n). <What is wrong vs the requirement>. Evidence:
   `<file>:<line>`. Issue: <tracker ID or "not reported yet">.
```
