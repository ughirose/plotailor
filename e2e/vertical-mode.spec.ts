import { test, expect } from '@playwright/test';

test.describe('Japanese Vertical Mode & Typography Suite', () => {
  test.beforeEach(async ({ page }) => {
    // Mount editor testing page
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
  });

  test('toggles vertical writing mode and applies cm-vertical CSS', async ({ page }) => {
    const editor = page.locator('.plotailor-viewport');
    const toggleBtn = page.getByTestId('toggle-mode-btn');

    // Click toggle button to switch to vertical mode if not default
    if (!(await editor.evaluate((el) => el.classList.contains('cm-vertical')))) {
      await toggleBtn.click();
    }

    await expect(editor).toHaveClass(/cm-vertical/);

    const writingMode = await editor.evaluate((el) => window.getComputedStyle(el).writingMode);
    expect(writingMode).toBe('vertical-rl');

    const textOrientation = await editor.evaluate((el) => window.getComputedStyle(el).textOrientation);
    expect(textOrientation).toBe('upright');
  });

  test('renders Aozora Bunko ruby tags into semantic <ruby> and <rt> markup', async ({ page }) => {
    const rubyElement = page.locator('ruby').first();
    await expect(rubyElement).toBeVisible();

    const rtElement = rubyElement.locator('rt');
    await expect(rtElement).toBeVisible();

    // Verify parent text and ruby text
    const rubyText = await rtElement.innerText();
    expect(rubyText.length).toBeGreaterThan(0);
  });

  test('normalizes mouse wheel input into horizontal scroll in vertical-rl layout', async ({ page }) => {
    const container = page.locator('.plotailor-viewport');
    await container.waitFor({ state: 'visible' });

    const initialScrollLeft = await container.evaluate((el) => el.scrollLeft);

    // Dispatch wheel event with vertical deltaY
    await container.dispatchEvent('wheel', {
      deltaX: 0,
      deltaY: 100,
      deltaMode: 0,
    });

    const scrolledLeft = await container.evaluate((el) => el.scrollLeft);
    // In vertical-rl (RTL horizontal scroll), scrollLeft should change
    expect(scrolledLeft).not.toBe(initialScrollLeft);
  });

  test('adjusts typography without invoking popup modals (Constitution compliance)', async ({ page }) => {
    // Check that no modal overlay exists
    const modalOverlays = page.locator('.modal-backdrop, .dialog-overlay, [role="dialog"]');
    await expect(modalOverlays).toHaveCount(0);

    // Inline appearance bar is present
    const appearanceBar = page.getByTestId('inline-appearance-bar');
    await expect(appearanceBar).toBeVisible();
  });
});
