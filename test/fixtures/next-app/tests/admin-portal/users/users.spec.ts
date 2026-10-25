import { test, expect } from '@playwright/test';

test('USR-01 admin can list users', { tag: '@smoke' }, async ({ page }) => {
	await page.goto('/admin/users');
	await expect(page.getByRole('table')).toBeVisible();
});
