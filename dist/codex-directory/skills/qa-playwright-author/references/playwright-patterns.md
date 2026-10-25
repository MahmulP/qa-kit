# Playwright patterns (defaults when the project has no rule)

Examples use English UI text; use the exact words of the app under test.

## Locators, in order of preference

1. `page.getByRole('button', { name: 'Save' })` — matches what users and screen readers see.
2. `page.getByLabel('Invoice number')` — inputs with a linked `<label>`.
3. `page.getByText('No results')`, `getByPlaceholder`, `getByTitle`.
4. `page.getByTestId('…')` when the project uses `data-testid`.
5. Stable `id` attributes. Avoid class names, nth-child chains, and layout XPath.

Scope locators to a container to avoid duplicates:
`page.getByRole('dialog').getByRole('button', { name: 'Save' })`.
Use `.first()` only when duplicates are expected and harmless; otherwise make the locator
specific.

## Waiting

```ts
const saved = page.waitForResponse(
	(r) => r.request().method() === 'POST' && /\/api\/invoices$/.test(r.url())
);
await page.getByRole('button', { name: 'Save' }).click();
const res = await saved;
expect(res.ok(), `POST rejected: ${res.status()} ${await res.text()}`).toBeTruthy();
```

- Web-first assertions auto-wait: `await expect(locator).toBeVisible()`,
  `toHaveText`, `toHaveCount`, `toHaveURL`.
- `expect.poll(fn)` for values that are not locators.
- Never `page.waitForTimeout()`.

## Page object (keep it next to the page's specs)

```ts
import type { Page } from '@playwright/test';

export const PATH = '/billing/invoices';
export const API = { list: /\/api\/invoices(\?|$)/, item: /\/api\/invoices\/[^/?]+$/ };

export function invoiceForm(page: Page) {
	const dialog = page.getByRole('dialog');
	return {
		dialog,
		number: dialog.getByLabel('Invoice number'),
		save: dialog.getByRole('button', { name: 'Save' })
	};
}

export const uniqueSuffix = () => String(Date.now()).slice(-7);
```

## Data that the test creates

```ts
let created: string | null = null;

test.afterEach(async ({ page }) => {
	if (created) await deleteByNumber(page, created); // tolerant: no-op when already gone
	created = null;
});

test('INV-05 create, edit, delete', { tag: '@mutation' }, async ({ page }) => {
	const number = `E2E${uniqueSuffix()}`;
	// … create via UI, then:
	created = number;
});
```

## Downloads (export)

```ts
const download = page.waitForEvent('download');
await page.getByRole('menuitem', { name: /csv/i }).click();
expect((await download).suggestedFilename()).toMatch(/\.csv$/);
```

## Flakiness checklist

| Symptom | Usual cause | Fix |
| --- | --- | --- |
| Passes alone, fails in suite | shared data, order dependence | create own data, clean up |
| Fails right after save | navigated before the request finished | wait for the response first |
| Element detached / re-rendered | asserting on a stale handle | use locators, not element handles |
| Different row count per run | live data changes | assert on own data or relative counts |
| Fails only in CI | slower machine, no warm dev server | rely on auto-wait, raise only the specific timeout |
