// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ExportController,
  SettingsController,
  PaneController,
  HistoryController,
  ChapterController,
  LoreController,
  ViewController,
  type ChapterData,
} from '../src/app/controllers/index.js';
import { LoreEntityManager } from '../src/core/lore/LoreEntityManager.js';
import { ProjectManager } from '../src/core/project/index.js';
import { LoreInspectorDock } from '../src/ui/LoreInspectorDock.js';
import { NarrativeInspectorDock } from '../src/ui/NarrativeInspectorDock.js';
import { CausalDagEngine } from '../src/core/causality/CausalDagEngine.js';
import { DualTrackTimelineEngine } from '../src/core/timeline/DualTrackTimeline.js';
import { EditorState } from '@codemirror/state';

describe('Plotailor Controllers Refactoring & Extension Points', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="editorBody"></div>
      <div id="paneLeft"></div>
      <div id="paneRight"></div>
      <div id="paneCenter"></div>
      <div id="leftPaneContent"></div>
      <div id="dockContent"></div>
      <div id="btnToggleLeftPane"></div>
      <div id="btnToggleRightPane"></div>
      <div id="btnCollapseLeft"></div>
      <div id="btnCollapseRight"></div>
      <div id="btnHamburgerMenu"></div>
      <div id="hamburgerDropdown" style="display: none;"></div>
      <div id="settingsModal" style="display: none;">
        <button id="btnCloseSettingsModal"></button>
        <input id="settingAutoIndent" type="checkbox" />
        <input id="settingAutoRuby" type="checkbox" />
        <input id="settingRealtimeLinter" type="checkbox" />
        <select id="settingFontSize"><option value="16px">16px</option></select>
        <select id="settingFontFamily"><option value="mincho">mincho</option></select>
      </div>
      <div id="exportModal" style="display: none;"></div>
      <div id="loreModal" style="display: none;">
        <input id="loreEntityId" />
        <input id="loreEntityName" />
        <select id="loreEntityCategory"><option value="character">character</option></select>
        <input id="loreEntityRole" />
        <select id="loreEntityStatus"><option value="active">active</option></select>
        <input id="loreEntityAliases" />
        <textarea id="loreEntityDesc"></textarea>
        <div id="loreModalHeading"></div>
        <button id="btnDeleteLoreEntity"></button>
      </div>
      <div id="activeChapterTitle"></div>
      <select id="chapterSelect"></select>
      <div id="charCountHeader"></div>
      <div id="charCountFooter"></div>
      <div id="cursorLine"></div>
      <div id="cursorCol"></div>
      <div id="selectionLength"></div>
      <div id="typingSpeed"></div>
      <div id="footerToastArea"></div>
      <div id="saveStatusIndicator"></div>
      <button id="btnToolbarUndo"></button>
      <button id="btnToolbarRedo"></button>
      <button id="btnHeaderUndo"></button>
      <button id="btnHeaderRedo"></button>
      <div id="historyDepthBadge"></div>
    `;
  });

  describe('ExportController', () => {
    it('manages modal visibility and executes custom registered export handlers', () => {
      const showToast = vi.fn();
      const exportCtrl = new ExportController({
        getWorkTitle: () => 'テスト作品',
        getChapters: () => [{ id: 'ch1', title: '第一章', charCount: 10, content: 'テスト本文' }],
        getLoreEntities: () => [],
        getCurrentChapterContent: () => 'テスト本文',
        getKeystrokeCount: () => 100,
        isVertical: () => false,
        showToast,
      });

      exportCtrl.openExportModal();
      expect(document.getElementById('exportModal')?.style.display).toBe('flex');

      exportCtrl.closeExportModal();
      expect(document.getElementById('exportModal')?.style.display).toBe('none');

      const customHandler = vi.fn();
      exportCtrl.registerExportHandler('epub', customHandler);

      const ran = exportCtrl.runCustomExport('epub');
      expect(ran).toBe(true);
      expect(customHandler).toHaveBeenCalledWith('テスト作品', expect.any(Array));
    });
  });

  describe('SettingsController', () => {
    it('applies font preferences and triggers setting listeners', () => {
      const showToast = vi.fn();
      const body = document.getElementById('editorBody') as HTMLDivElement;

      const settingsCtrl = new SettingsController({
        getEditorBody: () => body,
        getEditorView: () => null,
        getRubyCompartment: () => ({ reconfigure: () => [] } as any),
        setRubyMode: vi.fn(),
        showToast,
      });

      const listener = vi.fn();
      settingsCtrl.registerSettingListener(listener);

      settingsCtrl.setState({ fontSize: '18px', fontFamily: 'gothic' });
      settingsCtrl.applyFontPreferences();

      expect(body.style.fontSize).toBe('18px');
      expect(body.style.fontFamily).toContain('UDPGothic');

      settingsCtrl.openSettingsModal();
      expect(document.getElementById('settingsModal')?.style.display).toBe('flex');
    });
  });

  describe('PaneController', () => {
    it('toggles pane state and notifies registered listeners', () => {
      let leftOpen = true;
      let rightOpen = true;

      const paneCtrl = new PaneController({
        isLeftPaneOpen: () => leftOpen,
        setLeftPaneOpen: (v) => { leftOpen = v; },
        isRightPaneOpen: () => rightOpen,
        setRightPaneOpen: (v) => { rightOpen = v; },
        openSettingsModal: vi.fn(),
        exportFullAozora: vi.fn(),
        openExportModal: vi.fn(),
        exportPoPCertificate: vi.fn(),
        toggleRuby: vi.fn(),
        getRubyMode: () => 'normal',
        toggleWrap: vi.fn(),
        isLineWrapping: () => true,
        setActiveRightTab: vi.fn(),
        renderRightPane: vi.fn(),
      });

      const listener = vi.fn();
      paneCtrl.registerPaneToggleListener(listener);

      paneCtrl.toggleLeftPane();
      expect(leftOpen).toBe(false);
      expect(listener).toHaveBeenCalledWith('left', false);

      paneCtrl.toggleRightPane();
      expect(rightOpen).toBe(false);
      expect(listener).toHaveBeenCalledWith('right', false);
    });
  });

  describe('HistoryController', () => {
    it('records snapshots and notifies listeners on change', () => {
      const snapshotsMap = new Map<string, any[]>();
      const historyCtrl = new HistoryController({
        getEditorView: () => null,
        getCurrentChapterId: () => 'ch1',
        getChapterSnapshots: () => snapshotsMap,
        getChapterStates: () => new Map(),
        getChapters: () => [],
        createChapterState: () => ({}) as EditorState,
        saveToStorage: vi.fn(),
        updateStats: vi.fn(),
        showToast: vi.fn(),
        setActiveRightTab: vi.fn(),
        renderRightPane: vi.fn(),
      });

      const listener = vi.fn();
      historyCtrl.registerSnapshotListener(listener);

      historyCtrl.recordSnapshot('ch1', 'バージョン1');
      expect(snapshotsMap.get('ch1')?.length).toBe(1);
      expect(listener).toHaveBeenCalledWith('ch1', 1);

      // Duplicate content is skipped
      historyCtrl.recordSnapshot('ch1', 'バージョン1');
      expect(snapshotsMap.get('ch1')?.length).toBe(1);

      historyCtrl.recordSnapshot('ch1', 'バージョン2');
      expect(snapshotsMap.get('ch1')?.length).toBe(2);
      expect(listener).toHaveBeenCalledWith('ch1', 2);
    });
  });

  describe('ChapterController', () => {
    it('handles chapter selection and triggers change listeners', () => {
      let chapters: ChapterData[] = [
        { id: 'ch1', title: '第一章', charCount: 10, content: '内容1' },
        { id: 'ch2', title: '第二章', charCount: 20, content: '内容2' },
      ];
      let currentId = 'ch1';

      const chapterCtrl = new ChapterController({
        getChapters: () => chapters,
        setChapters: (ch) => { chapters = ch; },
        getCurrentChapterId: () => currentId,
        setCurrentChapterId: (id) => { currentId = id; },
        getEditorView: () => null,
        getChapterStates: () => new Map(),
        getChapterSnapshots: () => new Map(),
        createChapterState: () => ({}) as EditorState,
        getProjectManager: () => ({ deleteChapter: async () => {}, reorderChapters: async () => {} } as any),
        getCurrentProjectId: () => 'proj1',
        recordSnapshot: vi.fn(),
        saveToStorage: vi.fn(),
        renderLeftPane: vi.fn(),
        updateStats: vi.fn(),
        updateHistoryUI: vi.fn(),
        updateMultiLayerDecorations: vi.fn(),
        showToast: vi.fn(),
      });

      const listener = vi.fn();
      chapterCtrl.registerChapterChangeListener(listener);

      chapterCtrl.renderChapterSelect();
      const select = document.getElementById('chapterSelect') as HTMLSelectElement;
      expect(select.options.length).toBe(2);

      chapterCtrl.loadChapter('ch2');
      expect(currentId).toBe('ch2');
      expect(listener).toHaveBeenCalledWith('load', 'ch2');

      chapterCtrl.addNewChapter();
      expect(chapters.length).toBe(3);
      expect(listener).toHaveBeenCalledWith('add', expect.any(String));
    });
  });

  describe('LoreController', () => {
    it('manages lore modal, rendering, and notifies change listeners', async () => {
      const pm = new ProjectManager();
      const loreManager = new LoreEntityManager(pm.getVFS());
      const loreDock = new LoreInspectorDock({ dictionary: [] });
      const dagEngine = new CausalDagEngine();
      const timelineEngine = new DualTrackTimelineEngine();
      const narrativeDock = new NarrativeInspectorDock();

      let activeLeftTab = 'lore';
      let activeRightTab = 'lore';
      let activeLoreFilter: any = 'all';

      const loreCtrl = new LoreController({
        getLoreManager: () => loreManager,
        getLoreDock: () => loreDock,
        getDagEngine: () => dagEngine,
        getTimelineEngine: () => timelineEngine,
        getNarrativeDock: () => narrativeDock,
        getEditorView: () => null,
        getCurrentProjectId: () => 'proj1',
        getActiveLeftTab: () => activeLeftTab,
        setActiveLeftTab: (t) => { activeLeftTab = t; },
        getActiveRightTab: () => activeRightTab,
        setActiveRightTab: (t) => { activeRightTab = t; },
        getActiveLoreFilter: () => activeLoreFilter,
        setActiveLoreFilter: (f) => { activeLoreFilter = f; },
        getChapters: () => [{ id: 'ch1', title: '第一章', charCount: 10, content: 'ヴァレリウスが歩く' }],
        loadChapter: vi.fn(),
        getCurrentChapterId: () => 'ch1',
        getChapterSnapshots: () => new Map(),
        getWorkTitle: () => '作品名',
        getKeystrokeCount: () => 50,
        exportPoPCertificate: vi.fn(),
        addNewChapter: vi.fn(),
        loadChapterBySelect: vi.fn(),
        renameChapter: vi.fn(),
        deleteChapter: vi.fn(),
        reorderChapters: vi.fn(),
        updateMultiLayerDecorations: vi.fn(),
        showToast: vi.fn(),
      });

      const listener = vi.fn();
      loreCtrl.registerLoreChangeListener(listener);

      loreCtrl.openLoreModal();
      expect(document.getElementById('loreModal')?.style.display).toBe('flex');

      loreManager.setEntities([]); // Start with clean entities list
      (document.getElementById('loreEntityName') as HTMLInputElement).value = 'ヴァレリウス';
      (document.getElementById('loreEntityDesc') as HTMLTextAreaElement).value = '主人公';

      await loreCtrl.saveLoreFromForm();
      expect(loreManager.getEntities().length).toBe(1);
      expect(listener).toHaveBeenCalledWith('create', expect.any(String));

      loreCtrl.renderLeftPane();
      expect(document.getElementById('leftPaneContent')?.innerHTML).toContain('ヴァレリウス');

      loreCtrl.renderRightPane();
      expect(document.getElementById('dockContent')?.innerHTML).toBeDefined();
    });
  });

  describe('ViewController', () => {
    it('manages orientation, theme, fullscreen, wrapping, and format buttons', () => {
      const editorBody = document.getElementById('editorBody') as HTMLDivElement;
      let saved = false;
      const showToast = vi.fn();

      const viewCtrl = new ViewController({
        getEditorView: () => null,
        getEditorBody: () => editorBody,
        getWrapCompartment: () => ({ of: vi.fn(), reconfigure: vi.fn() } as any),
        getRubyCompartment: () => ({ of: vi.fn(), reconfigure: vi.fn() } as any),
        getColumnGuideline: () => null,
        getFullscreenStatusBar: () => null,
        getFontSize: () => '16px',
        getKinsokuColumns: () => 40,
        saveToStorage: () => { saved = true; },
        showToast,
      });

      // Default state
      expect(viewCtrl.getIsVertical()).toBe(true);
      expect(viewCtrl.getIsNightTheme()).toBe(false);

      // Orientation toggle
      viewCtrl.toggleOrientation();
      expect(viewCtrl.getIsVertical()).toBe(false);
      expect(saved).toBe(true);
      expect(showToast).toHaveBeenCalledWith(expect.stringContaining('横書き'));

      // Theme toggle
      viewCtrl.toggleTheme();
      expect(viewCtrl.getIsNightTheme()).toBe(true);
      expect(document.body.classList.contains('theme-night')).toBe(true);

      // Fullscreen toggle
      viewCtrl.toggleFullscreen(true);
      expect(viewCtrl.getIsFullscreen()).toBe(true);
      expect(document.body.classList.contains('fullscreen-active')).toBe(true);

      viewCtrl.toggleFullscreen(false);
      expect(viewCtrl.getIsFullscreen()).toBe(false);
      expect(document.body.classList.contains('fullscreen-active')).toBe(false);

      // Wrapping toggle
      viewCtrl.toggleWrap();
      expect(viewCtrl.getIsLineWrapping()).toBe(false);

      // Ruby toggle
      expect(viewCtrl.getRubyMode()).toBe('normal');
      viewCtrl.toggleRuby();
      expect(viewCtrl.getRubyMode()).toBe('raw');
      expect(viewCtrl.getRubyButtonLabel()).toBe('ルビ: 記法直接');
    });
  });
});

