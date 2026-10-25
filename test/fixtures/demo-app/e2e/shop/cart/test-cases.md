# Test Case: Shop › Cart

Page `/shop/cart`.

## List

| ID | Scenario | Steps | Expected result | Automation |
| --- | --- | --- | --- | --- |
| CRT-01 | Cart loads | Open cart | Title "Cart" visible | spec `@smoke` |
| CRT-02 | Remove item | Click Remove | Row disappears | spec, **suspected fail** (Finding 1) |
| CRT-03 | Coupon | Apply coupon | Total discounted | not automated |
| CRT-04 | Print | Print cart | Print dialog | manual (browser dialog) |
| CRT-05 | Checkout | Click Checkout | Goes to /checkout | spec |

## Findings

1. **Remove keeps the row** (CRT-02). `cart.svelte:12` never refetches.
