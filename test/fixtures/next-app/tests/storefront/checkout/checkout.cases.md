# Checkout

Route `/checkout`.

| Case ID | Title | Steps | Expected | Status |
| --- | --- | --- | --- | --- |
| TC_001 | Pay with card | Fill card, pay | Order confirmation shown | ✅ automated |
| TC_002 | Invalid card | Use 4000 0000 0000 0002 | "Card declined" | ⏳ planned |
| TC_003 | Print receipt | Click print | Print dialog | Manual |

## Known issues

- **Coupon field accepts expired codes** (TC_002). `coupon.ts:12`.
