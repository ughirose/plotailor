/**
 * Plotailor Full Writing IDE Application Core (src/app/main.ts)
 * 3-Pane Literary IDE with Realtime Ruby, CodeMirror 6, Narrative Linter & Zero Pronoun Resolver
 */

import { EditorView, keymap } from '@codemirror/view';
import { showInlineConfirm, showInlinePrompt, showInlineAlert } from './InlineDialog.js';
import { EditorState, Compartment } from '@codemirror/state';
import { history, defaultKeymap, historyKeymap, undo, redo } from '@codemirror/commands';
import { rubyDecorationExtension, setRubyDisplayMode, type RubyDisplayMode } from '../core/editor/RubyDecorationExtension.js';
import { cm6ImeGuard } from '../core/editor/cm6ImeGuard.js';
import { verticalWritingExtension, setAutoIndentEnabled } from '../core/editor/VerticalWritingExtension.js';
import { wrapSelectionWithRuby } from '../core/editor/RubyShortcutExtension.js';
import { ScrollNormalizer } from '../core/editor/ScrollNormalizer.js';
import { narrativeLinterExtension } from '../core/editor/CodeMirrorNarrativeExtension.js';
import { NarrativeInspectorDock } from '../ui/NarrativeInspectorDock.js';
import { LoreInspectorDock } from '../ui/LoreInspectorDock.js';
import { LoreEntityManager, type LoreCategory } from '../core/lore/LoreEntityManager.js';
import { CausalDagEngine } from '../core/causality/CausalDagEngine.js';
import { OpfsWalWorkerBridge } from '../core/storage/OpfsWalWorkerBridge.js';
import type { NarrativeAnalysisResult } from '../core/editor/NarrativeLinterEngine.js';
import { ProjectManager } from '../core/project/index.js';
import { TypingCadenceMachine, type CadenceStatus } from '../core/editor/TypingCadenceMachine.js';
import {
  type MultiLayerItem,
  PovBreachDetector,
  multiLayerDecorationField,
  setMultiLayerDecorations,
  buildMultiLayerDecorationSet,
} from '../core/editor/MultiLayerDecoration.js';
import { DualTrackTimelineEngine } from '../core/timeline/DualTrackTimeline.js';

import {
  ExportController,
  SettingsController,
  PaneController,
  HistoryController,
  ChapterController,
  LoreController,
  type ChapterData,
} from './controllers/index.js';

export type { ChapterData };

const DEFAULT_CHAPTERS: ChapterData[] = [
  {
    id: 'ch1',
    title: '第一章 双月の巡る夜に',
    charCount: 0,
    content: `　深藍の夜空を二つの月が照らし出していた。
　第一衛星《セレネ》が蒼き冷光を投げかけ、第二衛星《フォボス》の琥珀色が地平の端を染める。
　二重満月<<コンジャンクション>>の夜、北方の砦に集う兵たちの息は白く凍りついていた。不穏な凶兆が立ち込めている。

「総督<<ヴァレリウス>>閣下、帝国軍の先遣隊が峡谷を越えたとの急報です」

　斥候の震える声に、男は静かに外套を翻した。
　その胸元には、皇帝から下賜された金箔の紋章が鈍く輝いている。
　彼は剣の柄に手を掛け、夜の帳を見据えた。
　この戦いは、ただの領土紛争ではない。千年の古より受け継がれし<<<<星辰の盟約>>>>を巡る、運命の分岐点であった。`
  },
  {
    id: 'ch2',
    title: '第二章 帝都の影と密書',
    charCount: 0,
    content: `　帝都ルミナスの夜は、地上に降りた星屑のように喧噪を極めていた。
　だが、元老院の奥深く、石造りの回廊に届くのは靴音の反響のみである。`
  },
  {
    id: 'ch3',
    title: '第三章 忘却の砦',
    charCount: 0,
    content: `　極北の風が氷壁を削る音が、夜を徹して響き渡っていた。`
  }
];

export class PlotailorApp {
  private editorBody: HTMLDivElement;
  private cmEditor!: EditorView;
  private narrativeDock: NarrativeInspectorDock;
  private projectManager = new ProjectManager();
  private currentProjectId = 'default_work';
  private chapters: ChapterData[] = [];
  private currentChapterId = 'ch1';
  private workTitle = '星辰の境界線';
  private isVertical = false;
  private isLineWrapping = true;
  private rubyMode: RubyDisplayMode = 'normal';
  private isNightTheme = false;
  private isFullscreen = false;
  private leftPaneOpen = true;
  private rightPaneOpen = true;
  private activeLeftTab = 'toc';
  private activeRightTab = 'linter';
  private keystrokeCount = 0;
  private typingStartTime = Date.now();
  private latestNarrativeResult: NarrativeAnalysisResult | null = null;
  private wrapCompartment = new Compartment();
  private rubyCompartment = new Compartment();
  private saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private scrollNormalizer = new ScrollNormalizer();
  private chapterStates: Map<string, EditorState> = new Map();
  private chapterSnapshots: Map<string, Array<{ time: number; text: string; length: number }>> = new Map();
  private loreManager: LoreEntityManager;
  private dagEngine: CausalDagEngine = new CausalDagEngine();
  private walWorkerBridge: OpfsWalWorkerBridge = new OpfsWalWorkerBridge();
  private loreDock!: LoreInspectorDock;
  private activeLoreFilter: LoreCategory | 'all' | 'shelved' = 'all';
  private cadenceMachine: TypingCadenceMachine;
  private povDetector = new PovBreachDetector();
  private timelineEngine = new DualTrackTimelineEngine();
  private currentPovCharacterId = 'char-valerius';

  // Sub-controllers
  public exportController: ExportController;
  public settingsController: SettingsController;
  public paneController: PaneController;
  public historyController: HistoryController;
  public chapterController: ChapterController;
  public loreController: LoreController;

  constructor() {
    this.editorBody = (document.getElementById('editorBody') || document.getElementById('editor-body')) as HTMLDivElement;
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      this.leftPaneOpen = false;
      this.rightPaneOpen = false;
    }

    this.cadenceMachine = new TypingCadenceMachine({
      onStateChange: (status) => this.handleCadenceState(status),
    });

    this.narrativeDock = new NarrativeInspectorDock({
      onJumpToTarget: (from, to) => this.jumpToEditor(from, to),
      onInsertSubject: (from, subject) => this.insertSubjectAt(from, subject),
    });

    this.loreManager = new LoreEntityManager(this.projectManager.getVFS());
    this.loreDock = new LoreInspectorDock({
      dictionary: this.loreManager.toLoreTermDefinitions(),
      cursorProximityThreshold: 10,
      onReplaceTerm: (event) => {
        if (!this.cmEditor) return;
        this.cmEditor.dispatch({ changes: { from: event.from, to: event.to, insert: event.replacement } });
        this.showToast(`✨「${event.originalText}」を「${event.replacement}」に置換しました`);
      },
      onShelveTerm: (event) => {
        this.loreManager.updateEntity(event.termId, { status: event.newStatus });
        this.saveLoreData();
        this.renderRightPane();
        this.renderLeftPane();
      },
    });

    // Sub-controller instantiations
    this.exportController = new ExportController({
      getWorkTitle: () => this.workTitle,
      getChapters: () => this.chapters,
      getLoreEntities: () => this.loreManager.getEntities(),
      getCurrentChapterContent: () => (this.cmEditor ? this.cmEditor.state.doc.toString() : ''),
      getKeystrokeCount: () => this.keystrokeCount,
      isVertical: () => this.isVertical,
      showToast: (msg) => this.showToast(msg),
    });

    this.settingsController = new SettingsController({
      getEditorBody: () => this.editorBody,
      getEditorView: () => this.cmEditor,
      getRubyCompartment: () => this.rubyCompartment,
      setRubyMode: (mode) => { this.rubyMode = mode; },
      showToast: (msg) => this.showToast(msg),
    });

    this.paneController = new PaneController({
      isLeftPaneOpen: () => this.leftPaneOpen,
      setLeftPaneOpen: (open) => { this.leftPaneOpen = open; },
      isRightPaneOpen: () => this.rightPaneOpen,
      setRightPaneOpen: (open) => { this.rightPaneOpen = open; },
      openSettingsModal: () => this.openSettingsModal(),
      exportFullAozora: (action) => this.exportFullAozora(action),
      openExportModal: () => this.openExportModal(),
      exportPoPCertificate: () => this.exportPoPCertificate(),
      toggleRuby: () => this.toggleRuby(),
      getRubyMode: () => this.rubyMode,
      toggleWrap: () => this.toggleWrap(),
      isLineWrapping: () => this.isLineWrapping,
      setActiveRightTab: (tab) => { this.activeRightTab = tab; },
      renderRightPane: () => this.renderRightPane(),
    });

    this.historyController = new HistoryController({
      getEditorView: () => this.cmEditor,
      getCurrentChapterId: () => this.currentChapterId,
      getChapterSnapshots: () => this.chapterSnapshots,
      getChapterStates: () => this.chapterStates,
      getChapters: () => this.chapters,
      createChapterState: (content) => this.createChapterState(content),
      saveToStorage: () => this.saveToStorage(),
      updateStats: () => this.updateStats(),
      showToast: (msg) => this.showToast(msg),
      setActiveRightTab: (tab) => { this.activeRightTab = tab; },
      renderRightPane: () => this.renderRightPane(),
    });

    this.chapterController = new ChapterController({
      getChapters: () => this.chapters,
      setChapters: (ch) => { this.chapters = ch; },
      getCurrentChapterId: () => this.currentChapterId,
      setCurrentChapterId: (id) => { this.currentChapterId = id; },
      getEditorView: () => this.cmEditor,
      getChapterStates: () => this.chapterStates,
      getChapterSnapshots: () => this.chapterSnapshots,
      createChapterState: (content) => this.createChapterState(content),
      getProjectManager: () => this.projectManager,
      getCurrentProjectId: () => this.currentProjectId,
      recordSnapshot: (id, text) => this.recordSnapshot(id, text),
      saveToStorage: () => this.saveToStorage(),
      renderLeftPane: () => this.renderLeftPane(),
      updateStats: () => this.updateStats(),
      updateHistoryUI: () => this.updateHistoryUI(),
      updateMultiLayerDecorations: () => this.updateMultiLayerDecorations(),
      showToast: (msg) => this.showToast(msg),
    });

    this.loreController = new LoreController({
      getLoreManager: () => this.loreManager,
      getLoreDock: () => this.loreDock,
      getDagEngine: () => this.dagEngine,
      getTimelineEngine: () => this.timelineEngine,
      getNarrativeDock: () => this.narrativeDock,
      getEditorView: () => this.cmEditor,
      getCurrentProjectId: () => this.currentProjectId,
      getActiveLeftTab: () => this.activeLeftTab,
      setActiveLeftTab: (tab) => { this.activeLeftTab = tab; },
      getActiveRightTab: () => this.activeRightTab,
      setActiveRightTab: (tab) => { this.activeRightTab = tab; },
      getActiveLoreFilter: () => this.activeLoreFilter,
      setActiveLoreFilter: (filter) => { this.activeLoreFilter = filter; },
      getChapters: () => this.chapters,
      loadChapter: (id) => this.loadChapter(id),
      getCurrentChapterId: () => this.currentChapterId,
      getChapterSnapshots: () => this.chapterSnapshots,
      getWorkTitle: () => this.workTitle,
      getKeystrokeCount: () => this.keystrokeCount,
      exportPoPCertificate: () => this.exportPoPCertificate(),
      addNewChapter: () => this.addNewChapter(),
      loadChapterBySelect: (id) => this.loadChapter(id),
      renameChapter: (id, title) => this.renameChapter(id, title),
      deleteChapter: (id) => this.deleteChapter(id),
      reorderChapters: (from, to) => this.reorderChapters(from, to),
      updateMultiLayerDecorations: () => this.updateMultiLayerDecorations(),
      showToast: (msg) => this.showToast(msg),
    });

    this.init();
  }

  private init() {
    this.loadStateFromStorage();
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      const paneL = document.getElementById('paneLeft');
      const paneR = document.getElementById('paneRight');
      if (paneL) paneL.style.display = 'none';
      if (paneR) paneR.style.display = 'none';
    }

    this.applyTheme();
    this.initCodeMirror();
    this.bindEvents();
    const btnRuby = document.getElementById('btnToggleRuby');
    if (btnRuby) btnRuby.textContent = this.getRubyButtonLabel();

    this.renderChapterSelect();
    this.renderLeftPane();
    this.renderRightPane();
    this.updateStats();
    this.updateMultiLayerDecorations();
    this.applyOrientation();
    this.initProjectVFS();
    this.applyFontPreferences();
  }

  private loadStateFromStorage() {
    try {
      const savedProjId = localStorage.getItem('plotailor_active_project_id');
      if (savedProjId?.trim()) this.currentProjectId = savedProjId.trim();
    } catch {}

    try {
      const projTitle = localStorage.getItem(`plotailor_project_${this.currentProjectId}_title`);
      const savedTitle = projTitle || localStorage.getItem('plotailor_work_title');
      if (savedTitle?.trim()) this.workTitle = savedTitle.trim();
      const titleEl = document.getElementById('workTitleText');
      if (titleEl) titleEl.textContent = this.workTitle;
    } catch {}

    try {
      const projChapters = localStorage.getItem(`plotailor_project_${this.currentProjectId}_chapters`);
      const savedChapters = projChapters || localStorage.getItem('plotailor_chapters');
      if (savedChapters) {
        const parsed = JSON.parse(savedChapters);
        if (Array.isArray(parsed) && parsed.length > 0) this.chapters = parsed;
      }
    } catch {}

    if (this.chapters.length === 0) this.chapters = JSON.parse(JSON.stringify(DEFAULT_CHAPTERS));
    for (const ch of this.chapters) ch.charCount = ch.content.replace(/\s+/g, '').length;

    try {
      const projActive = localStorage.getItem(`plotailor_project_${this.currentProjectId}_active_chapter`);
      const savedActive = projActive || localStorage.getItem('plotailor_active_chapter_id');
      if (savedActive && this.chapters.some((c) => c.id === savedActive)) this.currentChapterId = savedActive;
      else this.currentChapterId = this.chapters[0].id;
    } catch { this.currentChapterId = this.chapters[0].id; }

    try {
      const savedWrap = localStorage.getItem('plotailor_line_wrapping');
      if (savedWrap !== null) this.isLineWrapping = savedWrap === 'true';
    } catch {}

    try {
      const savedMode = localStorage.getItem('plotailor_ruby_mode');
      if (savedMode === 'normal' || savedMode === 'raw' || savedMode === 'off') this.rubyMode = savedMode as RubyDisplayMode;
      else {
        const savedRuby = localStorage.getItem('plotailor_ruby_decorated');
        if (savedRuby !== null) this.rubyMode = savedRuby === 'true' ? 'normal' : 'raw';
      }
    } catch {}

    try {
      const savedTheme = localStorage.getItem('plotailor_theme');
      if (savedTheme !== null) this.isNightTheme = savedTheme === 'night';
      const savedVertical = localStorage.getItem('plotailor_vertical');
      if (savedVertical !== null) this.isVertical = savedVertical === 'true';
    } catch {}

    try {
      const savedIndent = localStorage.getItem('plotailor_auto_indent');
      const isAutoIndent = savedIndent !== null ? savedIndent === 'true' : true;
      setAutoIndentEnabled(isAutoIndent);

      const savedRuby = localStorage.getItem('plotailor_auto_ruby');
      const isAutoRuby = savedRuby !== null ? savedRuby === 'true' : true;

      const savedLinter = localStorage.getItem('plotailor_realtime_linter');
      const isRealtimeLinter = savedLinter !== null ? savedLinter === 'true' : true;

      const savedSize = localStorage.getItem('plotailor_font_size') || '16px';
      const savedFamily = localStorage.getItem('plotailor_font_family') || 'mincho';

      this.settingsController.setState({ isAutoIndent, isAutoRuby, isRealtimeLinter, fontSize: savedSize, fontFamily: savedFamily, rubyMode: this.rubyMode });
    } catch {}
  }

  public applyFontPreferences() { this.settingsController.applyFontPreferences(); }

  private saveToStorage() {
    try {
      localStorage.setItem('plotailor_active_project_id', this.currentProjectId);
      localStorage.setItem(`plotailor_project_${this.currentProjectId}_title`, this.workTitle);
      localStorage.setItem(`plotailor_project_${this.currentProjectId}_chapters`, JSON.stringify(this.chapters));
      localStorage.setItem(`plotailor_project_${this.currentProjectId}_active_chapter`, this.currentChapterId);
      localStorage.setItem('plotailor_chapters', JSON.stringify(this.chapters));
      localStorage.setItem('plotailor_active_chapter_id', this.currentChapterId);
      localStorage.setItem('plotailor_work_title', this.workTitle);
      localStorage.setItem('plotailor_line_wrapping', this.isLineWrapping.toString());
      localStorage.setItem('plotailor_ruby_mode', this.rubyMode);
      localStorage.setItem('plotailor_ruby_decorated', (this.rubyMode === 'normal').toString());
      localStorage.setItem('plotailor_theme', this.isNightTheme ? 'night' : 'washi');
      localStorage.setItem('plotailor_vertical', this.isVertical.toString());
    } catch {}
    this.saveToVFS();
  }

  private createChapterState(content: string): EditorState {
    return EditorState.create({
      doc: content,
      extensions: [
        this.wrapCompartment.of(this.isLineWrapping ? EditorView.lineWrapping : []),
        this.rubyCompartment.of(this.rubyMode === 'raw' ? [] : rubyDecorationExtension({ mode: this.rubyMode, expandOnCursor: true })),
        history({ minDepth: 500, newGroupDelay: 500 }),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        verticalWritingExtension(),
        cm6ImeGuard(),
        multiLayerDecorationField,
        narrativeLinterExtension({
          debounceMs: 80,
          onAnalysisResult: (result) => {
            this.latestNarrativeResult = result;
            this.narrativeDock.updateResult(result);
            if (this.activeRightTab === 'linter') this.renderRightPane();
          },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            this.cadenceMachine.recordKeystroke();
            this.handleEditorChange();
            if (!update.view.composing) this.updateMultiLayerDecorations();
            this.checkShelvedCandidates();
          }
          if (update.selectionSet || update.docChanged) {
            this.updateCursorStats();
            this.updateHistoryUI();
          }
        }),
      ],
    });
  }

  private recordSnapshot(chapterId: string, text: string) { this.historyController.recordSnapshot(chapterId, text); }
  private recordSnapshotDebounced(chapterId: string, text: string) { this.historyController.recordSnapshotDebounced(chapterId, text); }

  private initCodeMirror() {
    const ch = this.chapters.find((c) => c.id === this.currentChapterId) || this.chapters[0];
    const state = this.createChapterState(ch.content);
    this.chapterStates.set(ch.id, state);
    this.recordSnapshot(ch.id, ch.content);

    this.editorBody.innerHTML = '';
    this.editorBody.classList.toggle('wrap-active', this.isLineWrapping);
    this.editorBody.classList.toggle('no-wrap', !this.isLineWrapping);

    this.cmEditor = new EditorView({ state, parent: this.editorBody });
    const titleEl = document.getElementById('activeChapterTitle');
    if (titleEl) titleEl.textContent = ch.title;
    this.updateHistoryUI();
  }

  private updateHistoryUI() { this.historyController.updateHistoryUI(); }

  private bindEvents() {
    const handleUndo = () => { if (this.cmEditor) { undo(this.cmEditor); this.updateHistoryUI(); this.cmEditor.focus(); } };
    const handleRedo = () => { if (this.cmEditor) { redo(this.cmEditor); this.updateHistoryUI(); this.cmEditor.focus(); } };

    document.getElementById('btnToolbarUndo')?.addEventListener('click', handleUndo);
    document.getElementById('btnToolbarRedo')?.addEventListener('click', handleRedo);
    document.getElementById('btnHeaderUndo')?.addEventListener('click', handleUndo);
    document.getElementById('btnHeaderRedo')?.addEventListener('click', handleRedo);

    document.getElementById('historyDepthBadge')?.addEventListener('click', () => {
      this.activeRightTab = 'history';
      const paneRight = document.getElementById('paneRight');
      if (paneRight && paneRight.style.display === 'none') paneRight.style.display = '';
      this.renderRightPane();
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => {
        if (e.altKey && (e.key === 'p' || e.key === 'P')) { e.preventDefault(); this.promoteShelvedLore(); }
      });
    }

    const canvasWrapper = document.getElementById('canvasWrapper');
    if (canvasWrapper) {
      canvasWrapper.addEventListener(
        'wheel',
        (e: WheelEvent) => { if (this.isVertical) this.scrollNormalizer.handleWheel(e, canvasWrapper); },
        { passive: false }
      );
    }

    document.getElementById('btnToggleOrientation')?.addEventListener('click', () => this.toggleOrientation());
    document.getElementById('btnToggleWrap')?.addEventListener('click', () => this.toggleWrap());
    document.getElementById('btnToggleRuby')?.addEventListener('click', () => this.toggleRuby());
    document.getElementById('btnToggleTheme')?.addEventListener('click', () => this.toggleTheme());
    document.getElementById('btnFullscreen')?.addEventListener('click', () => this.toggleFullscreen(true));
    document.getElementById('btnExitFullscreen')?.addEventListener('click', () => this.toggleFullscreen(false));

    const workTitleEl = document.getElementById('workTitleText');
    if (workTitleEl) {
      workTitleEl.addEventListener('blur', () => {
        const text = workTitleEl.textContent?.trim() || '無題の物語';
        this.workTitle = text;
        this.saveToStorage();
        this.showToast(`📝 作品名を「${text}」に更新しました`);
      });
      workTitleEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); workTitleEl.blur(); } });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.isFullscreen) this.toggleFullscreen(false);
        this.closeExportModal();
        this.closeProjectModal();
        this.closeLoreModal();
        const settingsModal = document.getElementById('settingsModal');
        if (settingsModal) settingsModal.style.display = 'none';
      }
    });

    this.initPaneResizers();
    this.initQuickFormatButtons();
    this.initHamburgerMenu();
    this.initPaneCollapseButtons();
    this.initDecorationLegend();
    this.initSettingsModal();
    this.initHelpModal();

    document.getElementById('btnExportAozora')?.addEventListener('click', () => this.openExportModal());
    document.getElementById('btnCloseExportModal')?.addEventListener('click', () => this.closeExportModal());
    document.getElementById('btnCopyAozoraFull')?.addEventListener('click', () => this.exportFullAozora('copy'));
    document.getElementById('btnDownloadAozoraTxt')?.addEventListener('click', () => this.exportFullAozora('download'));
    document.getElementById('btnOpenPrintPreview')?.addEventListener('click', () => this.exportPrintPreview());
    document.getElementById('btnDownloadLoreBible')?.addEventListener('click', () => this.exportLoreBible());
    document.getElementById('btnCopyActiveChapterAozora')?.addEventListener('click', () => this.exportActiveChapterAozora());

    const exportModal = document.getElementById('exportModal');
    exportModal?.addEventListener('click', (e) => { if (e.target === exportModal) this.closeExportModal(); });

    document.getElementById('btnToggleLeftPane')?.addEventListener('click', () => this.toggleLeftPane());
    document.getElementById('btnToggleRightPane')?.addEventListener('click', () => this.toggleRightPane());

    const chapterSelect = document.getElementById('chapterSelect') as HTMLSelectElement;
    chapterSelect?.addEventListener('change', (e) => { this.loadChapter((e.target as HTMLSelectElement).value); });

    const leftTabBtns = document.querySelectorAll('.pane-left .pane-tab-btn');
    leftTabBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLButtonElement;
        leftTabBtns.forEach((b) => b.classList.remove('active'));
        target.classList.add('active');
        this.activeLeftTab = target.dataset.tab || 'toc';
        this.renderLeftPane();
      });
    });

    const rightTabBtns = document.querySelectorAll('.pane-right .pane-tab-btn');
    rightTabBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLButtonElement;
        rightTabBtns.forEach((b) => b.classList.remove('active'));
        target.classList.add('active');
        this.activeRightTab = target.dataset.dockTab || 'linter';
        this.renderRightPane();
      });
    });

    document.getElementById('btnOpenProjectModal')?.addEventListener('click', () => this.openProjectModal());
    document.getElementById('btnCloseProjectModal')?.addEventListener('click', () => this.closeProjectModal());
    document.getElementById('btnCreateNewProject')?.addEventListener('click', () => this.createNewProjectPrompt());

    document.getElementById('btnCloseLoreModal')?.addEventListener('click', () => this.closeLoreModal());
    document.getElementById('btnCancelLoreModal')?.addEventListener('click', () => this.closeLoreModal());

    const formLore = document.getElementById('loreEntityForm') as HTMLFormElement | null;
    formLore?.addEventListener('submit', (e) => { e.preventDefault(); this.saveLoreFromForm(); });

    document.getElementById('btnDeleteLoreEntity')?.addEventListener('click', async () => {
      const idInput = document.getElementById('loreEntityId') as HTMLInputElement | null;
      if (idInput && idInput.value) {
        const confirmed = await showInlineConfirm({
          message: 'この設定項目を削除してもよろしいですか？',
          destructive: true,
          confirmText: '削除',
        });
        if (confirmed) this.deleteLore(idInput.value);
      }
    });
  }

  private handleEditorChange() {
    const rawText = this.cmEditor ? this.cmEditor.state.doc.toString() : '';
    const activeCh = this.chapters.find((c) => c.id === this.currentChapterId);
    if (activeCh) {
      activeCh.content = rawText;
      activeCh.charCount = rawText.replace(/\s+/g, '').length;
    }

    this.updateStats();
    this.recordSnapshotDebounced(this.currentChapterId, rawText);

    const saveIndicator = document.getElementById('saveStatusIndicator');
    if (saveIndicator) {
      saveIndicator.textContent = '自動保存: 編集中...';
      saveIndicator.style.color = 'var(--color-gold)';
    }

    this.walWorkerBridge.writeAsync(0, new TextEncoder().encode(rawText)).catch(() => {});

    if (this.saveDebounceTimer !== null) clearTimeout(this.saveDebounceTimer);
    this.saveDebounceTimer = setTimeout(() => {
      this.saveToStorage();
      this.reconcileShelvedLore(true);
      if (saveIndicator) {
        saveIndicator.textContent = '自動保存: 0.1秒前 (OPFS WAL Worker & AES-GCM)';
        saveIndicator.style.color = 'var(--color-text-dim)';
      }
    }, 400);
  }

  private handleCadenceState(status: CadenceStatus) {
    if (this.editorBody) this.cadenceMachine.applyToDom(this.editorBody);
    const indicator = document.getElementById('cadenceFooterIndicator');
    if (indicator) {
      switch (status.state) {
        case 'typing_burst':
          indicator.textContent = '🔥 集中執筆 (Burst <200ms)';
          indicator.style.color = '#38bdf8';
          break;
        case 'short_pause':
          indicator.textContent = '⏸ 短休止 (400-1000ms)';
          indicator.style.color = 'var(--color-warning)';
          break;
        case 'deep_pause':
          indicator.textContent = '🧠 深層推敲 (>1.5s)';
          indicator.style.color = 'var(--color-success)';
          break;
        case 'idle':
        default:
          indicator.textContent = 'ケイデンス: 待機';
          indicator.style.color = 'var(--color-text-dim)';
          break;
      }
    }
  }

  private updateMultiLayerDecorations() {
    if (!this.cmEditor) return;
    const doc = this.cmEditor.state.doc;
    const text = doc.toString();
    const entities = this.loreManager.getEntities();
    const items: MultiLayerItem[] = [];

    for (const ent of entities) {
      if (ent.status === 'shelved') continue;
      const terms = [ent.name, ...(ent.aliases || [])];
      for (const term of terms) {
        if (!term || term.length < 2) continue;
        let idx = text.indexOf(term);
        while (idx !== -1) {
          if (ent.category === 'foreshadowing') {
            items.push({ from: idx, to: idx + term.length, layer: 1, type: 'foreshadowing', label: ent.name, detail: ent.description, sourceEntityId: ent.id });
          } else {
            items.push({ from: idx, to: idx + term.length, layer: 0, type: 'physical_anchor', label: ent.name, detail: ent.description, sourceEntityId: ent.id });
          }
          idx = text.indexOf(term, idx + 1);
        }
      }
    }

    const breaches = this.povDetector.detect(
      text,
      { currentPovCharacterId: this.currentPovCharacterId, currentPovCharacterName: 'ヴァレリウス' },
      entities
    );
    for (const breach of breaches) {
      items.push({ from: breach.from, to: breach.to, layer: 2, type: 'pov_violation', label: breach.ownerCharacterName, detail: breach.message });
    }

    const decSet = buildMultiLayerDecorationSet(text.length, items);
    this.cmEditor.dispatch({ effects: setMultiLayerDecorations.of(decSet) });
  }

  private checkShelvedCandidates() { this.loreController.checkShelvedCandidates(); }
  private reconcileShelvedLore(isCommitted: boolean) { this.loreController.reconcileShelvedLore(isCommitted); }
  public promoteShelvedLore(entityId?: string) { this.loreController.promoteShelvedLore(entityId); }

  public jumpToEditor(from: number, to: number) {
    if (!this.cmEditor) return;
    const docLen = this.cmEditor.state.doc.length;
    const safeFrom = Math.max(0, Math.min(from, docLen));
    const safeTo = Math.max(safeFrom, Math.min(to, docLen));
    this.cmEditor.dispatch({ selection: { anchor: safeFrom, head: safeTo }, scrollIntoView: true });
    this.cmEditor.focus();
  }

  public insertSubjectAt(from: number, candidateText: string) {
    if (!this.cmEditor) return;
    const docLen = this.cmEditor.state.doc.length;
    const safeFrom = Math.max(0, Math.min(from, docLen));
    const insertion = `${candidateText}は、`;
    this.cmEditor.dispatch({ changes: { from: safeFrom, insert: insertion }, selection: { anchor: safeFrom + insertion.length }, scrollIntoView: true });
    this.cmEditor.focus();
    this.showToast(`✨ 主語「${candidateText}」を補完挿入しました`);
  }

  private renderChapterSelect() { this.chapterController.renderChapterSelect(); }
  private loadChapter(chapterId: string) { this.chapterController.loadChapter(chapterId); }
  public openHistoryModal() { this.historyController.openHistoryModal(); }
  public closeHistoryModal() { this.historyController.closeHistoryModal(); }
  private rollbackToSnapshot(index: number) { this.historyController.rollbackToSnapshot(index); }

  private async initProjectVFS() {
    try {
      await this.projectManager.initWorkspace();
      const projects = await this.projectManager.listProjects();

      if (projects.length === 0) {
        const migrated = await this.projectManager.migrateFromLegacyStorage();
        if (migrated) {
          this.currentProjectId = migrated.id;
        } else {
          const defaultProj = await this.projectManager.createProject({ id: 'default_work', title: this.workTitle || '星辰の境界線' });
          this.currentProjectId = defaultProj.id;
          for (let i = 0; i < this.chapters.length; i++) {
            const ch = this.chapters[i];
            await this.projectManager.saveChapter(this.currentProjectId, ch.id, ch.title, ch.content);
          }
          await this.loreManager.saveToVFS(this.currentProjectId);
        }
      } else {
        const targetProj = projects.find((p) => p.id === this.currentProjectId) || projects[0];
        if (targetProj) {
          this.currentProjectId = targetProj.id;
          const projData = await this.projectManager.getProject(targetProj.id);
          this.workTitle = projData.meta.title;
          const titleEl = document.getElementById('workTitleText');
          if (titleEl) titleEl.textContent = this.workTitle;

          if (projData.chapters.length > 0) {
            this.chapters = [];
            for (const ch of projData.chapters) {
              const loaded = await this.projectManager.loadChapter(targetProj.id, ch.id);
              this.chapters.push({ id: ch.id, title: ch.title, charCount: ch.charCount, content: loaded.content });
            }
          }
          if (projData.meta.activeChapterId && this.chapters.some((c) => c.id === projData.meta.activeChapterId)) {
            this.currentChapterId = projData.meta.activeChapterId;
          } else if (this.chapters.length > 0) {
            this.currentChapterId = this.chapters[0].id;
          }

          await this.loreManager.loadFromVFS(this.currentProjectId);
          this.loreDock.updateDictionary(this.loreManager.toLoreTermDefinitions());
        }
      }

      this.saveToStorage();
      this.renderChapterSelect();
      this.loadChapter(this.currentChapterId);
      this.renderLeftPane();
      this.renderRightPane();
      this.updateStats();
      this.updateMultiLayerDecorations();
    } catch (err) {
      console.warn('VFS init warning:', err);
    }
  }

  private async saveToVFS() {
    try {
      try { await this.projectManager.getProject(this.currentProjectId); }
      catch { await this.projectManager.createProject({ id: this.currentProjectId, title: this.workTitle }); }

      for (const ch of this.chapters) {
        await this.projectManager.saveChapter(this.currentProjectId, ch.id, ch.title, ch.content);
      }
      await this.projectManager.updateProjectMeta(this.currentProjectId, { title: this.workTitle, activeChapterId: this.currentChapterId });
      await this.loreManager.saveToVFS(this.currentProjectId);
    } catch (err) {
      console.warn('VFS auto-save warning:', err);
    }
  }

  public async openProjectModal() {
    const modal = document.getElementById('projectModal');
    if (!modal) return;
    await this.renderProjectList();
    modal.style.display = 'flex';
  }

  public closeProjectModal() {
    const modal = document.getElementById('projectModal');
    if (modal) modal.style.display = 'none';
  }

  private async renderProjectList() {
    const container = document.getElementById('projectListContainer');
    if (!container) return;

    try {
      const projects = await this.projectManager.listProjects();
      if (projects.length === 0) {
        container.innerHTML = '<div style="font-size: 13px; color: var(--color-text-dim); text-align: center; padding: 24px;">まだ保存された作品がありません。</div>';
        return;
      }

      container.innerHTML = projects.map((p) => {
        const isCurrent = p.id === this.currentProjectId;
        const dateStr = new Date(p.updatedAt).toLocaleDateString() + ' ' + new Date(p.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `
          <div class="history-item ${isCurrent ? 'active' : ''}" data-project-id="${p.id}" style="${isCurrent ? 'border-color: var(--color-gold); background: rgba(184, 134, 11, 0.08);' : ''}">
            <div class="history-item-info">
              <div class="history-item-time" style="font-weight: 600; color: var(--color-text);">${p.title} ${isCurrent ? '<span style="color: var(--color-gold); font-size: 11px; margin-left: 6px;">[執筆中]</span>' : ''}</div>
              <div class="history-item-preview" style="font-size: 11px;">総文字数: ${p.totalCharCount.toLocaleString()} 字 | 更新: ${dateStr}</div>
            </div>
            <div style="display: flex; gap: 6px; align-items: center;">
              ${!isCurrent ? `<button class="ide-btn btn-switch-proj" data-id="${p.id}" style="font-size: 11px; padding: 2px 8px;">開く</button>` : ''}
            </div>
          </div>
        `;
      }).join('');

      container.querySelectorAll('.btn-switch-proj').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = (e.currentTarget as HTMLElement).dataset.id;
          if (id) { await this.switchProject(id); this.closeProjectModal(); }
        });
      });
    } catch (err) {
      container.innerHTML = `<div style="color: var(--color-danger); padding: 12px;">作品一覧の読込に失敗しました: ${err}</div>`;
    }
  }

  private async createNewProjectPrompt() {
    const title = await showInlinePrompt({
      message: '新規作品のタイトルを入力してください:',
      defaultValue: `長編小説_${new Date().toISOString().slice(0, 10)}`,
      placeholder: '作品タイトル',
    });
    if (!title || !title.trim()) return;

    try {
      await this.saveToVFS();
      const newProj = await this.projectManager.createProject({ title: title.trim() });
      await this.projectManager.saveChapter(newProj.id, 'ch1', '第一章 幕開け', '　ここに新しい物語の最初の一行を書き始めます。');

      this.loreManager.setEntities([]);
      await this.loreManager.saveToVFS(newProj.id);

      await this.switchProject(newProj.id);
      this.closeProjectModal();
      this.showToast(`✨ 新規作品「${newProj.title}」を作成し、執筆を開始しました`);
    } catch (err) {
      await showInlineAlert({ message: `作品の作成に失敗しました: ${err}` });
    }
  }

  private async switchProject(projectId: string) {
    try {
      await this.saveToVFS();

      const data = await this.projectManager.getProject(projectId);
      this.currentProjectId = projectId;
      this.workTitle = data.meta.title;

      const titleEl = document.getElementById('workTitleText');
      if (titleEl) titleEl.textContent = this.workTitle;

      if (data.chapters.length > 0) {
        this.chapters = [];
        for (const ch of data.chapters) {
          const loaded = await this.projectManager.loadChapter(projectId, ch.id);
          this.chapters.push({ id: ch.id, title: ch.title, charCount: ch.charCount, content: loaded.content });
        }
      } else {
        this.chapters = [
          { id: 'ch1', title: '第一章 幕開け', charCount: 22, content: '　ここに新しい物語の最初の一行を書き始めます。' },
        ];
      }

      this.currentChapterId = data.meta.activeChapterId && this.chapters.some((c) => c.id === data.meta.activeChapterId)
        ? data.meta.activeChapterId
        : this.chapters[0].id;

      await this.loreManager.loadFromVFS(projectId);
      this.loreDock.updateDictionary(this.loreManager.toLoreTermDefinitions());

      this.chapterStates.clear();
      this.chapterSnapshots.clear();

      this.saveToStorage();
      this.renderChapterSelect();
      this.loadChapter(this.currentChapterId);
      this.renderLeftPane();
      this.renderRightPane();
      this.updateStats();
      this.updateMultiLayerDecorations();
      this.showToast(`📚 作品「${this.workTitle}」を開きました`);
    } catch (err) {
      console.error('Failed to switch project:', err);
      this.showToast(`❌ 作品切り替えエラー: ${err}`);
    }
  }

  private addNewChapter() { this.chapterController.addNewChapter(); }
  public async deleteChapter(chapterId: string) { await this.chapterController.deleteChapter(chapterId); }
  public renameChapter(chapterId: string, newTitle: string) { this.chapterController.renameChapter(chapterId, newTitle); }
  public async reorderChapters(fromIndex: number, toIndex: number) { await this.chapterController.reorderChapters(fromIndex, toIndex); }

  private updateStats() {
    const rawText = this.cmEditor ? this.cmEditor.state.doc.toString() : '';
    const charCount = rawText.replace(/\s+/g, '').length;
    const genkoSheets = (charCount / 400).toFixed(1);

    const headerChar = document.getElementById('charCountHeader');
    if (headerChar) headerChar.textContent = `${charCount.toLocaleString()} 文字（原稿用紙 ${genkoSheets} 枚）`;

    const footerChar = document.getElementById('charCountFooter');
    if (footerChar) footerChar.innerHTML = `<strong>${charCount.toLocaleString()}</strong> 文字（原稿用紙 <strong>${genkoSheets}</strong> 枚）`;

    const activeCh = this.chapters.find((c) => c.id === this.currentChapterId);
    if (activeCh) {
      activeCh.charCount = charCount;
      const countEl = document.querySelector(`.chapter-item[data-id="${this.currentChapterId}"] .chapter-char-count`);
      if (countEl) countEl.textContent = `${charCount.toLocaleString()} 字`;
    }
  }

  private updateCursorStats() {
    if (!this.cmEditor) return;
    const mainSel = this.cmEditor.state.selection.main;
    const head = mainSel.head;
    const lineObj = this.cmEditor.state.doc.lineAt(head);
    const line = lineObj.number;
    const col = head - lineObj.from + 1;

    const lineEl = document.getElementById('cursorLine');
    if (lineEl) lineEl.textContent = line.toString();
    const colEl = document.getElementById('cursorCol');
    if (colEl) colEl.textContent = col.toString();

    const selLengthEl = document.getElementById('selectionLength');
    if (selLengthEl) selLengthEl.textContent = Math.abs(mainSel.to - mainSel.from).toString();

    this.keystrokeCount++;
    const elapsedMinutes = Math.max(0.1, (Date.now() - this.typingStartTime) / 60000);
    const speed = Math.round(this.keystrokeCount / elapsedMinutes);
    const speedEl = document.getElementById('typingSpeed');
    if (speedEl) speedEl.textContent = speed.toString();
  }

  private applyOrientation() {
    const center = document.getElementById('paneCenter');
    const btn = document.getElementById('btnToggleOrientation');
    const wrapper = document.getElementById('canvasWrapper');

    if (this.isVertical) {
      center?.classList.add('vertical-rl');
      this.editorBody.classList.add('vertical-rl');
      if (btn) btn.textContent = '横書き';
      if (this.cmEditor) {
        this.cmEditor.dom.classList.add('cm-vertical-rl');
        this.cmEditor.requestMeasure();
      }
      if (wrapper) requestAnimationFrame(() => { wrapper.scrollLeft = wrapper.scrollWidth; });
    } else {
      center?.classList.remove('vertical-rl');
      this.editorBody.classList.remove('vertical-rl');
      if (btn) btn.textContent = '縦書き';
      if (this.cmEditor) {
        this.cmEditor.dom.classList.remove('cm-vertical-rl');
        this.cmEditor.requestMeasure();
      }
      if (wrapper) requestAnimationFrame(() => { wrapper.scrollLeft = 0; });
    }
  }

  private toggleOrientation() {
    this.isVertical = !this.isVertical;
    this.applyOrientation();
    this.saveToStorage();
    this.showToast(`執筆方向を「${this.isVertical ? '縦書き' : '横書き'}」に切り替えました`);
  }

  private toggleWrap() {
    this.isLineWrapping = !this.isLineWrapping;
    if (this.cmEditor) {
      this.cmEditor.dispatch({ effects: this.wrapCompartment.reconfigure(this.isLineWrapping ? EditorView.lineWrapping : []) });
    }

    this.editorBody.classList.toggle('wrap-active', this.isLineWrapping);
    this.editorBody.classList.toggle('no-wrap', !this.isLineWrapping);

    const btn = document.getElementById('btnToggleWrap');
    if (btn) btn.textContent = `折り返し: ${this.isLineWrapping ? 'ON' : 'OFF'}`;

    this.saveToStorage();
    this.showToast(`📐 文字折り返しを「${this.isLineWrapping ? 'ON' : 'OFF'}」に設定しました`);
  }

  private getRubyButtonLabel(): string {
    switch (this.rubyMode) {
      case 'normal': return 'ルビ: 通常';
      case 'raw': return 'ルビ: 記法直接';
      case 'off': return 'ルビ: OFF';
    }
  }

  private toggleRuby() {
    if (this.rubyMode === 'normal') this.rubyMode = 'raw';
    else if (this.rubyMode === 'raw') this.rubyMode = 'off';
    else this.rubyMode = 'normal';

    if (this.cmEditor) {
      this.cmEditor.dispatch({
        effects: [
          this.rubyCompartment.reconfigure(
            this.rubyMode === 'raw' ? [] : rubyDecorationExtension({ mode: this.rubyMode, expandOnCursor: true })
          ),
          setRubyDisplayMode.of(this.rubyMode),
        ],
      });
      this.cmEditor.requestMeasure();
    }

    const btn = document.getElementById('btnToggleRuby');
    if (btn) btn.textContent = this.getRubyButtonLabel();

    this.saveToStorage();
    const desc = this.rubyMode === 'normal' ? '通常ルビ (リッチ表示)' : this.rubyMode === 'raw' ? '青空文庫ルビ表記 (直接入力)' : 'ルビOFF (隠蔽モード・親文字のみ)';
    this.showToast(`📖 ルビ表示を「${desc}」に設定しました`);
  }

  private toggleTheme() {
    this.isNightTheme = !this.isNightTheme;
    this.applyTheme();
    this.saveToStorage();
  }

  private applyTheme() {
    const center = document.getElementById('paneCenter');
    const btn = document.getElementById('btnToggleTheme');
    const container = document.querySelector('.app-container');

    if (this.isNightTheme) {
      if (typeof document !== 'undefined') {
        document.body.classList.remove('theme-washi');
        document.body.classList.add('theme-night');
      }
      container?.classList.remove('theme-washi');
      container?.classList.add('theme-night');
      center?.classList.add('theme-night');
      if (btn) btn.textContent = '📜 和紙色';
    } else {
      if (typeof document !== 'undefined') {
        document.body.classList.remove('theme-night');
        document.body.classList.add('theme-washi');
      }
      container?.classList.remove('theme-night');
      container?.classList.add('theme-washi');
      center?.classList.remove('theme-night');
      if (btn) btn.textContent = '🌙 夜間色';
    }

    const btnWrap = document.getElementById('btnToggleWrap');
    if (btnWrap) btnWrap.textContent = `折り返し: ${this.isLineWrapping ? 'ON' : 'OFF'}`;
  }

  private toggleFullscreen(enable: boolean) {
    this.isFullscreen = enable;
    if (typeof document === 'undefined') return;
    if (enable) {
      document.body.classList.add('fullscreen-active');
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } else {
      document.body.classList.remove('fullscreen-active');
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }

  private toggleLeftPane() { this.paneController.toggleLeftPane(); }
  private toggleRightPane() { this.paneController.toggleRightPane(); }
  private initHamburgerMenu(): void { this.paneController.initHamburgerMenu(); }
  public openSettingsModal(): void { this.settingsController.openSettingsModal(); }
  private initSettingsModal(): void { this.settingsController.initSettingsModal(); }

  private initHelpModal(): void {
    document.getElementById('btnHeaderHelp')?.addEventListener('click', () => {
      this.activeRightTab = 'help';
      if (!this.rightPaneOpen) this.toggleRightPane();
      this.renderRightPane();
    });
  }

  private exportPoPCertificate(): void { this.exportController.exportPoPCertificate(); }
  private initPaneCollapseButtons(): void { this.paneController.initPaneCollapseButtons(); }

  private initDecorationLegend(): void {
    const btnLegend = document.getElementById('btnToggleLegendCard');
    const panel = document.getElementById('decorationLegendPanel');
    if (!btnLegend || !panel) return;

    btnLegend.addEventListener('click', () => {
      const isHidden = panel.style.display === 'none';
      panel.style.display = isHidden ? 'block' : 'none';
      btnLegend.textContent = isHidden ? '凡例 ▴' : '凡例 ▾';
    });
  }

  public openExportModal() { this.exportController.openExportModal(); }
  public closeExportModal() { this.exportController.closeExportModal(); }
  private copyTextToClipboard(text: string, successMsg: string) { this.exportController.copyTextToClipboard(text, successMsg); }
  private fallbackCopy(text: string, successMsg = '✅ クリップボードにコピーしました') { this.exportController.fallbackCopy(text, successMsg); }
  private exportFullAozora(action: 'copy' | 'download') { this.exportController.exportFullAozora(action); }
  private exportPrintPreview() { this.exportController.exportPrintPreview(); }
  private exportLoreBible() { this.exportController.exportLoreBible(); }
  private exportActiveChapterAozora() { this.exportController.exportActiveChapterAozora(); }

  private toastTimer: any = null;
  private showToast(msg: string) {
    const footerToast = document.getElementById('footerToastArea');
    if (footerToast) {
      footerToast.textContent = msg;
      footerToast.classList.add('toast-visible');
      if (this.toastTimer) clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => {
        footerToast.classList.remove('toast-visible');
        this.toastTimer = setTimeout(() => {
          if (!footerToast.classList.contains('toast-visible')) footerToast.textContent = '';
        }, 300);
      }, 3000);
    }
  }

  private renderLeftPane() { this.loreController.renderLeftPane(); }
  private renderRightPane() { this.loreController.renderRightPane(); }
  public openLoreModal(entityId?: string) { this.loreController.openLoreModal(entityId); }
  public closeLoreModal() { this.loreController.closeLoreModal(); }
  public async saveLoreFromForm() { await this.loreController.saveLoreFromForm(); }
  public async deleteLore(id: string) { await this.loreController.deleteLore(id); }
  public async saveLoreData() { await this.loreController.saveLoreData(); }
  public getEditorView(): EditorView { return this.cmEditor; }
  public getNarrativeDock(): NarrativeInspectorDock { return this.narrativeDock; }
  private initPaneResizers(): void { this.paneController.initPaneResizers(); }

  private initQuickFormatButtons(): void {
    document.getElementById('btnQuickRuby')?.addEventListener('click', () => {
      if (this.cmEditor) { wrapSelectionWithRuby(this.cmEditor); this.cmEditor.focus(); }
    });
    document.getElementById('btnQuickBouten')?.addEventListener('click', () => {
      if (this.cmEditor) {
        const state = this.cmEditor.state;
        const sel = state.selection.main;
        const selectedText = state.sliceDoc(sel.from, sel.to) || '';
        if (selectedText) {
          this.cmEditor.dispatch({
            changes: { from: sel.from, to: sel.to, insert: `《《${selectedText}》》` },
            selection: { anchor: sel.from + selectedText.length + 4 },
          });
        } else {
          this.cmEditor.dispatch({
            changes: { from: sel.from, to: sel.to, insert: `《《》》` },
            selection: { anchor: sel.from + 2 },
          });
        }
        this.cmEditor.focus();
      }
    });
    document.getElementById('btnQuickBold')?.addEventListener('click', () => {
      if (this.cmEditor) {
        const state = this.cmEditor.state;
        const sel = state.selection.main;
        const selectedText = state.sliceDoc(sel.from, sel.to) || '';
        this.cmEditor.dispatch({
          changes: { from: sel.from, to: sel.to, insert: `**${selectedText}**` },
          selection: { anchor: sel.from + (selectedText ? selectedText.length + 4 : 2) },
        });
        this.cmEditor.focus();
      }
    });
    document.getElementById('btnQuickIndent')?.addEventListener('click', () => {
      if (this.cmEditor) {
        this.cmEditor.dispatch(this.cmEditor.state.replaceSelection('　'));
        this.cmEditor.focus();
      }
    });
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const initApp = () => {
    if (document.getElementById('editorBody') || document.getElementById('editor-body')) {
      (window as any).plotailorApp = new PlotailorApp();
    }
  };

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
}
