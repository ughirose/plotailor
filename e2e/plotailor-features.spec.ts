import { test, expect } from '@playwright/test';
import * as path from 'path';

test.describe('Plotailor Literature IDE - Core Features E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app.html');
    await page.waitForLoadState('domcontentloaded');
  });

  test('Chapter Management: DnD structure, inline rename, addition and deletion', async ({ page }) => {
    // 1. Initial chapters
    const chapterItems = page.locator('.chapter-item');
    await expect(chapterItems).toHaveCount(3);

    // 2. Add new chapter
    const btnNew = page.locator('#btnNewChapter');
    await expect(btnNew).toBeVisible();
    await btnNew.click();

    await expect(page.locator('.chapter-item')).toHaveCount(4);
    const addedChapter = page.locator('.chapter-item').last();
    await expect(addedChapter).toContainText('新たな兆し');

    // 3. Inline rename via rename button
    const renameBtn = addedChapter.locator('.chapter-rename-btn');
    await renameBtn.click();

    const input = addedChapter.locator('.chapter-rename-input');
    await expect(input).toBeVisible();
    await input.fill('第四章 運命の分岐点');
    await input.press('Enter');

    await expect(addedChapter).toContainText('第四章 運命の分岐点');

    // Screenshot after chapter creation & rename
    await page.screenshot({
      path: path.join('docs', 'reports', 'screenshots', '01_plotailor_chapter_dnd.png'),
      fullPage: false,
    });

    // 4. Delete chapter
    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });
    const deleteBtn = addedChapter.locator('.chapter-delete-btn');
    await addedChapter.hover();
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();
    await deleteBtn.click();

    await expect(page.locator('.chapter-item')).toHaveCount(3);
  });

  test('Setting & Lore CRUD: filter chips, modal create, edit and delete', async ({ page }) => {
    // 1. Switch left tab to lore
    const loreTabBtn = page.locator('button[data-tab="lore"]');
    await loreTabBtn.click();
    await expect(loreTabBtn).toHaveClass(/active/);

    // 2. Verify filter chips and seed cards
    const filterChips = page.locator('.lore-filter-chip');
    await expect(filterChips.first()).toBeVisible();

    const loreCards = page.locator('.lore-card');
    await expect(loreCards.first()).toBeVisible();
    await expect(page.locator('#loreCardList')).toContainText('ヴァレリウス将軍');

    // 3. Open modal to create new lore item
    const btnOpenNew = page.locator('#btnOpenNewLoreModal');
    await btnOpenNew.click();

    const modal = page.locator('#loreModal');
    await expect(modal).toBeVisible();

    await page.fill('#loreEntityName', '神剣・紫電');
    await page.selectOption('#loreEntityCategory', 'item');
    await page.fill('#loreEntityRole', '古代の遺物');
    await page.fill('#loreEntityAliases', '紫電, 雷光の神剣');
    await page.fill('#loreEntityDesc', '北方の氷壁の奥深くに封印されていた古代神剣。雷光を宿す。');

    await page.click('#btnSaveLoreEntity');
    await expect(modal).toBeHidden();

    // 4. Filter by item
    const itemFilterChip = page.locator('button[data-cat="item"]');
    await itemFilterChip.click();

    const filteredCards = page.locator('.lore-card');
    await expect(filteredCards).toHaveCount(1);
    await expect(filteredCards.first()).toContainText('神剣・紫電');
    await expect(filteredCards.first()).toContainText('古代の遺物');

    // Screenshot of lore CRUD
    await page.screenshot({
      path: path.join('docs', 'reports', 'screenshots', '02_plotailor_lore_crud.png'),
      fullPage: false,
    });

    // 5. Edit newly created item
    const editBtn = filteredCards.first().locator('.btn-edit-lore');
    await editBtn.click();
    await expect(modal).toBeVisible();

    await page.fill('#loreEntityRole', '古代神剣・覚醒状態');
    await page.click('#btnSaveLoreEntity');
    await expect(modal).toBeHidden();

    await expect(page.locator('.lore-card').first()).toContainText('古代神剣・覚醒状態');
  });

  test('Causality & Relationship DAG View: SVG canvas, cycle validation, and interaction', async ({ page }) => {
    // 1. Switch right tab to causality DAG
    const causalityTab = page.locator('button[data-dock-tab="causality"]');
    await causalityTab.click();
    await expect(causalityTab).toHaveClass(/active/);

    // 2. Verify SVG graph elements
    const svgCanvas = page.locator('.dag-svg-canvas');
    await expect(svgCanvas).toBeVisible();

    const dagNodes = page.locator('.dag-node');
    const nodeCount = await dagNodes.count();
    expect(nodeCount).toBeGreaterThanOrEqual(4);

    const dagEdges = page.locator('.dag-edge');
    const edgeCount = await dagEdges.count();
    expect(edgeCount).toBeGreaterThan(0);

    // 3. Verify acyclic report text
    const cardHeader = page.locator('.pane-right .dock-card-header');
    await expect(cardHeader).toContainText('循環なし (Valid DAG)');

    // 4. Node click interaction
    const firstNode = dagNodes.first();
    await firstNode.click();

    // Screenshot of DAG view
    await page.screenshot({
      path: path.join('docs', 'reports', 'screenshots', '03_plotailor_causality_dag.png'),
      fullPage: false,
    });
  });
});
