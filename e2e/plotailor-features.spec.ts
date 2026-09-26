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
    const lastChapter = page.locator('.chapter-item').last();
    await lastChapter.hover();
    const deleteBtn = lastChapter.locator('.chapter-delete-btn');
    await expect(deleteBtn).toBeVisible();
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

  test('Typing Cadence (IKI) State Machine: burst, short pause, and deep pause transitions', async ({ page }) => {
    const editor = page.locator('.cm-content');
    await expect(editor).toBeVisible();

    const cadenceIndicator = page.locator('#cadenceFooterIndicator');
    await expect(cadenceIndicator).toBeVisible();

    // 1. Rapid burst typing (<200ms IKI)
    await editor.click();
    await editor.type('速筆の刻。嵐が迫る。', { delay: 40 });

    // Verify burst state
    await expect(cadenceIndicator).toContainText('集中執筆');
    const editorBody = page.locator('#editorBody');
    await expect(editorBody).toHaveClass(/cadence-burst/);

    // Screenshot in burst mode (noise suppression)
    await page.screenshot({
      path: path.join('docs', 'reports', 'screenshots', '04_plotailor_cadence_burst.png'),
      fullPage: false,
    });

    // 2. Short pause (400 - 1000ms)
    await page.waitForTimeout(500);
    await expect(cadenceIndicator).toContainText('短休止');
    await expect(editorBody).toHaveClass(/cadence-short-pause/);

    // 3. Deep pause (> 1500ms)
    await page.waitForTimeout(1200);
    await expect(cadenceIndicator).toContainText('深層推敲');
    await expect(editorBody).toHaveClass(/cadence-deep-pause/);
  });

  test('Multi-layer Decoration & POV Breach Error: editor layout and vertical writing toggle', async ({ page }) => {
    const editor = page.locator('.cm-content');
    await expect(editor).toBeVisible();

    // 1. Test vertical writing mode
    const btnVertical = page.locator('#btnToggleOrientation');
    await expect(btnVertical).toBeVisible();
    await btnVertical.click();
    await expect(page.locator('#paneCenter')).toHaveClass(/vertical-rl/);

    // Screenshot of multi-layer decoration & editor in vertical writing
    await page.screenshot({
      path: path.join('docs', 'reports', 'screenshots', '05_plotailor_multilayer_decoration.png'),
      fullPage: false,
    });

    // 2. Switch back to horizontal writing
    await btnVertical.click();
    await expect(page.locator('#paneCenter')).not.toHaveClass(/vertical-rl/);
  });

  test('Dual-Track Timeline: Sjuzhet vs Fabula, cubic Bezier splines, and foreshadowing arcs', async ({ page }) => {
    // 1. Switch left tab to timeline
    const timelineTab = page.locator('button[data-tab="timeline"]');
    await timelineTab.click();
    await expect(timelineTab).toHaveClass(/active/);

    // 2. Verify Dual-Track SVG canvas and tracks
    const svgCanvas = page.locator('.dual-track-svg');
    await expect(svgCanvas).toBeVisible();
    await expect(svgCanvas).toContainText('Sjuzhet (読者体験軸)');
    await expect(svgCanvas).toContainText('Fabula (客観時間軸)');

    // 3. Verify connecting splines
    const splines = page.locator('.timeline-spline');
    const splineCount = await splines.count();
    expect(splineCount).toBeGreaterThanOrEqual(3);

    // 4. Verify analepsis (flashback) spline
    const analepsisSpline = page.locator('.timeline-spline.analepsis');
    await expect(analepsisSpline).toBeVisible();

    // 5. Verify foreshadowing arc
    const arc = page.locator('.foreshadowing-arc');
    await expect(arc.first()).toBeVisible();

    // Screenshot of dual-track timeline
    await page.screenshot({
      path: path.join('docs', 'reports', 'screenshots', '06_plotailor_dual_track_timeline.png'),
      fullPage: false,
    });
  });

  test('Shelved Lore Stock & Promotion: manual score S_manual, filter, and Alt+P rebind', async ({ page }) => {
    // 1. Switch left tab to lore
    const loreTab = page.locator('button[data-tab="lore"]');
    await loreTab.click();
    await expect(loreTab).toHaveClass(/active/);

    // 2. Verify S_manual score badges
    const scoreBadges = page.locator('.score-badge');
    await expect(scoreBadges.first()).toBeVisible();
    await expect(scoreBadges.first()).toContainText('S:');

    // 3. Verify shelved filter chip
    const shelvedFilterChip = page.locator('button[data-cat="shelved"]');
    await expect(shelvedFilterChip).toBeVisible();

    // 4. Open modal to create a shelved entity
    const btnOpenNew = page.locator('#btnOpenNewLoreModal');
    await btnOpenNew.click();

    await page.fill('#loreEntityName', '忘却の古文書');
    await page.selectOption('#loreEntityCategory', 'item');
    await page.selectOption('#loreEntityStatus', 'shelved');
    await page.fill('#loreEntityRole', '古代秘術の原本');
    await page.fill('#loreEntityDesc', '星辰の盟約より古くから伝わる失われた秘術の写本。');
    await page.click('#btnSaveLoreEntity');

    // 5. Filter by shelved
    await shelvedFilterChip.click();
    await expect(shelvedFilterChip).toHaveClass(/active/);

    const shelvedCard = page.locator('.lore-card').first();
    await expect(shelvedCard).toBeVisible();
    await expect(shelvedCard).toContainText('忘却の古文書');

    // Verify promote button
    const btnPromote = shelvedCard.locator('.btn-promote-lore');
    await expect(btnPromote).toBeVisible();

    // Screenshot of shelved lore card & score
    await page.screenshot({
      path: path.join('docs', 'reports', 'screenshots', '07_plotailor_shelved_lore.png'),
      fullPage: false,
    });

    // 6. Click promote button to rebind
    await btnPromote.click();

    // Toast confirmation
    const toast = page.locator('div', { hasText: '未配置棚から復帰' });
    await expect(toast).toBeVisible();
  });
});
