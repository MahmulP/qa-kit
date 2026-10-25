import { expect, test } from '../../support/fixtures';

test.describe('Shop › Cart', () => {
	test('CRT-01 cart page shows the list', { tag: '@smoke' }, async ({ page }) => {
		await page.goto('/shop/cart');
		await expect(page.getByRole('heading', { name: 'Cart' })).toBeVisible();
	});

	test('CRT-02 remove item', { annotation: { type: 'issue', description: 'BUG-7' } }, async ({ page }) => {
		await page.goto('/shop/cart');
	});

	test('CRT-03 apply coupon', async ({ page }) => {
		await page.goto('/shop/cart');
	});

	test('CRT-09 orphan test', async ({ page }) => {
		await page.goto('/shop/cart');
	});
});
