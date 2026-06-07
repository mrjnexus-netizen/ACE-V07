import { test, expect } from '@playwright/test';

test.describe('Linguistic Portal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should render all 6 language buttons', async ({ page }) => {
    const buttons = page.locator('button');
    await expect(buttons).toHaveCount(6);
  });

  test('should transition to MainApp after selecting English', async ({ page }) => {
    const enButton = page.locator('button:has-text("ENGLISH")');
    await enButton.click();
    await page.waitForTimeout(1000); // wait for shatter animation
    const mainApp = page.locator('#main-app');
    await expect(mainApp).toBeVisible({ timeout: 5000 });
  });
});
