import { defineConfig } from '@playwright/test';
export default defineConfig({
	testDir: './e2e',
	outputDir: './e2e/.results',
	reporter: [['list'], ['html', { outputFolder: './e2e/.report', open: 'never' }]],
	use: { baseURL: 'http://localhost:5173' },
	projects: [{ name: 'chromium' }]
});
