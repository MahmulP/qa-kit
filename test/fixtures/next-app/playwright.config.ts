import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
	testDir: './tests',
	outputDir: './artifacts/results',
	reporter: [['html', { outputFolder: './artifacts/report' }]],
	projects: [
		{ name: 'admin', testDir: './tests/admin-portal', use: { ...devices['Desktop Chrome'] } },
		{ name: 'storefront', testDir: './tests/storefront', use: { ...devices['Pixel 7'] } }
	]
});
