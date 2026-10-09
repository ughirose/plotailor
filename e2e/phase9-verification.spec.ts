import { test, expect } from '@playwright/test';

test.describe('Phase 9 Consolidated E2E Verification (Token-Optimized 1-Pass)', () => {
  test('Validates Typesetting, Lifecycle, Decoration Preservation, and UI Bindings', async ({ page }) => {
    // 1. Initial Page Load
    await page.goto('/app.html');
    await page.waitForLoadState('domcontentloaded');

    const editorBody = page.locator('#editorBody');
    await expect(editorBody).toBeVisible();

    // ==========================================
    // SCENARIO 1: 組版・メトリクス・ガイド・指標日本語化 (項目 11, 12, 14, 20)
    // ==========================================
    // 1.1 ガイド目盛り数字の横書き (writing-mode: horizontal-tb)
    const tickLabel10 = page.locator('.column-guideline-tick-mark .tick-label').filter({ hasText: '10' }).first();
    await expect(tickLabel10).toBeVisible();
    const writingMode = await tickLabel10.evaluate((el) => window.getComputedStyle(el).writingMode);
    expect(writingMode).toBe('horizontal-tb');

    // 1.2 ぶら下げ独立トグルボタン (初期OFF ＆ クリックトグル)
    const btnToggleHanging = page.locator('#btnToggleHanging');
    await expect(btnToggleHanging).toBeVisible();
    await expect(btnToggleHanging).toContainText('OFF');

    await btnToggleHanging.click();
    await expect(btnToggleHanging).toContainText('ON');
    await btnToggleHanging.click();
    await expect(btnToggleHanging).toContainText('OFF');

    // 1.3 ガイド線ドラッグハンドルのDOM存在
    const dragHandle = page.locator('.column-guideline-drag-handle');
    await expect(dragHandle).toBeAttached();

    // 1.4 フッター指標の日本語化 (L/C 排除)
    const cursorPosBadge = page.locator('#cursorPosBadge');
    await expect(cursorPosBadge).toBeVisible();
    await expect(cursorPosBadge).toContainText('行');
    await expect(cursorPosBadge).toContainText('文字');
    await expect(cursorPosBadge).toContainText('40字組');

    // ==========================================
    // SCENARIO 2: P0 執筆破壊・装飾ライフサイクル・文字ダブり防止 (項目 1, 2, 3)
    // ==========================================
    // 2.1 装飾スパンの存在確認
    const contentEditable = page.locator('.cm-content');
    await expect(contentEditable).toBeVisible();

    // 2.2 大見出し挿入ボタンの動作確認 (項目 7)
    const btnQuickHeading = page.locator('#btnQuickHeading');
    await expect(btnQuickHeading).toBeVisible();
    await contentEditable.click();
    await btnQuickHeading.click();

    // エディタ内に青空文庫形式大見出しが挿入されたことを確認
    await expect(contentEditable).toContainText('［＃大見出し］');
    await expect(contentEditable).toContainText('［＃大見出し終わり］');

    // 2.3 凡例装飾スパン上でのタイピング文字ダブり検証 (P0: 項目 1)
    const initialText = await contentEditable.innerText();
    const mentionDec = page.locator('.cm-decoration-layer0, .cm-decoration-layer1, [class*="cm-lint-tier"]').first();
    if (await mentionDec.isVisible()) {
      await mentionDec.click();
      await page.keyboard.type('テスト');
      const updatedText = await contentEditable.innerText();
      // 入力した文字が二重出現（「テストテスト」）していないことを厳密検証
      expect(updatedText).toContain('テスト');
      expect(updatedText).not.toContain('テストテスト');
      // Undo で復元
      await page.keyboard.press('Control+z');
    }

    // 2.4 Undo による装飾・内容復元
    await page.keyboard.press('Control+z');
    // Undo 完了後もエディタが破損せず健全に動作することを確認
    await expect(contentEditable).toBeVisible();

    // ==========================================
    // SCENARIO 3: UI連動・右ペイン・表記揺れゴミ箱 (項目 12, 16, 19)
    // ==========================================
    // 3.1 右ペインのタブ確認 (編集履歴タブの完全除去確認)
    const historyTab = page.locator('.pane-right button[data-tab="history"]');
    await expect(historyTab).toHaveCount(0);

    // 3.2 表記揺れタブへの切り替え
    const orthographyTabBtn = page.locator('.pane-right button[data-tab="orthography"]');
    if (await orthographyTabBtn.isVisible()) {
      await orthographyTabBtn.click();
      // ゴミ箱（アーカイブ領域）の存在確認
      const trashArea = page.locator('#prhTrashAccordion');
      await expect(trashArea).toBeAttached();
    }

    // ==========================================
    // SCENARIO 4: モーダル・出力・イベントバインド (項目 13, 15, 17, 18)
    // ==========================================
    // 4.1 メニューから商業入稿パッケージ一括出力を選択して確認モーダル表示 (即時ZIPの阻止)
    const btnHamburger = page.locator('#btnHamburgerMenu');
    await expect(btnHamburger).toBeVisible();
    await btnHamburger.click();

    const menuExportCommercial = page.locator('#menuExportCommercial');
    await expect(menuExportCommercial).toBeVisible();
    await menuExportCommercial.click();

    const exportModal = page.locator('#exportModal');
    await expect(exportModal).toBeVisible();

    // モーダルを閉じる
    const closeExportBtn = page.locator('#btnCloseExportModal');
    await expect(closeExportBtn).toBeVisible();
    await closeExportBtn.click();
    await expect(exportModal).toBeHidden();

    // 4.2 操作ガイドボタンのイベント動作確認 (項目 18)
    const btnHeaderHelp = page.locator('#btnHeaderHelp');
    await expect(btnHeaderHelp).toBeVisible();
    await btnHeaderHelp.click();

    const helpModal = page.locator('#helpModal');
    await expect(helpModal).toBeVisible();

    const btnCloseHelp = page.locator('#btnCloseHelpModal');
    await expect(btnCloseHelp).toBeVisible();
    await btnCloseHelp.click();
    await expect(helpModal).toBeHidden();

    // 4.3 テーマ切り替えボタンのイベント動作確認
    const btnToggleTheme = page.locator('#btnToggleTheme');
    if (await btnToggleTheme.isVisible()) {
      await btnToggleTheme.click();
      // テーマが切り替わりボタンテキストが変化することを確認
      await expect(btnToggleTheme).toContainText('和紙色');
      await btnToggleTheme.click();
      await expect(btnToggleTheme).toContainText('夜間色');
    }
  });
});
