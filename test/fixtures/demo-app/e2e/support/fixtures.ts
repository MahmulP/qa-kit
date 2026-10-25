import { test as base } from '@playwright/test';
export const test = base.extend<{ shop: string }>({ shop: async ({}, use) => use('x') });
export { expect } from '@playwright/test';
