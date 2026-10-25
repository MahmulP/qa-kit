import { test, expect } from '@playwright/test';

test.describe('Checkout', { tag: '@destructive' }, () => {
	test('TC_001 should pay with card', async ({ page }) => {
		await page.goto('/checkout');
		await expect(page.getByRole('heading', { name: 'Thank you' })).toBeVisible();
	});
});
