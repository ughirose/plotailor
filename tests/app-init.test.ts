// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('PlotailorApp DOM Initialization & Data Integrity', () => {
  let html: string;

  beforeEach(() => {
    html = fs.readFileSync(path.resolve(__dirname, '../app.html'), 'utf-8');
    document.documentElement.innerHTML = html;
  });

  it('contains essential IDE containers for chapters, editor, and lore', () => {
    const editorBody = document.getElementById('editorBody');
    const leftPane = document.getElementById('leftPaneContent');
    const dockContent = document.getElementById('dockContent');
    const workTitle = document.getElementById('workTitleText');
    const chapterSelect = document.getElementById('chapterSelect');

    expect(editorBody).not.toBeNull();
    expect(leftPane).not.toBeNull();
    expect(dockContent).not.toBeNull();
    expect(workTitle).not.toBeNull();
    expect(chapterSelect).not.toBeNull();
  });

  it('has valid collapsible buttons and hamburger dropdown controls', () => {
    const btnCollapseLeft = document.getElementById('btnCollapseLeft');
    const btnCollapseRight = document.getElementById('btnCollapseRight');
    const btnHamburger = document.getElementById('btnHamburgerMenu');
    const dropdown = document.getElementById('hamburgerDropdown');
    const btnLegend = document.getElementById('btnToggleLegendCard');
    const legendPanel = document.getElementById('decorationLegendPanel');

    expect(btnCollapseLeft).not.toBeNull();
    expect(btnCollapseRight).not.toBeNull();
    expect(btnHamburger).not.toBeNull();
    expect(dropdown).not.toBeNull();
    expect(btnLegend).not.toBeNull();
    expect(legendPanel).not.toBeNull();
  });

  it('instantiates PlotailorApp and renders default chapters and lore', async () => {
    // Provide Range mock for CodeMirror in JSDOM
    if (!document.createRange) {
      document.createRange = () => ({
        setStart: () => {},
        setEnd: () => {},
        commonAncestorContainer: document.body,
        getBoundingClientRect: () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }),
        getClientRects: () => [],
      } as any);
    }

    const { PlotailorApp } = await import('../src/app/main.js');
    const app = new PlotailorApp();
    expect(app).toBeDefined();

    // Verify Left pane renders chapters
    const leftPane = document.getElementById('leftPaneContent');
    expect(leftPane?.innerHTML).toContain('第一章');
    expect(leftPane?.innerHTML).toContain('第二章');

    // Verify Right pane renders dock panels
    const dockContent = document.getElementById('dockContent');
    expect(dockContent?.innerHTML.length).toBeGreaterThan(0);
  });

  it('supports right pane collapse and click-to-restore functionality', async () => {
    const { PlotailorApp } = await import('../src/app/main.js');
    new PlotailorApp();

    const paneRight = document.getElementById('paneRight');
    const btnCollapseRight = document.getElementById('btnCollapseRight');

    expect(paneRight?.classList.contains('collapsed')).toBe(false);

    // Click collapse button
    btnCollapseRight?.click();
    expect(paneRight?.classList.contains('collapsed')).toBe(true);
    expect(paneRight?.style.display).not.toBe('none'); // Strip remains visible for restoration

    // Click the 28px strip to restore
    paneRight?.click();
    expect(paneRight?.classList.contains('collapsed')).toBe(false);

    // Click collapse again then click button to restore
    btnCollapseRight?.click();
    expect(paneRight?.classList.contains('collapsed')).toBe(true);
    btnCollapseRight?.click();
    expect(paneRight?.classList.contains('collapsed')).toBe(false);
  });

  it('opens and closes settings, export, and help modals properly without hierarchy collision', async () => {
    const { PlotailorApp } = await import('../src/app/main.js');
    new PlotailorApp();

    const settingsModal = document.getElementById('settingsModal');
    const exportModal = document.getElementById('exportModal');
    const loreModal = document.getElementById('loreModal');

    // Confirm modals are siblings, not nested within loreModal
    expect(loreModal?.contains(settingsModal!)).toBe(false);
    expect(loreModal?.contains(exportModal!)).toBe(false);

    // 1. Settings modal
    const menuOpenSettings = document.getElementById('menuOpenSettings');
    menuOpenSettings?.click();
    expect(settingsModal?.style.display).toBe('flex');
    document.getElementById('btnCloseSettingsModal')?.click();
    expect(settingsModal?.style.display).toBe('none');

    // 2. Export modal
    const menuExportAozora = document.getElementById('menuExportAozora');
    menuExportAozora?.click();
    expect(exportModal?.style.display).toBe('flex');
    document.getElementById('btnCloseExportModal')?.click();
    expect(exportModal?.style.display).toBe('none');

    // 3. Help modal (User Requirement 5: Dedicated modal opened from header '?' button)
    const btnHeaderHelp = document.getElementById('btnHeaderHelp');
    const helpModal = document.getElementById('helpModal');
    btnHeaderHelp?.click();
    expect(helpModal?.style.display).toBe('flex');
    document.getElementById('btnCloseHelpModal')?.click();
    expect(helpModal?.style.display).toBe('none');
  });

  it('configures snapshot recording frequency and synchronizes across settings and history modals', async () => {
    const { PlotailorApp } = await import('../src/app/main.js');
    const app = new PlotailorApp();

    expect(app.snapshotFrequency).toBe('standard');

    // Change via setSnapshotFrequency
    app.setSnapshotFrequency('low', false);
    expect(app.snapshotFrequency).toBe('low');
    expect(localStorage.getItem('plotailor_snapshot_frequency')).toBe('low');

    // Verify UI synchronization
    const selSetting = document.getElementById('settingSnapshotFrequency') as HTMLSelectElement;
    const selQuick = document.getElementById('historySnapshotFrequencyQuick') as HTMLSelectElement;

    app.openSettingsModal();
    expect(selSetting?.value).toBe('low');

    app.openHistoryModal();
    expect(selQuick?.value).toBe('low');

    // Test changing via quick select
    if (selQuick) {
      selQuick.value = 'minimal';
      selQuick.dispatchEvent(new Event('change'));
      expect(app.snapshotFrequency).toBe('minimal');
      expect(selSetting?.value).toBe('minimal');
    }
  });

  it('toggles ruby mode without throwing errors and updates menu label', async () => {
    const { PlotailorApp } = await import('../src/app/main.js');
    new PlotailorApp();

    const menuToggleRuby = document.getElementById('menuToggleRuby');
    const menuRubyStatus = document.getElementById('menuRubyStatus');

    expect(() => {
      menuToggleRuby?.click();
    }).not.toThrow();

    expect(menuRubyStatus?.textContent).toContain('現在:');
  });

  it('creates clean new project without residual sample data and supports multi-project switching and refresh', async () => {
    const InlineDialog = await import('../src/app/InlineDialog.js');
    vi.spyOn(InlineDialog, 'showInlinePrompt').mockResolvedValue('完全新規の異世界奇譚');

    const { PlotailorApp } = await import('../src/app/main.js');
    const app = new PlotailorApp();

    // 1. Initial default project check
    const titleEl = document.getElementById('workTitleText');
    expect(titleEl?.textContent).toBe('星辰の境界線');

    // 2. Create new project
    await (app as any).createNewProjectPrompt();

    expect(titleEl?.textContent).toBe('完全新規の異世界奇譚');
    const chapterSelect = document.getElementById('chapterSelect') as HTMLSelectElement;
    expect(chapterSelect.children.length).toBe(1);
    expect(chapterSelect.children[0].textContent).toContain('第一章 幕開け');

    // Confirm sample character "ヴァレリウス" is purged from new project
    const newEntities = (app as any).loreManager.getEntities();
    expect(newEntities.some((e: any) => e.name === 'ヴァレリウス将軍')).toBe(false);
    expect(newEntities.length).toBe(0);

    // 3. Add an entity specific to this new project
    (app as any).loreManager.createEntity({
      name: 'エリス',
      category: 'character',
      description: '旅の魔導士',
    });
    await (app as any).saveLoreData();
    expect((app as any).loreManager.getEntities().length).toBe(1);

    // 4. Switch back to default project
    await (app as any).switchProject('default_work');
    expect(titleEl?.textContent).toBe('星辰の境界線');

    // 5. Switch back to new project
    const projects = await (app as any).projectManager.listProjects();
    const createdProj = projects.find((p: any) => p.title === '完全新規の異世界奇譚');
    expect(createdProj).toBeDefined();

    await (app as any).switchProject(createdProj.id);
    expect(titleEl?.textContent).toBe('完全新規の異世界奇譚');
    expect((app as any).loreManager.getEntities().some((e: any) => e.name === 'エリス')).toBe(true);

    // 6. Simulate browser refresh (reload / re-instantiate PlotailorApp)
    const refreshedApp = new PlotailorApp();
    // Allow VFS init to settle
    await (refreshedApp as any).initProjectVFS();

    const refreshedTitleEl = document.getElementById('workTitleText');
    expect(refreshedTitleEl?.textContent).toBe('完全新規の異世界奇譚');

    // Cleanup mock
    vi.restoreAllMocks();
  });

  it('supports custom snapshot frequency (chars and seconds) and synchronizes with localStorage and UI', async () => {
    const { PlotailorApp } = await import('../src/app/main.js');
    const app = new PlotailorApp();

    // 1. Set to custom frequency
    app.setSnapshotFrequency('custom');
    expect(app.snapshotFrequency).toBe('custom');
    expect(localStorage.getItem('plotailor_snapshot_frequency')).toBe('custom');

    const selSetting = document.getElementById('settingSnapshotFrequency') as HTMLSelectElement;
    const selQuick = document.getElementById('historySnapshotFrequencyQuick') as HTMLSelectElement;
    expect(selSetting?.value).toBe('custom');
    expect(selQuick?.value).toBe('custom');

    // 2. Set custom threshold inputs
    const inpChars = document.getElementById('settingSnapshotCustomChars') as HTMLInputElement;
    const inpSecs = document.getElementById('settingSnapshotCustomSeconds') as HTMLInputElement;
    if (inpChars && inpSecs) {
      inpChars.value = '45';
      inpChars.dispatchEvent(new Event('input'));
      inpSecs.value = '20';
      inpSecs.dispatchEvent(new Event('input'));

      expect(app.snapshotCustomChars).toBe(45);
      expect(app.snapshotCustomSeconds).toBe(20);
      expect(localStorage.getItem('plotailor_snapshot_custom_chars')).toBe('45');
      expect(localStorage.getItem('plotailor_snapshot_custom_seconds')).toBe('20');
    }
  });

  it('supports vertical Latin upright toggle and toggles body.vertical-upright class', async () => {
    const { PlotailorApp } = await import('../src/app/main.js');
    const app = new PlotailorApp();
    app.setVerticalUpright(true);
    expect(document.body.classList.contains('vertical-upright')).toBe(true);
    expect(localStorage.getItem('plotailor_vertical_upright')).toBe('true');

    app.setVerticalUpright(false);
    expect(document.body.classList.contains('vertical-upright')).toBe(false);
    expect(localStorage.getItem('plotailor_vertical_upright')).toBe('false');
  });

  it('supports diff-only toggle in history modal', async () => {
    const { PlotailorApp } = await import('../src/app/main.js');
    const app = new PlotailorApp();
    const diffContainer = document.getElementById('historyDiffContainer');

    app.toggleHistoryDiffOnly(true);
    expect(diffContainer?.classList.contains('history-diff-only-mode')).toBe(true);

    app.toggleHistoryDiffOnly(false);
    expect(diffContainer?.classList.contains('history-diff-only-mode')).toBe(false);
  });

  it('resets all data cleanly to default sample state when resetAllDataToDefault is confirmed', async () => {
    // Mock showInlineConfirm to auto-confirm
    const inlineDialog = await import('../src/app/InlineDialog.js');
    const confirmSpy = vi.spyOn(inlineDialog, 'showInlineConfirm').mockResolvedValue(true);

    const { PlotailorApp } = await import('../src/app/main.js');
    const app = new PlotailorApp();

    // 1. Mutate some state and write custom localStorage entries
    localStorage.setItem('plotailor_work_title', '汚染されたタイトル');
    localStorage.setItem('plotailor_custom_temp_key', 'test_value');
    localStorage.setItem('non_plotailor_key', 'should_remain');

    // 2. Invoke reset
    const result = await app.resetAllDataToDefault();
    expect(result).toBe(true);

    // 3. Verify Plotailor localStorage keys are cleaned and default state restored
    expect(localStorage.getItem('plotailor_custom_temp_key')).toBeNull();
    expect(localStorage.getItem('non_plotailor_key')).toBe('should_remain');

    const titleEl = document.getElementById('workTitleText');
    expect(titleEl?.textContent).toBe('星辰の残響');

    confirmSpy.mockRestore();
  });
});

