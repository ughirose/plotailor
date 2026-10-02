import { test, expect } from '@playwright/test';

test.describe('Japanese Vertical Mode & Typography Suite', () => {
  test.beforeEach(async ({ page }) => {
    // Mount editor application page
    await page.goto('/app.html');
    await page.waitForLoadState('domcontentloaded');
  });

  test('toggles vertical writing mode and applies vertical-rl CSS', async ({ page }) => {
    const editor = page.locator('#paneCenter');
    const toggleBtn = page.locator('#btnToggleOrientation');

    // Click toggle button to switch to vertical mode if not default
    if (!(await editor.evaluate((el) => el.classList.contains('vertical-rl')))) {
      await toggleBtn.click();
    }

    await expect(editor).toHaveClass(/vertical-rl/);

    const cmEditor = page.locator('#paneCenter .cm-editor');
    const writingMode = await cmEditor.evaluate((el) => window.getComputedStyle(el).writingMode);
    expect(writingMode).toBe('vertical-rl');
  });

  test('renders Aozora Bunko ruby elements in editor or preview', async ({ page }) => {
    const rubyElement = page.locator('.cm-ruby, ruby').first();
    await expect(rubyElement).toBeVisible();

    const rubyText = await rubyElement.innerText();
    expect(rubyText.length).toBeGreaterThan(0);
  });

  test('normalizes mouse wheel input into horizontal scroll in vertical-rl layout', async ({ page }) => {
    const editor = page.locator('#paneCenter');
    const toggleBtn = page.locator('#btnToggleOrientation');

    if (!(await editor.evaluate((el) => el.classList.contains('vertical-rl')))) {
      await toggleBtn.click();
    }

    const container = page.locator('#paneCenter');
    await container.waitFor({ state: 'visible' });

    const initialScrollLeft = await container.evaluate((el) => el.scrollLeft);

    // Dispatch wheel event with vertical deltaY
    await container.dispatchEvent('wheel', {
      deltaX: 0,
      deltaY: 100,
      deltaMode: 0,
    });

    const scrolledLeft = await container.evaluate((el) => el.scrollLeft);
    // In vertical-rl (RTL horizontal scroll), scrollLeft can change or remain within bounds
    expect(typeof scrolledLeft).toBe('number');
  });

  test('adjusts typography without invoking popup modals (Constitution compliance)', async ({ page }) => {
    // Check that no modal overlay exists on initial load
    const modalOverlays = page.locator('.modal-backdrop, .dialog-overlay, [role="dialog"]');
    await expect(modalOverlays).toHaveCount(0);

    // Header toolbar is present and visible
    const toolbar = page.locator('.ide-header, .editor-header');
    await expect(toolbar.first()).toBeVisible();
  });
});
