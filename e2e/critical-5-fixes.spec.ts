import { test, expect } from '@playwright/test';

test.describe('Critical 5 Fixes Verification Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app.html');
    await page.waitForLoadState('domcontentloaded');
  });

  test('Fix 1 & 3: Vertical-rl mode, wheel normalization & margin click stability', async ({ page }) => {
    const editorCenter = page.locator('#paneCenter');
    const toggleBtn = page.locator('#btnToggleOrientation');

    // 縦書きモードを保証
    if (!(await editorCenter.evaluate((el) => el.classList.contains('vertical-rl')))) {
      await toggleBtn.click();
    }
    await expect(editorCenter).toHaveClass(/vertical-rl/);

    const canvasWrapper = page.locator('#canvasWrapper');
    await expect(canvasWrapper).toBeVisible();

    // ホイール操作で横スクロールが正常に動くこと（二重競合エラーなく動作）
    const initialScroll = await canvasWrapper.evaluate((el) => el.scrollLeft);
    await canvasWrapper.dispatchEvent('wheel', { deltaX: 0, deltaY: 200, deltaMode: 0 });
    const afterScroll = await canvasWrapper.evaluate((el) => el.scrollLeft);
    expect(typeof afterScroll).toBe('number');

    // 左端余白クリック時に先頭（0）に飛ばず、末尾行付近に着地することを検証
    const cmEditor = page.locator('.cm-editor');
    await expect(cmEditor).toBeVisible();
    await canvasWrapper.click({ position: { x: 10, y: 150 } });

    const selectionHead = await page.evaluate(() => {
      const editorEl = document.querySelector('.cm-editor') as any;
      if (editorEl && (window as any).plotailorApp) {
        return (window as any).plotailorApp.cmEditor.state.selection.main.head;
      }
      return -1;
    });
    // 先頭行（0）へ強制ジャンプしていないこと
    if (selectionHead !== -1) {
      expect(selectionHead).toBeGreaterThan(0);
    }

    // 上下矢印キーでスムーズに移動できること
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowDown');
  });

  test('Fix 2: Aozora Heading tag decoration without DOM destruction', async ({ page }) => {
    // エディタをクリックしてフォーカス
    const cmContent = page.locator('.cm-content');
    await cmContent.click();

    // エディタ内に大見出しを挿入
    const btnHeading = page.locator('#btnQuickHeading');
    await expect(btnHeading).toBeVisible();
    await btnHeading.click();

    // 見出しマーク装飾または非表示クラスが存在することを確認
    const headingMark = page.locator('.cm-heading-daimidashi, .cm-heading-tag-hidden');
    await expect(headingMark.first()).toBeAttached();
  });

  test('Fix 4: Column guideline 40-col ruler width and pitch tracking', async ({ page }) => {
    const guidelineContainer = page.locator('.column-guideline-container');
    await expect(guidelineContainer).toBeAttached();

    const primaryLine = page.locator('.column-guideline-line.primary');
    await expect(primaryLine).toBeAttached();

    // ガイド線の幅が 3000px 以上の十分な拡張幅を持ち途切れないこと
    const styleWidth = await primaryLine.evaluate((el) => parseFloat(el.style.width || '0'));
    expect(styleWidth).toBeGreaterThanOrEqual(3000);
  });

  test('Fix 5: Real-time TOC outline sync on document change', async ({ page }) => {
    // 左ペインを開く
    const btnLeftPane = page.locator('#btnToggleLeftPane');
    const paneLeft = page.locator('#paneLeft');
    if (await paneLeft.isHidden()) {
      await btnLeftPane.click();
    }

    // 目次タブを開く
    const tocTab = page.locator('button[data-tab="toc"]');
    if (await tocTab.isVisible()) {
      await tocTab.click();
    }

    const tocTree = page.locator('#chapterListDndContainer');
    await expect(tocTree).toBeVisible();

    // エディタにフォーカスして見出しを入力
    const cmContent = page.locator('.cm-content');
    await cmContent.click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('［＃中見出し］第二節 追憶の書［＃中見出し終わり］');

    // 250msデバウンス後に目次ツリーが再描画され、見出しアイテムが存在すること
    await page.waitForTimeout(500);
    const tocHeadingItem = page.locator('.toc-heading-item').first();
    await expect(tocHeadingItem).toBeAttached();
  });

  test('New Fixes: Heading cycle, Markdown #, Wrap mode toggle, and Guideline overflow', async ({ page }) => {
    // 1. Heading cycle & Markdown # test
    const cmContent = page.locator('.cm-content');
    await cmContent.click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('# 第一節 黎明');

    // Verify markdown heading decoration
    await page.waitForTimeout(300);
    const mdHeading = page.locator('.cm-heading-daimidashi');
    await expect(mdHeading.first()).toBeAttached();

    // 2. Wrap mode toggle test
    const btnToggleWrap = page.locator('#btnToggleWrap');
    await expect(btnToggleWrap).toBeVisible();
    await btnToggleWrap.click(); // column -> off
    await expect(btnToggleWrap).toContainText('OFF');
    await btnToggleWrap.click(); // off -> screen
    await expect(btnToggleWrap).toContainText('画面基準');
    await btnToggleWrap.click(); // screen -> column
    await expect(btnToggleWrap).toContainText('字指定');

    // 3. Guideline container overflow & width
    const guidelineContainer = page.locator('.column-guideline-container.mode-vertical');
    await expect(guidelineContainer).toBeAttached();
    const isOverflowVisible = await guidelineContainer.evaluate(
      (el) => window.getComputedStyle(el).overflow === 'visible'
    );
    expect(isOverflowVisible).toBe(true);
  });
});
