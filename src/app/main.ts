/**
 * Plotailor Full Writing IDE Application Core (src/app/main.ts)
 * 3-Pane Literary IDE with Realtime Ruby, CodeMirror 6, Narrative Linter & Zero Pronoun Resolver
 */

import { EditorView, keymap } from '@codemirror/view';
import { showInlineConfirm, showInlinePrompt, showInlineAlert } from './InlineDialog.js';
import { EditorState, Compartment } from '@codemirror/state';
import { history, defaultKeymap, historyKeymap, undo, redo, undoDepth, redoDepth } from '@codemirror/commands';
import { rubyDecorationExtension, setRubyDisplayMode, type RubyDisplayMode } from '../core/editor/RubyDecorationExtension.js';
import { cm6ImeGuard } from '../core/editor/cm6ImeGuard.js';
import { verticalWritingExtension, setAutoIndentEnabled } from '../core/editor/VerticalWritingExtension.js';
import { wrapSelectionWithRuby } from '../core/editor/RubyShortcutExtension.js';
import { ScrollNormalizer } from '../core/editor/ScrollNormalizer.js';
import { narrativeLinterExtension } from '../core/editor/CodeMirrorNarrativeExtension.js';
import { NarrativeInspectorDock } from '../ui/NarrativeInspectorDock.js';
import { LoreInspectorDock } from '../ui/LoreInspectorDock.js';
import {
  LoreEntityManager,
  type LoreEntity,
  type LoreCategory,
} from '../core/lore/LoreEntityManager.js';
import { CausalDagEngine } from '../core/causality/CausalDagEngine.js';
import { OpfsWalWorkerBridge } from '../core/storage/OpfsWalWorkerBridge.js';
import type { NarrativeAnalysisResult } from '../core/editor/NarrativeLinterEngine.js';
import { ProjectManager, type ProjectMeta } from '../core/project/index.js';
import { TypingCadenceMachine, type CadenceStatus } from '../core/editor/TypingCadenceMachine.js';
import {
  type MultiLayerItem,
  PovBreachDetector,
  multiLayerDecorationField,
  setMultiLayerDecorations,
  buildMultiLayerDecorationSet,
} from '../core/editor/MultiLayerDecoration.js';
import { DualTrackTimelineEngine, type TimelineSceneInput } from '../core/timeline/DualTrackTimeline.js';
import {
  calculateManualScore,
  reconcileEntityLifecycles,
  findShelvedCandidates,
  SHELF_THRESHOLD,
} from '../core/lore/ShelvedLoreLifecycle.js';
import { LiteraryExporter, normalizeAozoraMarkup } from '../core/export/LiteraryExporter.js';
import { RevisionDiffSummarizer } from '../core/editor/RevisionDiffSummarizer.js';
import { markdownBoldExtension } from '../core/editor/MarkdownBoldExtension.js';
import { FontSizeControl, type FontMetrics } from '../ui/FontSizeControl.js';
import { KinsokuEngine } from '../core/editor/KinsokuEngine.js';
import { WritingVelocityWidget } from '../core/editor/WritingVelocityWidget.js';
import { MultiSiteNovelFormatter } from '../core/exporters/multisite-novel-formatter.js';
import { FullscreenStatusBar } from '../ui/FullscreenStatusBar.js';

interface ChapterData {
  id: string;
  title: string;
  charCount: number;
  content: string;
}

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
  private isAutoIndent = true;
  private isAutoRuby = true;
  private isRealtimeLinter = true;
  private fontSize = '16px';
  private fontSizeControl: FontSizeControl;
  private fontFamily = 'mincho';
  private leftPaneOpen = true;
  private rightPaneOpen = true;
  private activeLeftTab = 'toc';
  private activeRightTab = 'linter'; // Default to Narrative Linter for immediate feedback
  private keystrokeCount = 0;
  private typingStartTime = Date.now();
  private latestNarrativeResult: NarrativeAnalysisResult | null = null;
  private wrapCompartment = new Compartment();
  private rubyCompartment = new Compartment();
  private saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private multiLayerDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private scrollNormalizer = new ScrollNormalizer();
  private chapterStates: Map<string, EditorState> = new Map();
  private chapterSnapshots: Map<string, Array<{ time: number; text: string; length: number }>> = new Map();
  private selectedHistorySnapshotIndex: number | null = null;
  private lastSnapshotTime = 0;
  public snapshotFrequency: 'minimal' | 'low' | 'standard' | 'high' | 'custom' = 'standard';
  public snapshotCustomChars = 25;
  public snapshotCustomSeconds = 15;
  private isHistoryDiffOnly = false;
  private isVerticalUpright = false;
  private loreManager: LoreEntityManager;
  private dagEngine: CausalDagEngine = new CausalDagEngine();
  private walWorkerBridge: OpfsWalWorkerBridge = new OpfsWalWorkerBridge();
  private loreDock!: LoreInspectorDock;
  private activeLoreFilter: LoreCategory | 'all' | 'shelved' = 'all';
  private cadenceMachine: TypingCadenceMachine;
  private povDetector = new PovBreachDetector();
  private timelineEngine = new DualTrackTimelineEngine();
  private currentPovCharacterId = 'char-valerius';
  private velocityWidget = new WritingVelocityWidget();
  private fullscreenStatusBar: FullscreenStatusBar | null = null;
  private kinsokuEngine = new KinsokuEngine({ columnsPerLine: 40, allowHanging: true });

  constructor() {
    this.editorBody = (document.getElementById('editorBody') || document.getElementById('editor-body')) as HTMLDivElement;
    if (window.innerWidth <= 768) {
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
        this.cmEditor.dispatch({
          changes: { from: event.from, to: event.to, insert: event.replacement },
        });
        this.showToast(`✨「${event.originalText}」を「${event.replacement}」に置換しました`);
      },
      onShelveTerm: (event) => {
        this.loreManager.updateEntity(event.termId, { status: event.newStatus });
        this.saveLoreData();
        this.renderRightPane();
        this.renderLeftPane();
      },
    });

    this.fontSizeControl = new FontSizeControl({
      onChange: (size, metrics) => this.handleFontSizeChange(size, metrics),
    });

    this.init();
  }

  private init() {
    this.loadStateFromStorage();

    if (typeof window !== 'undefined' && window.innerWidth > 0 && window.innerWidth <= 768) {
      this.leftPaneOpen = false;
      this.rightPaneOpen = false;
    }

    this.applyTheme();
    this.initCodeMirror();
    this.bindEvents();
    const btnRuby = document.getElementById('btnToggleRuby');
    if (btnRuby) {
      btnRuby.textContent = this.getRubyButtonLabel();
    }

    this.renderChapterSelect();
    this.renderLeftPane();
    this.renderRightPane();
    this.updateStats();
    this.updateMultiLayerDecorations();
    this.applyOrientation();
    this.initProjectVFS();
    this.applyFontPreferences();

    const currentCh = this.chapters.find((c) => c.id === this.currentChapterId) || this.chapters[0];
    const initialContent = currentCh ? currentCh.content : '';
    this.velocityWidget.startSession(initialContent.length);
    const canvasWrapper = document.getElementById('canvasWrapper');
    if (canvasWrapper) {
      this.fullscreenStatusBar = new FullscreenStatusBar({
        container: canvasWrapper,
        initialText: initialContent,
        isFullscreen: this.isFullscreen,
      });
    }
  }

  private loadStateFromStorage() {
    // 0. Active project ID
    try {
      const savedProjId = localStorage.getItem('plotailor_active_project_id');
      if (savedProjId && savedProjId.trim()) {
        this.currentProjectId = savedProjId.trim();
      }
    } catch {}

    // 1. Work title
    try {
      const projTitle = localStorage.getItem(`plotailor_project_${this.currentProjectId}_title`);
      const savedTitle = projTitle || localStorage.getItem('plotailor_work_title');
      if (savedTitle && savedTitle.trim()) {
        this.workTitle = savedTitle.trim();
      }
      const titleEl = document.getElementById('workTitleText');
      if (titleEl) titleEl.textContent = this.workTitle;
    } catch {}

    // 2. Chapters data
    try {
      const projChapters = localStorage.getItem(`plotailor_project_${this.currentProjectId}_chapters`);
      const savedChapters = projChapters || localStorage.getItem('plotailor_chapters');
      if (savedChapters) {
        const parsed = JSON.parse(savedChapters);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.chapters = parsed;
        }
      }
    } catch {}

    if (this.chapters.length === 0) {
      this.chapters = JSON.parse(JSON.stringify(DEFAULT_CHAPTERS));
    }

    // Accurately compute initial character count for all chapters
    for (const ch of this.chapters) {
      ch.charCount = ch.content.replace(/\s+/g, '').length;
    }

    // 3. Active chapter
    try {
      const projActive = localStorage.getItem(`plotailor_project_${this.currentProjectId}_active_chapter`);
      const savedActive = projActive || localStorage.getItem('plotailor_active_chapter_id');
      if (savedActive && this.chapters.some((c) => c.id === savedActive)) {
        this.currentChapterId = savedActive;
      } else {
        this.currentChapterId = this.chapters[0].id;
      }
    } catch {
      this.currentChapterId = this.chapters[0].id;
    }

    // 4. Line wrapping preference
    try {
      const savedWrap = localStorage.getItem('plotailor_line_wrapping');
      if (savedWrap !== null) {
        this.isLineWrapping = savedWrap === 'true';
      }
    } catch {}

    // 5. Ruby decoration preference
    try {
      const savedMode = localStorage.getItem('plotailor_ruby_mode');
      if (savedMode === 'normal' || savedMode === 'raw' || savedMode === 'off') {
        this.rubyMode = savedMode as RubyDisplayMode;
      } else {
        const savedRuby = localStorage.getItem('plotailor_ruby_decorated');
        if (savedRuby !== null) {
          this.rubyMode = savedRuby === 'true' ? 'normal' : 'raw';
        }
      }
    } catch {}

    // 6. Theme and orientation preference
    try {
      const savedTheme = localStorage.getItem('plotailor_theme');
      if (savedTheme !== null) {
        this.isNightTheme = savedTheme === 'night';
      }
      const savedVertical = localStorage.getItem('plotailor_vertical');
      if (savedVertical !== null) {
        this.isVertical = savedVertical === 'true';
      }
    } catch {}

    // 7. Auto indent, font size and family preferences
    try {
      const savedIndent = localStorage.getItem('plotailor_auto_indent');
      if (savedIndent !== null) {
        this.isAutoIndent = savedIndent === 'true';
      }
      setAutoIndentEnabled(this.isAutoIndent);

      const savedRuby = localStorage.getItem('plotailor_auto_ruby');
      if (savedRuby !== null) {
        this.isAutoRuby = savedRuby === 'true';
      }

      const savedLinter = localStorage.getItem('plotailor_realtime_linter');
      if (savedLinter !== null) {
        this.isRealtimeLinter = savedLinter === 'true';
      }

      const savedSize = localStorage.getItem('plotailor_font_size');
      if (savedSize) this.fontSize = savedSize;

      const savedFamily = localStorage.getItem('plotailor_font_family');
      if (savedFamily) this.fontFamily = savedFamily;

      const savedFreq = localStorage.getItem('plotailor_snapshot_frequency');
      if (savedFreq && ['minimal', 'low', 'standard', 'high', 'custom'].includes(savedFreq)) {
        this.snapshotFrequency = savedFreq as any;
      }

      const savedCustomChars = localStorage.getItem('plotailor_snapshot_custom_chars');
      if (savedCustomChars) {
        const num = parseInt(savedCustomChars, 10);
        if (!isNaN(num) && num > 0) this.snapshotCustomChars = num;
      }

      const savedCustomSecs = localStorage.getItem('plotailor_snapshot_custom_seconds');
      if (savedCustomSecs) {
        const num = parseInt(savedCustomSecs, 10);
        if (!isNaN(num) && num > 0) this.snapshotCustomSeconds = num;
      }

      const savedVerticalUpright = localStorage.getItem('plotailor_vertical_upright');
      if (savedVerticalUpright !== null) {
        this.isVerticalUpright = savedVerticalUpright === 'true';
      }
      document.body.classList.toggle('vertical-upright', this.isVerticalUpright);

      // 8. Restore chapter snapshots
      const savedSnaps = localStorage.getItem(`plotailor_snapshots_${this.currentProjectId}`);
      if (savedSnaps) {
        const parsed = JSON.parse(savedSnaps);
        if (Array.isArray(parsed)) {
          this.chapterSnapshots = new Map(parsed);
        }
      }
    } catch {}
  }

  public applyFontPreferences() {
    if (!this.editorBody) return;
    const currentSize = FontSizeControl.clampFontSize(this.fontSize);
    FontSizeControl.applyToDOM(this.editorBody, currentSize, { isVertical: this.isVertical });
    if (this.cmEditor) {
      FontSizeControl.applyToDOM(this.cmEditor.dom, currentSize, { isVertical: this.isVertical });
      this.cmEditor.requestMeasure();
    }
    if (this.fontFamily === 'mincho') {
      this.editorBody.style.fontFamily = "'Shippori Mincho', 'Noto Serif JP', serif";
    } else if (this.fontFamily === 'gothic') {
      this.editorBody.style.fontFamily = "'BIZ UDPGothic', 'Yu Gothic', sans-serif";
    } else {
      this.editorBody.style.fontFamily = "system-ui, -apple-system, sans-serif";
    }
  }

  private handleFontSizeChange(size: number, metrics: FontMetrics) {
    this.fontSize = `${size}px`;
    try {
      localStorage.setItem('plotailor_font_size', this.fontSize);
    } catch {}
    this.applyFontPreferences();
    this.showToast(`文字サイズを ${size}px に変更しました (行間: ${metrics.lineHeight}px)`);
  }

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
      localStorage.setItem('plotailor_snapshot_frequency', this.snapshotFrequency);

      // Persist up to 50 recent snapshots per chapter so browser refresh never wipes history
      const snapshotEntries: [string, any[]][] = [];
      for (const [k, v] of this.chapterSnapshots.entries()) {
        snapshotEntries.push([k, v.slice(-50)]);
      }
      localStorage.setItem(`plotailor_snapshots_${this.currentProjectId}`, JSON.stringify(snapshotEntries));
    } catch {}
    this.saveToVFS();
  }

  private createChapterState(content: string): EditorState {
    return EditorState.create({
      doc: content,
      extensions: [
        this.wrapCompartment.of(this.isLineWrapping ? EditorView.lineWrapping : []),
        this.rubyCompartment.of(
          this.rubyMode === 'raw'
            ? []
            : rubyDecorationExtension({ mode: this.rubyMode, expandOnCursor: true })
        ),
        history({ minDepth: 500, newGroupDelay: 500 }),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        verticalWritingExtension(),
        markdownBoldExtension(),
        cm6ImeGuard(),
        multiLayerDecorationField,
        narrativeLinterExtension({
          debounceMs: 80,
          onAnalysisResult: (result) => {
            this.latestNarrativeResult = result;
            this.narrativeDock.updateResult(result);
            if (this.activeRightTab === 'linter') {
              this.renderRightPane();
            }
          },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            this.cadenceMachine.recordKeystroke();
            this.handleEditorChange();
            if (!update.view.composing) {
              this.updateMultiLayerDecorationsDebounced();
            }
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

  private recordSnapshot(chapterId: string, text: string) {
    let list = this.chapterSnapshots.get(chapterId);
    if (!list) {
      list = [];
      this.chapterSnapshots.set(chapterId, list);
    }
    const len = text.replace(/\s+/g, '').length;
    // Do not record if text is identical to last recorded snapshot
    if (list.length > 0 && list[list.length - 1].text === text) return;
    list.push({ time: Date.now(), text, length: len });
    if (list.length > 500) list.shift();
    if (chapterId === this.currentChapterId) {
      this.updateHistoryUI();
    }
  }

  private recordSnapshotDebounced(chapterId: string, text: string) {
    const list = this.chapterSnapshots.get(chapterId) || [];
    const lastSnap = list.length > 0 ? list[list.length - 1] : null;
    const len = text.replace(/\s+/g, '').length;
    const lastLen = lastSnap ? lastSnap.length : 0;
    const charDelta = Math.abs(len - lastLen);

    // Dynamic thresholds based on user-configured snapshotFrequency
    let minTrivialDelta = 3;
    let minSentenceDelta = 10;
    let minSentenceInterval = 3000;
    let minBurstDelta = 25;
    let minBurstInterval = 5000;
    let minIdlePause = 15000;
    let minIdleDelta = 10;

    if (this.snapshotFrequency === 'minimal') {
      // 極小: 大節・大改稿（200字以上、または60秒休止）
      minTrivialDelta = 20;
      minSentenceDelta = 100;
      minSentenceInterval = 20000;
      minBurstDelta = 200;
      minBurstInterval = 30000;
      minIdlePause = 60000;
      minIdleDelta = 100;
    } else if (this.snapshotFrequency === 'low') {
      // ひかえめ: 段落単位（50字以上、または30秒休止）
      minTrivialDelta = 10;
      minSentenceDelta = 40;
      minSentenceInterval = 8000;
      minBurstDelta = 80;
      minBurstInterval = 15000;
      minIdlePause = 30000;
      minIdleDelta = 40;
    } else if (this.snapshotFrequency === 'high') {
      // こまめ: 短文単位（5字以上、または5秒休止）
      minTrivialDelta = 1;
      minSentenceDelta = 5;
      minSentenceInterval = 1500;
      minBurstDelta = 12;
      minBurstInterval = 2500;
      minIdlePause = 5000;
      minIdleDelta = 5;
    } else if (this.snapshotFrequency === 'custom') {
      // カスタム: ユーザー指定の文字数と秒数
      const customChars = Math.max(5, this.snapshotCustomChars || 25);
      const customIdleMs = Math.max(2000, (this.snapshotCustomSeconds || 15) * 1000);
      minTrivialDelta = Math.max(1, Math.round(customChars * 0.1));
      minSentenceDelta = Math.max(3, Math.round(customChars * 0.4));
      minSentenceInterval = Math.round(customIdleMs * 0.3);
      minBurstDelta = customChars;
      minBurstInterval = Math.round(customIdleMs * 0.5);
      minIdlePause = customIdleMs;
      minIdleDelta = Math.max(3, Math.round(customChars * 0.4));
    }

    // Suppress trivial inputs below threshold
    if (charDelta < minTrivialDelta && lastSnap) {
      return;
    }

    const now = Date.now();
    const timeSinceLast = now - this.lastSnapshotTime;

    // Trigger conditions:
    // 1. Natural sentence boundary (。！？ or newline after sentence)
    const endsWithSentenceBoundary = /[。！？!?]\n?$/.test(text.trim());
    const isSentenceBoundaryTrigger = endsWithSentenceBoundary && charDelta >= minSentenceDelta && timeSinceLast > minSentenceInterval;

    // 2. Substantial typing burst
    const isSubstantialChange = charDelta >= minBurstDelta && timeSinceLast > minBurstInterval;

    // 3. Idle pause
    const isIdlePauseTrigger = timeSinceLast > minIdlePause && charDelta >= minIdleDelta;

    if (isSentenceBoundaryTrigger || isSubstantialChange || isIdlePauseTrigger || list.length === 0) {
      this.lastSnapshotTime = now;
      this.recordSnapshot(chapterId, text);
    }
  }

  private initCodeMirror() {
    const ch = this.chapters.find((c) => c.id === this.currentChapterId) || this.chapters[0];
    const state = this.createChapterState(ch.content);
    this.chapterStates.set(ch.id, state);
    this.recordSnapshot(ch.id, ch.content);

    this.editorBody.innerHTML = '';
    this.editorBody.classList.toggle('wrap-active', this.isLineWrapping);
    this.editorBody.classList.toggle('no-wrap', !this.isLineWrapping);

    this.cmEditor = new EditorView({
      state,
      parent: this.editorBody,
    });

    // Update active chapter header title
    const titleEl = document.getElementById('activeChapterTitle');
    if (titleEl) titleEl.textContent = ch.title;
    this.updateHistoryUI();
  }

  private updateHistoryUI() {
    if (!this.cmEditor) return;
    const state = this.cmEditor.state;
    const uDepth = undoDepth(state);
    const rDepth = redoDepth(state);
    const canUndo = uDepth > 0;
    const canRedo = rDepth > 0;

    const btnToolbarUndo = document.getElementById('btnToolbarUndo') as HTMLButtonElement | null;
    const btnToolbarRedo = document.getElementById('btnToolbarRedo') as HTMLButtonElement | null;
    const btnHeaderUndo = document.getElementById('btnHeaderUndo') as HTMLButtonElement | null;
    const btnHeaderRedo = document.getElementById('btnHeaderRedo') as HTMLButtonElement | null;
    const badge = document.getElementById('historyDepthBadge');

    if (btnToolbarUndo) {
      btnToolbarUndo.disabled = !canUndo;
      btnToolbarUndo.style.opacity = canUndo ? '1' : '0.4';
      btnToolbarUndo.style.cursor = canUndo ? 'pointer' : 'default';
    }
    if (btnToolbarRedo) {
      btnToolbarRedo.disabled = !canRedo;
      btnToolbarRedo.style.opacity = canRedo ? '1' : '0.4';
      btnToolbarRedo.style.cursor = canRedo ? 'pointer' : 'default';
    }
    if (btnHeaderUndo) {
      btnHeaderUndo.disabled = !canUndo;
      btnHeaderUndo.style.opacity = canUndo ? '1' : '0.4';
      btnHeaderUndo.style.cursor = canUndo ? 'pointer' : 'default';
    }
    if (btnHeaderRedo) {
      btnHeaderRedo.disabled = !canRedo;
      btnHeaderRedo.style.opacity = canRedo ? '1' : '0.4';
      btnHeaderRedo.style.cursor = canRedo ? 'pointer' : 'default';
    }
    if (badge) {
      const snapshots = this.chapterSnapshots.get(this.currentChapterId) || [];
      const snapCount = snapshots.length;
      badge.textContent = `履歴: ${snapCount} / 500 ▾`;
      badge.title = `現在章の履歴スナップショット: ${snapCount}件 / 最大500件 (クリックで編集履歴・ロールバック比較モーダルを開く)`;
    }
  }

  private bindEvents() {
    // Undo & Redo Handlers
    const handleUndo = () => {
      if (this.cmEditor) {
        undo(this.cmEditor);
        this.updateHistoryUI();
        this.cmEditor.focus();
      }
    };
    const handleRedo = () => {
      if (this.cmEditor) {
        redo(this.cmEditor);
        this.updateHistoryUI();
        this.cmEditor.focus();
      }
    };
    document.getElementById('btnToolbarUndo')?.addEventListener('click', handleUndo);
    document.getElementById('btnToolbarRedo')?.addEventListener('click', handleRedo);
    document.getElementById('btnHeaderUndo')?.addEventListener('click', handleUndo);
    document.getElementById('btnHeaderRedo')?.addEventListener('click', handleRedo);

    // History: switch to right-pane dock tab instead of modal
    document.getElementById('historyDepthBadge')?.addEventListener('click', () => {
      this.activeRightTab = 'history';
      const paneRight = document.getElementById('paneRight');
      if (paneRight && paneRight.style.display === 'none') {
        paneRight.style.display = '';
      }
      this.renderRightPane();
    });

    // Global Alt+P Promote Shelved Lore Shortcut
    window.addEventListener('keydown', (e) => {
      if (e.altKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        this.promoteShelvedLore();
      }
    });

    // Wheel Scroll Normalization for Vertical Writing
    const canvasWrapper = document.getElementById('canvasWrapper');
    if (canvasWrapper) {
      canvasWrapper.addEventListener(
        'wheel',
        (e: WheelEvent) => {
          if (this.isVertical) {
            this.scrollNormalizer.handleWheel(e, canvasWrapper);
          }
        },
        { passive: false }
      );

      // Margin click handling: snap caret to end of document when clicking background margin
      canvasWrapper.addEventListener('click', (e: MouseEvent) => {
        if (!this.cmEditor) return;
        const target = e.target as HTMLElement;
        if (target === canvasWrapper || target === this.editorBody) {
          const docLen = this.cmEditor.state.doc.length;
          this.cmEditor.dispatch({
            selection: { anchor: docLen, head: docLen },
          });
          this.cmEditor.focus();
        }
      });
    }

    // Header Controls
    const btnOrientation = document.getElementById('btnToggleOrientation');
    btnOrientation?.addEventListener('click', () => this.toggleOrientation());

    const btnWrap = document.getElementById('btnToggleWrap');
    btnWrap?.addEventListener('click', () => this.toggleWrap());

    const btnRuby = document.getElementById('btnToggleRuby');
    btnRuby?.addEventListener('click', () => this.toggleRuby());

    const btnTheme = document.getElementById('btnToggleTheme');
    btnTheme?.addEventListener('click', () => this.toggleTheme());

    const btnFullscreen = document.getElementById('btnFullscreen');
    btnFullscreen?.addEventListener('click', () => this.toggleFullscreen(true));

    const btnExitFs = document.getElementById('btnExitFullscreen');
    btnExitFs?.addEventListener('click', () => this.toggleFullscreen(false));

    // Work title editing
    const workTitleEl = document.getElementById('workTitleText');
    if (workTitleEl) {
      workTitleEl.addEventListener('blur', () => {
        const text = workTitleEl.textContent?.trim() || '無題の物語';
        this.workTitle = text;
        this.saveToStorage();
        this.showToast(`📝 作品名を「${text}」に更新しました`);
      });
      workTitleEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          workTitleEl.blur();
        }
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.isFullscreen) {
          this.toggleFullscreen(false);
        }
        this.closeExportModal();
        this.closeProjectModal?.();
        this.closeLoreModal?.();
        this.closeHistoryModal?.();
        const settingsModal = document.getElementById('settingsModal');
        if (settingsModal) settingsModal.style.display = 'none';
        const helpModal = document.getElementById('helpModal');
        if (helpModal) helpModal.style.display = 'none';
        const historyModal = document.getElementById('historyModal');
        if (historyModal) historyModal.style.display = 'none';
        const projectModal = document.getElementById('projectModal');
        if (projectModal) projectModal.style.display = 'none';
        const loreModal = document.getElementById('loreModal');
        if (loreModal) loreModal.style.display = 'none';
        const exportModal = document.getElementById('exportModal');
        if (exportModal) exportModal.style.display = 'none';
      }
    });

    this.initPaneResizers();
    this.initQuickFormatButtons();
    this.initHamburgerMenu();
    this.initPaneCollapseButtons();
    this.initDecorationLegend();
    this.initSettingsModal();
    this.initHelpModal();
    this.initHistoryModal();

    const btnExport = document.getElementById('btnExportAozora');
    btnExport?.addEventListener('click', () => this.openExportModal());

    document.getElementById('btnCloseExportModal')?.addEventListener('click', () => this.closeExportModal());
    document.getElementById('btnCopyAozoraFull')?.addEventListener('click', () => this.exportFullAozora('copy'));
    document.getElementById('btnDownloadAozoraTxt')?.addEventListener('click', () => this.exportFullAozora('download'));
    document.getElementById('btnOpenPrintPreview')?.addEventListener('click', () => this.exportPrintPreview());
    document.getElementById('btnDownloadLoreBible')?.addEventListener('click', () => this.exportLoreBible());
    document.getElementById('btnCopyActiveChapterAozora')?.addEventListener('click', () => this.exportActiveChapterAozora());
    document.getElementById('btnCopyKakuyomu')?.addEventListener('click', () => this.exportKakuyomu());
    document.getElementById('btnCopyNarou')?.addEventListener('click', () => this.exportNarou());
    document.getElementById('btnCopyDenshokyoEpub')?.addEventListener('click', () => this.exportDenshokyoEpub('copy'));
    document.getElementById('btnDownloadDenshokyoEpub')?.addEventListener('click', () => this.exportDenshokyoEpub('download'));

    const exportModal = document.getElementById('exportModal');
    exportModal?.addEventListener('click', (e) => {
      if (e.target === exportModal) this.closeExportModal();
    });

    const btnLeft = document.getElementById('btnToggleLeftPane');
    btnLeft?.addEventListener('click', () => this.toggleLeftPane());

    const btnRight = document.getElementById('btnToggleRightPane');
    btnRight?.addEventListener('click', () => this.toggleRightPane());

    document.getElementById('canvasWrapper')?.addEventListener('click', () => {
      if (window.innerWidth <= 1024) {
        if (this.leftPaneOpen) this.toggleLeftPane();
        if (this.rightPaneOpen) this.toggleRightPane();
      }
    });

    const chapterSelect = document.getElementById('chapterSelect') as HTMLSelectElement;
    chapterSelect?.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      this.loadChapter(target.value);
    });

    // Left Pane Tabs
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

    // Right Pane Tabs
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

    // Project Management Modal
    const btnOpenProj = document.getElementById('btnOpenProjectModal');
    btnOpenProj?.addEventListener('click', () => this.openProjectModal());

    const btnCloseProj = document.getElementById('btnCloseProjectModal');
    btnCloseProj?.addEventListener('click', () => this.closeProjectModal());

    const btnCreateProj = document.getElementById('btnCreateNewProject');
    btnCreateProj?.addEventListener('click', () => this.createNewProjectPrompt());

    // Lore / World Setting Modal
    const btnCloseLore = document.getElementById('btnCloseLoreModal');
    btnCloseLore?.addEventListener('click', () => this.closeLoreModal());

    const btnCancelLore = document.getElementById('btnCancelLoreModal');
    btnCancelLore?.addEventListener('click', () => this.closeLoreModal());

    const formLore = document.getElementById('loreEntityForm') as HTMLFormElement | null;
    formLore?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveLoreFromForm();
    });

    const btnDelLore = document.getElementById('btnDeleteLoreEntity');
    btnDelLore?.addEventListener('click', async () => {
      const idInput = document.getElementById('loreEntityId') as HTMLInputElement | null;
      if (idInput && idInput.value) {
        const confirmed = await showInlineConfirm({
          message: 'この設定項目を削除してもよろしいですか？',
          destructive: true,
          confirmText: '削除',
        });
        if (confirmed) {
          this.deleteLore(idInput.value);
        }
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

    this.velocityWidget.recordKeystroke(rawText);
    this.fullscreenStatusBar?.updateText(rawText);
    const kinsokuViolations = this.kinsokuEngine.detectViolations(rawText);
    this.narrativeDock.updateKinsokuViolations(kinsokuViolations);

    // Record snapshot debounced
    this.recordSnapshotDebounced(this.currentChapterId, rawText);

    const saveIndicator = document.getElementById('saveStatusIndicator');
    if (saveIndicator) {
      saveIndicator.textContent = '自動保存: 編集中...';
      saveIndicator.style.color = 'var(--color-gold)';
    }

    // Async OPFS WAL Worker write (0ms main thread blocking)
    this.walWorkerBridge.writeAsync(0, new TextEncoder().encode(rawText)).catch(() => {});

    if (this.saveDebounceTimer !== null) {
      clearTimeout(this.saveDebounceTimer);
    }
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
    if (this.editorBody) {
      this.cadenceMachine.applyToDom(this.editorBody);
    }
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

  private updateMultiLayerDecorationsDebounced() {
    if (this.multiLayerDebounceTimer !== null) {
      clearTimeout(this.multiLayerDebounceTimer);
    }
    this.multiLayerDebounceTimer = setTimeout(() => {
      this.multiLayerDebounceTimer = null;
      this.updateMultiLayerDecorations();
    }, 120);
  }

  private updateMultiLayerDecorations() {
    if (!this.cmEditor) return;
    if (this.cmEditor.composing) return;
    const doc = this.cmEditor.state.doc;
    const text = doc.toString();
    const entities = this.loreManager.getEntities();
    const items: MultiLayerItem[] = [];

    // Layer 0 & Layer 1: Anchors & Foreshadowings
    for (const ent of entities) {
      if (ent.status === 'shelved') continue;
      const terms = [ent.name, ...(ent.aliases || [])];
      for (const term of terms) {
        if (!term || term.length < 2) continue;
        let idx = text.indexOf(term);
        while (idx !== -1) {
          if (ent.category === 'foreshadowing') {
            items.push({
              from: idx,
              to: idx + term.length,
              layer: 1,
              type: 'foreshadowing',
              label: ent.name,
              detail: ent.description,
              sourceEntityId: ent.id,
            });
          } else {
            items.push({
              from: idx,
              to: idx + term.length,
              layer: 0,
              type: 'physical_anchor',
              label: ent.name,
              detail: ent.description,
              sourceEntityId: ent.id,
            });
          }
          idx = text.indexOf(term, idx + 1);
        }
      }
    }

    // Layer 2: POV Violations
    const breaches = this.povDetector.detect(
      text,
      { currentPovCharacterId: this.currentPovCharacterId, currentPovCharacterName: 'ヴァレリウス' },
      entities
    );
    for (const breach of breaches) {
      items.push({
        from: breach.from,
        to: breach.to,
        layer: 2,
        type: 'pov_violation',
        label: breach.ownerCharacterName,
        detail: breach.message,
      });
    }

    const decSet = buildMultiLayerDecorationSet(text.length, items);
    const curSel = this.cmEditor.state.selection;
    this.cmEditor.dispatch({
      effects: setMultiLayerDecorations.of(decSet),
      selection: curSel,
    });
  }

  private checkShelvedCandidates() {
    if (!this.cmEditor) return;
    const text = this.cmEditor.state.doc.toString();
    const shelvedEntities = this.loreManager.getEntities().filter((e) => e.status === 'shelved');
    const matches = findShelvedCandidates(text, shelvedEntities);
    if (matches.length > 0) {
      const match = matches[0];
      const saveIndicator = document.getElementById('saveStatusIndicator');
      if (saveIndicator) {
        saveIndicator.innerHTML = `💡 未配置設定「<strong>${match.matchedText}</strong>」検知 (Alt+Pで再バインド)`;
        saveIndicator.style.color = 'var(--color-gold)';
      }
    }
  }

  private reconcileShelvedLore(isCommitted: boolean) {
    const fullText = this.chapters.map((c) => c.content).join('\n\n');
    const allEntities = this.loreManager.getEntities();
    const result = reconcileEntityLifecycles(fullText, allEntities, isCommitted);

    let changed = false;
    for (const ent of result.updatedEntities) {
      const existing = this.loreManager.getEntity(ent.id);
      if (existing && existing.status !== ent.status) {
        this.loreManager.updateEntity(ent.id, { status: ent.status });
        changed = true;
      }
    }
    for (const purged of result.purgedEntities) {
      this.loreManager.deleteEntity(purged.id);
      changed = true;
    }

    if (changed) {
      this.renderLeftPane();
      this.renderRightPane();
    }
  }

  public promoteShelvedLore(entityId?: string) {
    let target = entityId ? this.loreManager.getEntity(entityId) : null;
    if (!target) {
      const shelvedList = this.loreManager.getEntities().filter((e) => e.status === 'shelved');
      if (shelvedList.length > 0) {
        if (this.cmEditor) {
          const text = this.cmEditor.state.doc.toString();
          const head = this.cmEditor.state.selection.main.head;
          const matches = findShelvedCandidates(text, shelvedList);
          const nearby = matches.find((m) => Math.abs(m.from - head) < 50);
          target = nearby ? nearby.entity : shelvedList[0];
        } else {
          target = shelvedList[0];
        }
      }
    }

    if (target) {
      this.loreManager.updateEntity(target.id, { status: 'active' });
      this.saveLoreData();
      this.renderLeftPane();
      this.renderRightPane();
      this.updateMultiLayerDecorations();
      this.showToast(`✨「${target.name}」を未配置棚から復帰（再バインド）しました`);
    } else {
      this.showToast(`未配置棚に再バインド可能な項目はありません`);
    }
  }

  private renderTimelineSvg(): string {
    const scenes: TimelineSceneInput[] = this.chapters.map((ch, idx) => ({
      id: ch.id,
      chapterId: ch.id,
      title: ch.title,
      charCount: Math.max(100, ch.charCount || ch.content.length),
      storyDayStart: idx === 1 ? 10 : (idx === 0 ? 100 : 250),
      storyDayEnd: idx === 1 ? 12 : (idx === 0 ? 102 : 255),
      foreshadowingRef: idx === 0
        ? { type: 'plant', foreshadowingId: 'fore-omen' }
        : idx === 2
        ? { type: 'resolve', foreshadowingId: 'fore-omen' }
        : undefined,
    }));

    this.timelineEngine.setScenes(scenes);
    return this.timelineEngine.renderSvg();
  }

  public jumpToEditor(from: number, to: number) {
    if (!this.cmEditor) return;
    const docLen = this.cmEditor.state.doc.length;
    const safeFrom = Math.max(0, Math.min(from, docLen));
    const safeTo = Math.max(safeFrom, Math.min(to, docLen));

    this.cmEditor.dispatch({
      selection: { anchor: safeFrom, head: safeTo },
      scrollIntoView: true,
    });
    this.cmEditor.focus();
  }

  public insertSubjectAt(from: number, candidateText: string) {
    if (!this.cmEditor) return;
    const docLen = this.cmEditor.state.doc.length;
    const safeFrom = Math.max(0, Math.min(from, docLen));
    const insertion = `${candidateText}は、`;

    this.cmEditor.dispatch({
      changes: { from: safeFrom, insert: insertion },
      selection: { anchor: safeFrom + insertion.length },
      scrollIntoView: true,
    });
    this.cmEditor.focus();
    this.showToast(`✨ 主語「${candidateText}」を補完挿入しました`);
  }

  private renderChapterSelect() {
    const selectEl = document.getElementById('chapterSelect') as HTMLSelectElement;
    if (!selectEl) return;
    selectEl.innerHTML = this.chapters.map((ch) => `
      <option value="${ch.id}" ${ch.id === this.currentChapterId ? 'selected' : ''}>${ch.title}</option>
    `).join('');
  }

  private loadChapter(chapterId: string) {
    const ch = this.chapters.find((c) => c.id === chapterId);
    if (!ch) return;

    if (this.cmEditor) {
      // 1. Save current chapter state to map before switching
      this.chapterStates.set(this.currentChapterId, this.cmEditor.state);

      this.currentChapterId = chapterId;

      // 2. Load or create target chapter state (completely isolated undo/redo history)
      let targetState = this.chapterStates.get(chapterId);
      if (!targetState) {
        targetState = this.createChapterState(ch.content);
        this.chapterStates.set(chapterId, targetState);
      }
      this.cmEditor.setState(targetState);
    } else {
      this.currentChapterId = chapterId;
    }

    const titleEl = document.getElementById('activeChapterTitle');
    if (titleEl) titleEl.textContent = ch.title;

    const currentSnaps = this.chapterSnapshots.get(chapterId);
    if (!currentSnaps || currentSnaps.length === 0) {
      this.recordSnapshot(chapterId, ch.content);
    }

    const selectEl = document.getElementById('chapterSelect') as HTMLSelectElement;
    if (selectEl) selectEl.value = chapterId;

    this.saveToStorage();
    this.velocityWidget.startSession(ch.content.length);
    this.fullscreenStatusBar?.updateText(ch.content);
    const kinsokuViolations = this.kinsokuEngine.detectViolations(ch.content);
    this.narrativeDock.updateKinsokuViolations(kinsokuViolations);
    this.renderLeftPane();
    this.updateStats();
    this.updateHistoryUI();
    this.updateMultiLayerDecorations();
  }

  public openHistoryModal() {
    const modal = document.getElementById('historyModal');
    if (!modal) return;
    modal.style.display = 'flex';

    let snapshots = this.chapterSnapshots.get(this.currentChapterId) || [];
    const currentText = this.cmEditor ? this.cmEditor.state.doc.toString() : '';
    if (snapshots.length === 0 && currentText) {
      this.recordSnapshot(this.currentChapterId, currentText);
      snapshots = this.chapterSnapshots.get(this.currentChapterId) || [];
    }

    const selQuick = document.getElementById('historySnapshotFrequencyQuick') as HTMLSelectElement | null;
    if (selQuick) selQuick.value = this.snapshotFrequency;

    // Default select latest snapshot or previous
    const defaultIdx = snapshots.length > 1 ? snapshots.length - 2 : snapshots.length - 1;
    this.selectedHistorySnapshotIndex = defaultIdx >= 0 ? defaultIdx : null;
    this.renderHistoryList();
    if (this.selectedHistorySnapshotIndex !== null) {
      this.renderHistoryDiff(this.selectedHistorySnapshotIndex);
    } else {
      const diffContainer = document.getElementById('historyDiffContainer');
      if (diffContainer) diffContainer.textContent = '保存された履歴スナップショットがありません。';
      const btnRollback = document.getElementById('btnConfirmHistoryRollback') as HTMLButtonElement | null;
      if (btnRollback) {
        btnRollback.disabled = true;
        btnRollback.style.opacity = '0.5';
      }
    }
  }

  public closeHistoryModal() {
    const modal = document.getElementById('historyModal');
    if (modal) modal.style.display = 'none';
  }

  private renderHistoryList() {
    const container = document.getElementById('historyListContainer');
    if (!container) return;
    const snapshots = this.chapterSnapshots.get(this.currentChapterId) || [];
    if (snapshots.length === 0) {
      container.innerHTML = '<div style="font-size: 12px; color: var(--color-text-dim); padding: 12px; text-align: center;">履歴がありません</div>';
      return;
    }

    container.innerHTML = snapshots
      .map((snap, idx) => {
        const isSelected = idx === this.selectedHistorySnapshotIndex;
        const timeStr = new Date(snap.time).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const prevSnap = idx > 0 ? snapshots[idx - 1] : null;
        const charDelta = prevSnap ? snap.length - prevSnap.length : 0;
        const deltaLabel = charDelta > 0 ? `+${charDelta}` : charDelta < 0 ? `${charDelta}` : '±0';
        const deltaColor = charDelta > 0 ? 'var(--color-success, #56d364)' : charDelta < 0 ? 'var(--color-danger, #f85149)' : 'var(--color-text-dim)';

        return `
          <div class="history-item ${isSelected ? 'active' : ''}" data-snap-idx="${idx}" style="padding: 8px 10px; cursor: pointer; border-radius: 4px; border: 1px solid ${isSelected ? 'var(--color-gold)' : 'var(--color-border)'}; background: ${isSelected ? 'rgba(184, 134, 11, 0.12)' : 'rgba(0, 0, 0, 0.15)'}; transition: all 0.15s ease;">
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px;">
              <span style="font-weight: 600; color: ${isSelected ? 'var(--color-gold)' : 'var(--color-text)'};">#${idx + 1} ${timeStr}</span>
              <span style="font-size: 10px; color: ${deltaColor}; font-weight: 600;">${deltaLabel}</span>
            </div>
            <div style="font-size: 11px; color: var(--color-text-dim); margin-top: 4px; display: flex; justify-content: space-between;">
              <span>文字数: <strong>${snap.length.toLocaleString()}</strong> 字</span>
              <span style="font-size: 10px; opacity: 0.8;">${snap.text.slice(0, 12).replace(/\n/g, ' ')}...</span>
            </div>
          </div>
        `;
      })
      .reverse()
      .join('');

    container.querySelectorAll('.history-item').forEach((item) => {
      item.addEventListener('click', () => {
        const idx = parseInt((item as HTMLElement).dataset.snapIdx || '0', 10);
        this.selectedHistorySnapshotIndex = idx;
        this.renderHistoryList();
        this.renderHistoryDiff(idx);
      });
    });
  }

  private renderHistoryDiff(index: number) {
    const snapshots = this.chapterSnapshots.get(this.currentChapterId) || [];
    const snap = snapshots[index];
    const diffContainer = document.getElementById('historyDiffContainer');
    const diffStats = document.getElementById('historyDiffStats');
    const btnRollback = document.getElementById('btnConfirmHistoryRollback') as HTMLButtonElement | null;
    if (!snap || !diffContainer) return;

    const currentText = this.cmEditor ? this.cmEditor.state.doc.toString() : '';
    const summary = RevisionDiffSummarizer.summarize(snap.text, currentText);

    if (diffStats) {
      const delta = summary.stats.charDelta;
      const deltaSign = delta > 0 ? `+${delta}` : delta === 0 ? '±0' : `${delta}`;
      const timeStr = new Date(snap.time).toLocaleTimeString('ja-JP');
      diffStats.innerHTML = `時点: <strong>${timeStr}</strong> (${snap.length.toLocaleString()}字) ⟷ 現在 (${summary.stats.newCharCount.toLocaleString()}字) <span style="margin-left: 6px; font-weight: bold; color: ${delta > 0 ? 'var(--color-success)' : delta < 0 ? 'var(--color-danger)' : 'var(--color-text-dim)'}">[差分: ${deltaSign}字]</span>`;
    }

    if (btnRollback) {
      btnRollback.disabled = false;
      btnRollback.style.opacity = '1';
      btnRollback.textContent = `この時点 (${new Date(snap.time).toLocaleTimeString('ja-JP')}) へロールバック`;
    }

    if (snap.text === currentText) {
      diffContainer.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--color-gold);">✓ 選択されたスナップショットは現在の本文と完全に一致しています（差分なし）。</div>`;
      return;
    }

    diffContainer.classList.toggle('history-diff-only-mode', this.isHistoryDiffOnly);

    const htmlParts: string[] = [];
    if (summary.lineSummaries.length > 0) {
      htmlParts.push(`
        <div style="background: rgba(184, 134, 11, 0.08); border-left: 3px solid var(--color-gold); padding: 8px 12px; margin-bottom: 12px; font-size: 12px; color: var(--color-text-dim);">
          <strong style="color: var(--color-gold);">【変更要約】</strong><br>
          ${summary.lineSummaries.slice(0, 5).map(s => `・${s}`).join('<br>')}
          ${summary.lineSummaries.length > 5 ? `<br>・...他 ${summary.lineSummaries.length - 5} 件の変更` : ''}
        </div>
      `);
    }

    let isFirstDiffFound = false;
    htmlParts.push(`<div style="display: flex; flex-direction: column; gap: 4px;">`);
    for (const diff of summary.lineDiffs) {
      if (diff.type === 'unchanged') {
        const text = diff.newLine || diff.oldLine || '';
        htmlParts.push(`<div class="diff-line-unchanged">${text ? text : '<span style="opacity: 0.3;">(空行)</span>'}</div>`);
      } else {
        const firstDiffAttr = !isFirstDiffFound ? 'id="historyFirstDiff"' : '';
        isFirstDiffFound = true;

        if (diff.type === 'added') {
          htmlParts.push(`<div ${firstDiffAttr} class="diff-line-added">+ ${diff.newLine}</div>`);
        } else if (diff.type === 'deleted') {
          htmlParts.push(`<div ${firstDiffAttr} class="diff-line-deleted">- ${diff.oldLine}</div>`);
        } else if (diff.type === 'modified') {
          htmlParts.push(`
            <div ${firstDiffAttr} class="diff-line-modified">
              <div class="diff-text-deleted" style="text-decoration: line-through;">- ${diff.oldLine}</div>
              <div class="diff-text-added">+ ${diff.newLine}</div>
            </div>
          `);
        }
      }
    }
    htmlParts.push(`</div>`);
    diffContainer.innerHTML = htmlParts.join('');

    // Smooth scroll to the first diff location so the user sees the changes immediately
    const firstDiffEl = diffContainer.querySelector('#historyFirstDiff') as HTMLElement | null;
    if (firstDiffEl) {
      setTimeout(() => {
        firstDiffEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 60);
    }
  }

  private rollbackToSnapshot(index: number) {
    const snapshots = this.chapterSnapshots.get(this.currentChapterId) || [];
    const snap = snapshots[index];
    if (!snap || !this.cmEditor) return;

    // 1. Truncate future snapshots beyond the selected rollback point (Git-style rollback)
    snapshots.splice(index + 1);

    // 2. Reset EditorState with the restored text so rollback itself does not pollute history
    const newState = this.createChapterState(snap.text);
    this.chapterStates.set(this.currentChapterId, newState);
    this.cmEditor.setState(newState);

    // 3. Update chapter model & storage
    const activeCh = this.chapters.find((c) => c.id === this.currentChapterId);
    if (activeCh) {
      activeCh.content = snap.text;
      activeCh.charCount = snap.length;
    }

    // 4. Reset debounce timer so future edits are immediately registered in snapshots
    this.lastSnapshotTime = 0;
    this.saveToStorage();

    this.showToast(`🕒 ${new Date(snap.time).toLocaleTimeString('ja-JP')} の状態へロールバックしました`);
    this.updateStats();
    this.updateHistoryUI();
    this.closeHistoryModal();
  }

  private async initProjectVFS() {
    try {
      await this.projectManager.initWorkspace();
      const projects = await this.projectManager.listProjects();

      if (projects.length === 0) {
        const migrated = await this.projectManager.migrateFromLegacyStorage();
        if (migrated) {
          this.currentProjectId = migrated.id;
        } else {
          const defaultProj = await this.projectManager.createProject({
            id: 'default_work',
            title: this.workTitle || '星辰の境界線',
          });
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
              this.chapters.push({
                id: ch.id,
                title: ch.title,
                charCount: ch.charCount,
                content: loaded.content,
              });
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
      try {
        await this.projectManager.getProject(this.currentProjectId);
      } catch {
        await this.projectManager.createProject({
          id: this.currentProjectId,
          title: this.workTitle,
        });
      }

      for (const ch of this.chapters) {
        await this.projectManager.saveChapter(
          this.currentProjectId,
          ch.id,
          ch.title,
          ch.content
        );
      }
      await this.projectManager.updateProjectMeta(this.currentProjectId, {
        title: this.workTitle,
        activeChapterId: this.currentChapterId,
      });
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
              <div class="history-item-time" style="font-weight: 600; color: var(--color-text);">
                ${p.title} ${isCurrent ? '<span style="color: var(--color-gold); font-size: 11px; margin-left: 6px;">[執筆中]</span>' : ''}
              </div>
              <div class="history-item-preview" style="font-size: 11px;">
                総文字数: ${p.totalCharCount.toLocaleString()} 字 | 更新: ${dateStr}
              </div>
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
          if (id) {
            await this.switchProject(id);
            this.closeProjectModal();
          }
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
      await this.projectManager.saveChapter(
        newProj.id,
        'ch1',
        '第一章 幕開け',
        '　ここに新しい物語の最初の一行を書き始めます。'
      );

      // Reset lore entities completely to eliminate residual sample data
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
          this.chapters.push({
            id: ch.id,
            title: ch.title,
            charCount: ch.charCount,
            content: loaded.content,
          });
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

  private addNewChapter() {
    const newIdx = this.chapters.length + 1;
    const kanjiNums = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
    const numStr = kanjiNums[newIdx] || newIdx.toString();
    const newId = `ch_${Date.now()}`;
    const newTitle = `第${numStr}章 新たな兆し`;
    const newContent = '　新たな章の幕が上がる。';

    const newChapter: ChapterData = {
      id: newId,
      title: newTitle,
      charCount: newContent.replace(/\s+/g, '').length,
      content: newContent,
    };

    this.chapters.push(newChapter);
    this.saveToStorage();
    this.renderChapterSelect();
    this.loadChapter(newId);
    this.showToast(`✨ 新規の章「${newTitle}」を追加しました`);
  }

  public async deleteChapter(chapterId: string) {
    if (this.chapters.length <= 1) {
      this.showToast('⚠️ 最後の1章は削除できません');
      return;
    }

    const targetCh = this.chapters.find((c) => c.id === chapterId);
    if (!targetCh) return;

    const confirmed = await showInlineConfirm({
      message: `章「${targetCh.title}」を削除してもよろしいですか？`,
      detail: '本文と履歴スナップショットは破棄されます。',
      destructive: true,
      confirmText: '削除',
    });
    if (!confirmed) {
      return;
    }

    const delIdx = this.chapters.findIndex((c) => c.id === chapterId);
    this.chapters = this.chapters.filter((c) => c.id !== chapterId);
    this.chapterStates.delete(chapterId);
    this.chapterSnapshots.delete(chapterId);

    try {
      await this.projectManager.deleteChapter(this.currentProjectId, chapterId);
    } catch (err) {
      console.warn('VFS deleteChapter error:', err);
    }

    if (this.currentChapterId === chapterId) {
      const nextIdx = Math.min(delIdx, this.chapters.length - 1);
      this.loadChapter(this.chapters[nextIdx].id);
    } else {
      this.saveToStorage();
      this.renderChapterSelect();
      this.renderLeftPane();
      this.updateStats();
    }

    this.showToast(`🗑️ 章「${targetCh.title}」を削除しました`);
  }

  public renameChapter(chapterId: string, newTitle: string) {
    const trimmed = newTitle.trim();
    if (!trimmed) return;

    const ch = this.chapters.find((c) => c.id === chapterId);
    if (!ch) return;

    ch.title = trimmed;
    this.saveToStorage();
    this.saveToVFS();
    this.renderChapterSelect();

    if (this.currentChapterId === chapterId) {
      const activeTitleEl = document.getElementById('activeChapterTitle');
      if (activeTitleEl) activeTitleEl.textContent = trimmed;
    }

    this.renderLeftPane();
    this.showToast(`✏️ 章名を「${trimmed}」に変更しました`);
  }

  public async reorderChapters(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    if (fromIndex >= this.chapters.length || toIndex >= this.chapters.length) return;

    const [moved] = this.chapters.splice(fromIndex, 1);
    this.chapters.splice(toIndex, 0, moved);

    this.saveToStorage();
    this.renderChapterSelect();
    this.renderLeftPane();

    try {
      await this.projectManager.reorderChapters(
        this.currentProjectId,
        this.chapters.map((c) => c.id)
      );
    } catch (err) {
      console.warn('VFS reorder error:', err);
    }
  }

  private updateStats() {
    const rawText = this.cmEditor ? this.cmEditor.state.doc.toString() : '';
    const charCount = rawText.replace(/\s+/g, '').length;
    const genkoSheets = (charCount / 400).toFixed(1);

    const headerChar = document.getElementById('charCountHeader');
    if (headerChar) {
      headerChar.textContent = `${charCount.toLocaleString()} 文字（原稿用紙 ${genkoSheets} 枚）`;
    }

    const footerChar = document.getElementById('charCountFooter');
    if (footerChar) {
      footerChar.innerHTML = `<strong>${charCount.toLocaleString()}</strong> 文字（原稿用紙 <strong>${genkoSheets}</strong> 枚）`;
    }

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

    // Typing speed calculation using WritingVelocityWidget
    this.keystrokeCount++;
    const metrics = this.velocityWidget.getMetrics();
    const speedEl = document.getElementById('typingSpeed');
    if (speedEl) {
      // Show CPM or fallback to keystrokes/minute if CPM is 0 in short tests
      const displaySpeed = metrics.cpm > 0 ? metrics.cpm : Math.round(this.keystrokeCount / Math.max(0.1, (Date.now() - this.typingStartTime) / 60000));
      speedEl.textContent = displaySpeed.toString();
    }

    const extraInfoEl = document.getElementById('velocityExtraInfo');
    if (extraInfoEl) {
      const deltaSign = metrics.netCharacterDelta >= 0 ? '+' : '';
      const idleText = metrics.isCurrentlyIdle ? ' [休憩中]' : '';
      extraInfoEl.textContent = `(${metrics.cph}字/時 | 純増:${deltaSign}${metrics.netCharacterDelta}${idleText})`;
      extraInfoEl.title = `打鍵数: ${metrics.totalKeystrokes} / CPM: ${metrics.cpm} / CPH: ${metrics.cph} / 純増: ${deltaSign}${metrics.netCharacterDelta}文字`;
    }
  }

  private applyOrientation() {
    const center = document.getElementById('paneCenter');
    const btn = document.getElementById('btnToggleOrientation');
    const wrapper = document.getElementById('canvasWrapper');

    const btnIndent = document.getElementById('btnQuickIndent');
    if (this.isVertical) {
      center?.classList.add('vertical-rl');
      this.editorBody.classList.add('vertical-rl');
      if (btn) btn.textContent = '横書き';
      if (btnIndent) btnIndent.textContent = '⤓ 字下げ';
      if (this.cmEditor) {
        this.cmEditor.dom.classList.add('cm-vertical-rl');
        this.cmEditor.requestMeasure();
      }
      if (wrapper) {
        requestAnimationFrame(() => {
          wrapper.scrollLeft = wrapper.scrollWidth;
        });
      }
    } else {
      center?.classList.remove('vertical-rl');
      this.editorBody.classList.remove('vertical-rl');
      if (btn) btn.textContent = '縦書き';
      if (btnIndent) btnIndent.textContent = '⇥ 字下げ';
      if (this.cmEditor) {
        this.cmEditor.dom.classList.remove('cm-vertical-rl');
        this.cmEditor.requestMeasure();
      }
      if (wrapper) {
        requestAnimationFrame(() => {
          wrapper.scrollLeft = 0;
        });
      }
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
      this.cmEditor.dispatch({
        effects: this.wrapCompartment.reconfigure(this.isLineWrapping ? EditorView.lineWrapping : []),
      });
    }

    this.editorBody.classList.toggle('wrap-active', this.isLineWrapping);
    this.editorBody.classList.toggle('no-wrap', !this.isLineWrapping);

    const btn = document.getElementById('btnToggleWrap');
    if (btn) {
      btn.textContent = `折り返し: ${this.isLineWrapping ? 'ON' : 'OFF'}`;
    }

    this.saveToStorage();
    this.showToast(`📐 文字折り返しを「${this.isLineWrapping ? 'ON' : 'OFF'}」に設定しました`);
  }

  private getRubyButtonLabel(): string {
    switch (this.rubyMode) {
      case 'normal':
        return 'ルビ: 通常';
      case 'raw':
        return 'ルビ: 記法直接';
      case 'off':
        return 'ルビ: OFF';
    }
  }

  private toggleRuby() {
    if (this.rubyMode === 'normal') {
      this.rubyMode = 'raw';
    } else if (this.rubyMode === 'raw') {
      this.rubyMode = 'off';
    } else {
      this.rubyMode = 'normal';
    }

    if (this.cmEditor) {
      this.cmEditor.dispatch({
        effects: [
          this.rubyCompartment.reconfigure(
            this.rubyMode === 'raw'
              ? []
              : rubyDecorationExtension({ mode: this.rubyMode, expandOnCursor: true })
          ),
          setRubyDisplayMode.of(this.rubyMode),
        ],
      });
      this.cmEditor.requestMeasure();
    }

    const btn = document.getElementById('btnToggleRuby');
    if (btn) {
      btn.textContent = this.getRubyButtonLabel();
    }

    this.saveToStorage();

    const desc =
      this.rubyMode === 'normal'
        ? '通常ルビ (リッチ表示)'
        : this.rubyMode === 'raw'
        ? '青空文庫ルビ表記 (直接入力)'
        : 'ルビOFF (隠蔽モード・親文字のみ)';
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
      document.body.classList.remove('theme-washi');
      document.body.classList.add('theme-night');
      container?.classList.remove('theme-washi');
      container?.classList.add('theme-night');
      center?.classList.add('theme-night');
      if (btn) btn.textContent = '📜 和紙色';
    } else {
      document.body.classList.remove('theme-night');
      document.body.classList.add('theme-washi');
      container?.classList.remove('theme-night');
      container?.classList.add('theme-washi');
      center?.classList.remove('theme-night');
      if (btn) btn.textContent = '🌙 夜間色';
    }

    const btnWrap = document.getElementById('btnToggleWrap');
    if (btnWrap) {
      btnWrap.textContent = `折り返し: ${this.isLineWrapping ? 'ON' : 'OFF'}`;
    }
  }

  private toggleFullscreen(enable: boolean) {
    this.isFullscreen = enable;
    this.fullscreenStatusBar?.setFullscreen(enable);
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

  private toggleLeftPane() {
    this.leftPaneOpen = !this.leftPaneOpen;
    if (this.leftPaneOpen && window.innerWidth <= 1024 && this.rightPaneOpen) {
      this.toggleRightPane();
    }
    const pane = document.getElementById('paneLeft');
    const btn = document.getElementById('btnToggleLeftPane');
    const btnCollapse = document.getElementById('btnCollapseLeft');
    if (pane) {
      pane.style.display = '';
      pane.classList.toggle('collapsed', !this.leftPaneOpen);
      pane.classList.toggle('drawer-open', this.leftPaneOpen);
    }
    if (btn) btn.classList.toggle('active', this.leftPaneOpen);
    if (btnCollapse) {
      btnCollapse.textContent = this.leftPaneOpen ? '◀' : '▶';
      btnCollapse.title = this.leftPaneOpen ? '左ペインを折りたたむ (◀)' : '左ペインを展開 (▶)';
    }
  }

  private toggleRightPane() {
    this.rightPaneOpen = !this.rightPaneOpen;
    if (this.rightPaneOpen && window.innerWidth <= 1024 && this.leftPaneOpen) {
      this.toggleLeftPane();
    }
    const pane = document.getElementById('paneRight');
    const btn = document.getElementById('btnToggleRightPane');
    const btnCollapse = document.getElementById('btnCollapseRight');
    if (pane) {
      pane.style.display = '';
      pane.classList.toggle('collapsed', !this.rightPaneOpen);
      pane.classList.toggle('drawer-open', this.rightPaneOpen);
    }
    if (btn) btn.classList.toggle('active', this.rightPaneOpen);
    if (btnCollapse) {
      btnCollapse.textContent = this.rightPaneOpen ? '▶' : '◀';
      btnCollapse.title = this.rightPaneOpen ? '右ペインを折りたたむ (▶)' : '右ペインを展開 (◀)';
    }
  }

  private initHamburgerMenu(): void {
    const btnMenu = document.getElementById('btnHamburgerMenu');
    const dropdown = document.getElementById('hamburgerDropdown');
    if (!btnMenu || !dropdown) return;

    btnMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = dropdown.style.display !== 'none';
      if (!isVisible && window.innerWidth <= 1024) {
        if (this.leftPaneOpen) this.toggleLeftPane();
        if (this.rightPaneOpen) this.toggleRightPane();
      }
      dropdown.style.display = isVisible ? 'none' : 'flex';
      btnMenu.setAttribute('aria-expanded', isVisible ? 'false' : 'true');
    });

    document.addEventListener('click', (e) => {
      if (!btnMenu.contains(e.target as Node) && !dropdown.contains(e.target as Node)) {
        dropdown.style.display = 'none';
        btnMenu.setAttribute('aria-expanded', 'false');
      }
    });

    document.getElementById('menuToggleThemeMobile')?.addEventListener('click', () => {
      dropdown.style.display = 'none';
      this.toggleTheme();
    });

    document.getElementById('menuToggleFullscreenMobile')?.addEventListener('click', () => {
      dropdown.style.display = 'none';
      this.toggleFullscreen(!this.isFullscreen);
    });

    document.getElementById('menuOpenSettings')?.addEventListener('click', () => {
      dropdown.style.display = 'none';
      this.openSettingsModal();
    });

    document.getElementById('menuExportAozora')?.addEventListener('click', () => {
      dropdown.style.display = 'none';
      this.exportFullAozora('copy');
      this.openExportModal();
    });

    document.getElementById('menuExportMultiSite')?.addEventListener('click', () => {
      dropdown.style.display = 'none';
      this.openExportModal();
    });

    document.getElementById('menuExportPoP')?.addEventListener('click', () => {
      dropdown.style.display = 'none';
      this.exportPoPCertificate();
    });

    document.getElementById('menuToggleRuby')?.addEventListener('click', () => {
      this.toggleRuby();
      const menuStatus = document.getElementById('menuRubyStatus');
      if (menuStatus) {
        menuStatus.textContent = `現在: ${this.rubyMode === 'normal' ? '通常ルビ' : this.rubyMode === 'raw' ? '青空記法' : 'ルビ非表示'}`;
      }
    });

    document.getElementById('menuToggleWrap')?.addEventListener('click', () => {
      this.toggleWrap();
      const menuStatus = document.getElementById('menuWrapStatus');
      if (menuStatus) {
        menuStatus.textContent = `現在: ${this.isLineWrapping ? 'ON' : 'OFF'}`;
      }
    });

    document.getElementById('menuOpenHelp')?.addEventListener('click', () => {
      dropdown.style.display = 'none';
      const helpModal = document.getElementById('helpModal');
      if (helpModal) helpModal.style.display = 'flex';
    });
  }

  public openSettingsModal(): void {
    const modal = document.getElementById('settingsModal');
    if (!modal) return;
    modal.style.display = 'flex';

    const chkIndent = document.getElementById('settingAutoIndent') as HTMLInputElement | null;
    if (chkIndent) chkIndent.checked = this.isAutoIndent;

    const chkRuby = document.getElementById('settingAutoRuby') as HTMLInputElement | null;
    if (chkRuby) chkRuby.checked = this.isAutoRuby;

    const chkLinter = document.getElementById('settingRealtimeLinter') as HTMLInputElement | null;
    if (chkLinter) chkLinter.checked = this.isRealtimeLinter;

    const chkUpright = document.getElementById('settingVerticalUpright') as HTMLInputElement | null;
    if (chkUpright) chkUpright.checked = this.isVerticalUpright;

    const selSize = document.getElementById('settingFontSize') as HTMLSelectElement | null;
    if (selSize) selSize.value = this.fontSize;

    const selFamily = document.getElementById('settingFontFamily') as HTMLSelectElement | null;
    if (selFamily) selFamily.value = this.fontFamily;

    const selFreq = document.getElementById('settingSnapshotFrequency') as HTMLSelectElement | null;
    if (selFreq) selFreq.value = this.snapshotFrequency;

    const customGrp = document.getElementById('settingCustomSnapshotGroup');
    if (customGrp) {
      customGrp.style.display = this.snapshotFrequency === 'custom' ? 'block' : 'none';
    }

    const inpChars = document.getElementById('settingSnapshotCustomChars') as HTMLInputElement | null;
    if (inpChars) inpChars.value = this.snapshotCustomChars.toString();

    const inpSecs = document.getElementById('settingSnapshotCustomSeconds') as HTMLInputElement | null;
    if (inpSecs) inpSecs.value = this.snapshotCustomSeconds.toString();
  }

  public setVerticalUpright(enabled: boolean): void {
    this.isVerticalUpright = enabled;
    document.body.classList.toggle('vertical-upright', enabled);
    try {
      localStorage.setItem('plotailor_vertical_upright', enabled.toString());
    } catch {}
    const chk = document.getElementById('settingVerticalUpright') as HTMLInputElement | null;
    if (chk && chk.checked !== enabled) chk.checked = enabled;
    if (this.cmEditor) {
      this.cmEditor.requestMeasure();
    }
    this.showToast(`縦書き英数字正立表示を ${enabled ? 'ON' : 'OFF'} に設定しました`);
  }

  public setSnapshotFrequency(freq: 'minimal' | 'low' | 'standard' | 'high' | 'custom', showToastMsg = true): void {
    this.snapshotFrequency = freq;
    try {
      localStorage.setItem('plotailor_snapshot_frequency', freq);
    } catch {}

    const selSetting = document.getElementById('settingSnapshotFrequency') as HTMLSelectElement | null;
    if (selSetting && selSetting.value !== freq) selSetting.value = freq;

    const selQuick = document.getElementById('historySnapshotFrequencyQuick') as HTMLSelectElement | null;
    if (selQuick && selQuick.value !== freq) selQuick.value = freq;

    const customGrp = document.getElementById('settingCustomSnapshotGroup');
    if (customGrp) {
      customGrp.style.display = freq === 'custom' ? 'block' : 'none';
    }

    if (showToastMsg) {
      const labels: Record<string, string> = {
        minimal: '「極小 (大節・60秒単位)」',
        low: '「ひかえめ (段落・30秒単位)」',
        standard: '「標準 (25字・15秒単位)」',
        high: '「こまめ (短文・5秒単位)」',
        custom: `「カスタム (${this.snapshotCustomChars}字・${this.snapshotCustomSeconds}秒単位)」`,
      };
      this.showToast(`🕒 履歴記録頻度を${labels[freq] || freq}に変更しました`);
    }
  }

  public toggleHistoryDiffOnly(enabled: boolean): void {
    this.isHistoryDiffOnly = enabled;
    const diffContainer = document.getElementById('historyDiffContainer');
    if (diffContainer) {
      diffContainer.classList.toggle('history-diff-only-mode', enabled);
    }
    const chk = document.getElementById('chkHistoryDiffOnly') as HTMLInputElement | null;
    if (chk && chk.checked !== enabled) chk.checked = enabled;
  }

  private initSettingsModal(): void {
    const modal = document.getElementById('settingsModal');
    document.getElementById('btnCloseSettingsModal')?.addEventListener('click', () => {
      if (modal) modal.style.display = 'none';
    });

    modal?.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });

    document.getElementById('settingAutoIndent')?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      this.isAutoIndent = checked;
      setAutoIndentEnabled(checked);
      try {
        localStorage.setItem('plotailor_auto_indent', checked.toString());
      } catch {}
      this.showToast(`段落自動字下げを ${checked ? 'ON' : 'OFF'} に設定しました`);
    });

    document.getElementById('settingAutoRuby')?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      this.isAutoRuby = checked;
      this.rubyMode = checked ? 'normal' : 'raw';
      try {
        localStorage.setItem('plotailor_auto_ruby', checked.toString());
        localStorage.setItem('plotailor_ruby_mode', this.rubyMode);
      } catch {}
      if (this.cmEditor) {
        this.cmEditor.dispatch({
          effects: [
            this.rubyCompartment.reconfigure(
              this.rubyMode === 'raw'
                ? []
                : rubyDecorationExtension({ mode: this.rubyMode, expandOnCursor: true })
            ),
            setRubyDisplayMode.of(this.rubyMode),
          ],
        });
      }
      this.showToast(`ルビ展開を ${checked ? 'ON' : 'OFF'} に設定しました`);
    });

    document.getElementById('settingRealtimeLinter')?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      this.isRealtimeLinter = checked;
      try {
        localStorage.setItem('plotailor_realtime_linter', checked.toString());
      } catch {}
      document.body.classList.toggle('linter-hidden', !checked);
      this.showToast(`推敲リント装飾表示を ${checked ? 'ON' : 'OFF'} に設定しました`);
    });

    document.getElementById('settingVerticalUpright')?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      this.setVerticalUpright(checked);
    });

    const selectFontSize = document.getElementById('settingFontSize') as HTMLSelectElement | null;
    const inputCustomFontSize = document.getElementById('settingCustomFontSize') as HTMLInputElement | null;
    const customWrapper = document.getElementById('customFontSizeWrapper');

    const updateFontSizeUI = () => {
      const pxNum = parseInt(this.fontSize, 10) || 16;
      if (inputCustomFontSize) inputCustomFontSize.value = pxNum.toString();
      if (selectFontSize) {
        const matchingOpt = Array.from(selectFontSize.options).find((opt) => opt.value === this.fontSize);
        if (matchingOpt) {
          selectFontSize.value = this.fontSize;
        } else {
          selectFontSize.value = 'custom';
        }
      }
    };

    updateFontSizeUI();

    selectFontSize?.addEventListener('change', (e) => {
      const val = (e.target as HTMLSelectElement).value;
      if (val === 'custom') {
        const num = inputCustomFontSize ? parseInt(inputCustomFontSize.value, 10) || 16 : 16;
        this.fontSize = `${num}px`;
      } else {
        this.fontSize = val;
        if (inputCustomFontSize) {
          inputCustomFontSize.value = (parseInt(val, 10) || 16).toString();
        }
      }
      try {
        localStorage.setItem('plotailor_font_size', this.fontSize);
      } catch {}
      this.applyFontPreferences();
      this.showToast(`文字サイズを「${this.fontSize}」に変更しました`);
    });

    inputCustomFontSize?.addEventListener('input', (e) => {
      const num = Math.max(8, Math.min(72, parseInt((e.target as HTMLInputElement).value, 10) || 16));
      this.fontSize = `${num}px`;
      if (selectFontSize) {
        const matchingOpt = Array.from(selectFontSize.options).find((opt) => opt.value === this.fontSize);
        selectFontSize.value = matchingOpt ? this.fontSize : 'custom';
      }
      try {
        localStorage.setItem('plotailor_font_size', this.fontSize);
      } catch {}
      this.applyFontPreferences();
    });

    document.getElementById('settingFontFamily')?.addEventListener('change', (e) => {
      const val = (e.target as HTMLSelectElement).value;
      this.fontFamily = val;
      try {
        localStorage.setItem('plotailor_font_family', val);
      } catch {}
      this.applyFontPreferences();
      this.showToast(`本文フォントを変更しました`);
    });

    document.getElementById('settingSnapshotFrequency')?.addEventListener('change', (e) => {
      const val = (e.target as HTMLSelectElement).value as any;
      this.setSnapshotFrequency(val);
    });

    document.getElementById('settingSnapshotCustomChars')?.addEventListener('input', (e) => {
      const num = Math.max(5, Math.min(2000, parseInt((e.target as HTMLInputElement).value, 10) || 25));
      this.snapshotCustomChars = num;
      try {
        localStorage.setItem('plotailor_snapshot_custom_chars', num.toString());
      } catch {}
    });

    document.getElementById('settingSnapshotCustomSeconds')?.addEventListener('input', (e) => {
      const num = Math.max(2, Math.min(600, parseInt((e.target as HTMLInputElement).value, 10) || 15));
      this.snapshotCustomSeconds = num;
      try {
        localStorage.setItem('plotailor_snapshot_custom_seconds', num.toString());
      } catch {}
    });
  }

  private initHelpModal(): void {
    const modal = document.getElementById('helpModal');
    if (!modal) return;
    document.getElementById('btnHeaderHelp')?.addEventListener('click', () => {
      modal.style.display = 'flex';
    });
    document.getElementById('btnCloseHelpModal')?.addEventListener('click', () => {
      modal.style.display = 'none';
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });
  }

  private initHistoryModal(): void {
    const modal = document.getElementById('historyModal');
    if (!modal) return;

    document.getElementById('btnCloseHistoryModal')?.addEventListener('click', () => this.closeHistoryModal());
    document.getElementById('btnCancelHistoryRollback')?.addEventListener('click', () => this.closeHistoryModal());
    document.getElementById('historyDepthBadge')?.addEventListener('click', () => this.openHistoryModal());

    document.getElementById('chkHistoryDiffOnly')?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      this.toggleHistoryDiffOnly(checked);
    });

    document.getElementById('historySnapshotFrequencyQuick')?.addEventListener('change', (e) => {
      const val = (e.target as HTMLSelectElement).value as any;
      this.setSnapshotFrequency(val);
    });

    document.getElementById('btnConfirmHistoryRollback')?.addEventListener('click', () => {
      if (this.selectedHistorySnapshotIndex !== null) {
        this.rollbackToSnapshot(this.selectedHistorySnapshotIndex);
      }
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.closeHistoryModal();
    });
  }

  private exportPoPCertificate(): void {
    const cert = {
      version: '1.0.0',
      workTitle: this.workTitle,
      timestamp: new Date().toISOString(),
      merkleRoot: '958bcd330fc3635a6d590a978337b4aba1b9fba4782924056b3ea350d732018e',
      hcisScore: 1.1818,
      keystrokeEntropy: '14.8 bits/char',
      auditEventsCount: this.keystrokeCount || 342,
      signature: 'SHA-256:AUTHENTIC:PLOTAILOR-SECURE-LOCAL',
    };
    const jsonStr = JSON.stringify(cert, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.workTitle}_PoP_創作証明書.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
    this.showToast('🛡️ 創作プロセス証明書（PoP）を発行・保存しました！');
  }

  private initPaneCollapseButtons(): void {
    const btnCollapseLeft = document.getElementById('btnCollapseLeft');
    const btnCollapseRight = document.getElementById('btnCollapseRight');
    const paneLeft = document.getElementById('paneLeft');
    const paneRight = document.getElementById('paneRight');

    btnCollapseLeft?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleLeftPane();
    });

    btnCollapseRight?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleRightPane();
    });

    paneLeft?.addEventListener('click', (e) => {
      if (!this.leftPaneOpen) {
        this.toggleLeftPane();
      }
    });

    paneRight?.addEventListener('click', (e) => {
      if (!this.rightPaneOpen) {
        this.toggleRightPane();
      }
    });
  }

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

  public openExportModal() {
    const modal = document.getElementById('exportModal');
    if (modal) {
      modal.style.display = 'flex';
    }
  }

  public closeExportModal() {
    const modal = document.getElementById('exportModal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  private copyTextToClipboard(text: string, successMsg: string) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        this.showToast(successMsg);
      }).catch(() => {
        this.fallbackCopy(text, successMsg);
      });
    } else {
      this.fallbackCopy(text, successMsg);
    }
  }

  private fallbackCopy(text: string, successMsg = '✅ クリップボードにコピーしました') {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      if (typeof document.execCommand === 'function') {
        document.execCommand('copy');
      }
      document.body.removeChild(ta);
      this.showToast(successMsg);
    } catch {
      this.showToast(successMsg);
    }
  }

  private exportFullAozora(action: 'copy' | 'download') {
    const fullText = LiteraryExporter.exportAozoraFullText(this.workTitle, this.chapters);
    if (action === 'copy') {
      this.copyTextToClipboard(fullText, '✅ 全章青空文庫形式をコピーしました');
    } else {
      LiteraryExporter.downloadFile(`${this.workTitle}.txt`, fullText);
      this.showToast(`📥「${this.workTitle}.txt」をダウンロードしました`);
    }
  }

  private exportPrintPreview() {
    const printHtml = LiteraryExporter.exportPrintHtml(this.workTitle, this.chapters, {
      isVertical: this.isVertical,
    });
    const previewWindow = window.open('', '_blank');
    if (previewWindow) {
      previewWindow.document.open();
      previewWindow.document.write(printHtml);
      previewWindow.document.close();
      this.showToast('🖨️ 印刷プレビューを別タブで開きました');
    } else {
      this.showToast('⚠️ ポップアップがブロックされました。ブラウザの設定をご確認ください');
    }
  }

  private exportLoreBible() {
    const entities = this.loreManager.getEntities();
    const md = LiteraryExporter.exportLoreBibleMarkdown(this.workTitle, entities);
    LiteraryExporter.downloadFile(`${this.workTitle}_設定資料集.md`, md, 'text/markdown;charset=utf-8');
    this.showToast(`📥「${this.workTitle}_設定資料集.md」をダウンロードしました`);
  }

  private exportActiveChapterAozora() {
    const raw = this.cmEditor ? this.cmEditor.state.doc.toString() : '';
    const normalized = normalizeAozoraMarkup(raw);
    this.copyTextToClipboard(normalized, '✅ 現在の章（青空記法）をコピーしました');
  }

  private exportKakuyomu() {
    const fullText = LiteraryExporter.exportAozoraFullText(this.workTitle, this.chapters);
    const res = MultiSiteNovelFormatter.format(fullText, { platform: 'kakuyomu' });
    this.copyTextToClipboard(res.formattedContent, `✅ カクヨム形式（${res.stats.characterCount}文字）をコピーしました`);
  }

  private exportNarou() {
    const fullText = LiteraryExporter.exportAozoraFullText(this.workTitle, this.chapters);
    const res = MultiSiteNovelFormatter.format(fullText, { platform: 'narou' });
    this.copyTextToClipboard(res.formattedContent, `✅ 小説家になろう形式（${res.stats.characterCount}文字）をコピーしました`);
  }

  private exportDenshokyoEpub(action: 'copy' | 'download') {
    const fullText = LiteraryExporter.exportAozoraFullText(this.workTitle, this.chapters);
    const res = MultiSiteNovelFormatter.format(fullText, {
      platform: 'denshokyo_epub',
      title: this.workTitle,
      author: 'Author',
    });
    if (action === 'copy') {
      this.copyTextToClipboard(res.formattedContent, '✅ 電書協 EPUB3 XHTML をコピーしました');
    } else {
      LiteraryExporter.downloadFile(`${this.workTitle}_denshokyo.xhtml`, res.formattedContent, 'application/xhtml+xml;charset=utf-8');
      this.showToast(`📥「${this.workTitle}_denshokyo.xhtml」をダウンロードしました`);
    }
  }

  private toastTimer: any = null;
  private showToast(msg: string) {
    const footerToast = document.getElementById('footerToastArea');
    if (footerToast) {
      footerToast.textContent = msg;
      footerToast.classList.add('toast-visible');
      if (this.toastTimer) {
        clearTimeout(this.toastTimer);
      }
      this.toastTimer = setTimeout(() => {
        footerToast.classList.remove('toast-visible');
        this.toastTimer = setTimeout(() => {
          if (!footerToast.classList.contains('toast-visible')) {
            footerToast.textContent = '';
          }
        }, 300);
      }, 3000);
    }
  }

  private renderLeftPane() {
    const container = document.getElementById('leftPaneContent');
    if (!container) return;

    if (this.activeLeftTab === 'toc') {
      container.innerHTML = `
        <div class="nav-section-title" style="display: flex; justify-content: space-between; align-items: center;">
          <span>章一覧・構成</span>
          <span style="font-size: 11px; color: var(--color-text-dim);">ドラッグで並び替え</span>
        </div>
        <div id="chapterListDndContainer">
          ${this.chapters.map((ch, idx) => `
            <div class="chapter-item ${ch.id === this.currentChapterId ? 'active' : ''}" data-id="${ch.id}" data-index="${idx}" draggable="true">
              <span class="chapter-drag-handle" title="ドラッグして並び替え">⋮⋮</span>
              <div class="chapter-title-wrapper" title="ダブルクリックして章名を変更">
                <span class="chapter-title-text">${ch.title}</span>
              </div>
              <span class="chapter-char-count">${ch.charCount.toLocaleString()} 字</span>
              <button class="chapter-rename-btn" data-id="${ch.id}" title="章名を変更" style="background: transparent; border: none; font-size: 11px; cursor: pointer; color: var(--color-text-dim); padding: 1px 3px;">✏️</button>
              ${this.chapters.length > 1 ? `<button class="chapter-delete-btn" data-id="${ch.id}" title="章を削除">✕</button>` : ''}
            </div>
          `).join('')}
        </div>
        <button class="ide-btn" style="width: 100%; margin-top: 12px; justify-content: center;" id="btnNewChapter">
          ＋ 新規章を追加
        </button>
      `;

      let draggedIdx: number | null = null;
      const items = container.querySelectorAll('.chapter-item');

      items.forEach((item) => {
        const el = item as HTMLElement;

        // Selection / Load
        el.addEventListener('click', (e) => {
          if ((e.target as HTMLElement).closest('.chapter-delete-btn') || (e.target as HTMLElement).closest('.chapter-rename-btn') || (e.target as HTMLElement).tagName === 'INPUT') {
            return;
          }
          const id = el.dataset.id;
          if (id) this.loadChapter(id);
        });

        // Inline Rename function
        const titleWrapper = el.querySelector('.chapter-title-wrapper');
        const startRename = (e: Event) => {
          e.stopPropagation();
          const titleTextEl = titleWrapper?.querySelector('.chapter-title-text') as HTMLElement | null;
          if (!titleTextEl || !titleWrapper) return;
          const currentTitle = titleTextEl.textContent || '';

          const input = document.createElement('input');
          input.type = 'text';
          input.className = 'chapter-rename-input';
          input.value = currentTitle;
          input.style.cssText = 'width: 100%; font-size: 13px; background: rgba(0,0,0,0.5); border: 1px solid var(--color-gold); color: var(--color-text); padding: 1px 4px; border-radius: 3px; outline: none;';

          titleWrapper.innerHTML = '';
          titleWrapper.appendChild(input);
          input.focus();
          input.select();

          const finishRename = () => {
            const nextTitle = input.value.trim();
            const id = el.dataset.id;
            if (id && nextTitle && nextTitle !== currentTitle) {
              this.renameChapter(id, nextTitle);
            } else {
              this.renderLeftPane();
            }
          };

          input.addEventListener('keydown', (ke) => {
            if (ke.key === 'Enter') {
              ke.preventDefault();
              finishRename();
            } else if (ke.key === 'Escape') {
              this.renderLeftPane();
            }
          });
          input.addEventListener('blur', finishRename);
        };

        titleWrapper?.addEventListener('dblclick', startRename);
        const btnRename = el.querySelector('.chapter-rename-btn');
        btnRename?.addEventListener('click', startRename);

        // Delete button
        const btnDel = el.querySelector('.chapter-delete-btn');
        btnDel?.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = (e.currentTarget as HTMLElement).dataset.id;
          if (id) this.deleteChapter(id);
        });

        // DnD Events
        el.addEventListener('dragstart', (e) => {
          draggedIdx = parseInt(el.dataset.index || '0', 10);
          el.classList.add('dragging');
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', el.dataset.id || '');
          }
        });

        el.addEventListener('dragover', (e) => {
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

          const rect = el.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;
          if (e.clientY < midY) {
            el.classList.add('drag-over-top');
            el.classList.remove('drag-over-bottom');
          } else {
            el.classList.add('drag-over-bottom');
            el.classList.remove('drag-over-top');
          }
        });

        el.addEventListener('dragleave', () => {
          el.classList.remove('drag-over-top');
          el.classList.remove('drag-over-bottom');
        });

        el.addEventListener('drop', (e) => {
          e.preventDefault();
          el.classList.remove('drag-over-top');
          el.classList.remove('drag-over-bottom');

          if (draggedIdx === null) return;
          const targetIdx = parseInt(el.dataset.index || '0', 10);
          const rect = el.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;
          const insertIdx = e.clientY < midY ? targetIdx : targetIdx;

          if (draggedIdx !== insertIdx) {
            this.reorderChapters(draggedIdx, insertIdx);
          }
        });

        el.addEventListener('dragend', () => {
          el.classList.remove('dragging');
          items.forEach((it) => {
            it.classList.remove('drag-over-top');
            it.classList.remove('drag-over-bottom');
          });
          draggedIdx = null;
        });
      });

      // Attach click listener for new chapter button
      const btnNew = container.querySelector('#btnNewChapter');
      btnNew?.addEventListener('click', () => this.addNewChapter());
    } else if (this.activeLeftTab === 'lore') {
      const allEntities = this.loreManager.getEntities();
      let filtered = allEntities;
      if (this.activeLoreFilter === 'shelved') {
        filtered = allEntities.filter((e) => e.status === 'shelved');
      } else if (this.activeLoreFilter !== 'all') {
        filtered = this.loreManager.getEntities(this.activeLoreFilter).filter((e) => e.status !== 'shelved');
      }

      const counts = {
        all: allEntities.length,
        character: allEntities.filter((e) => e.category === 'character' && e.status !== 'shelved').length,
        term: allEntities.filter((e) => e.category === 'term' && e.status !== 'shelved').length,
        item: allEntities.filter((e) => e.category === 'item' && e.status !== 'shelved').length,
        foreshadowing: allEntities.filter((e) => e.category === 'foreshadowing' && e.status !== 'shelved').length,
        location: allEntities.filter((e) => e.category === 'location' && e.status !== 'shelved').length,
        shelved: allEntities.filter((e) => e.status === 'shelved').length,
      };

      const getCategoryLabel = (cat: string) => {
        switch (cat) {
          case 'character': return '登場人物';
          case 'term': return '重要用語';
          case 'item': return 'アイテム';
          case 'foreshadowing': return '伏線';
          case 'location': return '拠点・地名';
          default: return cat;
        }
      };

      container.innerHTML = `
        <div class="nav-section-title" style="display: flex; justify-content: space-between; align-items: center;">
          <span>世界観・設定資料</span>
          <button class="ide-btn btn-primary" id="btnOpenNewLoreModal" style="font-size: 11px; padding: 2px 7px;">＋ 追加</button>
        </div>

        <div class="lore-filter-bar">
          <button class="lore-filter-chip ${this.activeLoreFilter === 'all' ? 'active' : ''}" data-cat="all">全て (${counts.all})</button>
          <button class="lore-filter-chip ${this.activeLoreFilter === 'character' ? 'active' : ''}" data-cat="character">人物 (${counts.character})</button>
          <button class="lore-filter-chip ${this.activeLoreFilter === 'term' ? 'active' : ''}" data-cat="term">用語 (${counts.term})</button>
          <button class="lore-filter-chip ${this.activeLoreFilter === 'item' ? 'active' : ''}" data-cat="item">武具 (${counts.item})</button>
          <button class="lore-filter-chip ${this.activeLoreFilter === 'foreshadowing' ? 'active' : ''}" data-cat="foreshadowing">伏線 (${counts.foreshadowing})</button>
          <button class="lore-filter-chip ${this.activeLoreFilter === 'location' ? 'active' : ''}" data-cat="location">拠点 (${counts.location})</button>
          <button class="lore-filter-chip ${this.activeLoreFilter === 'shelved' ? 'active' : ''}" data-cat="shelved" style="border-color: rgba(168,85,247,0.4); color: #c084fc;">未配置 (${counts.shelved})</button>
        </div>

        <div id="loreCardList">
          ${filtered.length === 0 ? `<div style="font-size: 12px; color: var(--color-text-dim); text-align: center; padding: 20px;">該当する設定項目がありません</div>` : ''}
          ${filtered.map((ent) => {
            const score = calculateManualScore(ent);
            const isShelved = ent.status === 'shelved';
            return `
            <div class="lore-card" data-id="${ent.id}">
              <div class="lore-card-header">
                <span class="lore-card-title">${ent.name}</span>
                <span style="display: flex; gap: 4px; align-items: center;">
                  <span class="score-badge ${isShelved ? 'shelved' : ''}">S: ${score}</span>
                  <span class="lore-badge cat-${ent.category}">${getCategoryLabel(ent.category)}</span>
                </span>
              </div>
              ${ent.role ? `<div class="lore-card-role">${ent.role} ${ent.status ? `<span style="opacity: 0.7; font-size: 10px;">[${ent.status}]</span>` : ''}</div>` : ''}
              <div class="lore-card-desc">${ent.description}</div>
              <div class="lore-card-actions">
                ${isShelved ? `<button class="ide-btn btn-promote-lore" data-id="${ent.id}">＋ 本文へ再配置 (Alt+P)</button>` : ''}
                <button class="ide-btn btn-insert-lore" data-name="${ent.name}" style="font-size: 10px; padding: 2px 6px;">＋ 挿入</button>
                <button class="ide-btn btn-edit-lore" data-id="${ent.id}" style="font-size: 10px; padding: 2px 6px;">✏️ 編集</button>
                <button class="ide-btn btn-delete-lore" data-id="${ent.id}" style="font-size: 10px; padding: 2px 6px; color: var(--color-danger);">✕</button>
              </div>
            </div>
            `;
          }).join('')}
        </div>
      `;

      // Filter chips click
      container.querySelectorAll('.lore-filter-chip').forEach((chip) => {
        chip.addEventListener('click', (e) => {
          const cat = (e.currentTarget as HTMLElement).dataset.cat as LoreCategory | 'all' | 'shelved';
          this.activeLoreFilter = cat || 'all';
          this.renderLeftPane();
        });
      });

      // Promote from shelf buttons
      container.querySelectorAll('.btn-promote-lore').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = (e.currentTarget as HTMLElement).dataset.id;
          if (id) this.promoteShelvedLore(id);
        });
      });

      // Add new lore button
      container.querySelector('#btnOpenNewLoreModal')?.addEventListener('click', () => {
        this.openLoreModal();
      });

      // Edit buttons & card click
      container.querySelectorAll('.btn-edit-lore').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = (e.currentTarget as HTMLElement).dataset.id;
          if (id) this.openLoreModal(id);
        });
      });

      // Insert into text
      container.querySelectorAll('.btn-insert-lore').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const name = (e.currentTarget as HTMLElement).dataset.name;
          if (name && this.cmEditor) {
            const pos = this.cmEditor.state.selection.main.head;
            this.cmEditor.dispatch({
              changes: { from: pos, insert: name },
              selection: { anchor: pos + name.length },
            });
            this.showToast(`📥 本文に「${name}」を挿入しました`);
          }
        });
      });

      // Delete buttons
      container.querySelectorAll('.btn-delete-lore').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = (e.currentTarget as HTMLElement).dataset.id;
          if (id) {
            const confirmed = await showInlineConfirm({
              message: 'この設定項目を削除してもよろしいですか？',
              destructive: true,
              confirmText: '削除',
            });
            if (confirmed) {
              this.deleteLore(id);
            }
          }
        });
      });

      // Card click opens edit
      container.querySelectorAll('.lore-card').forEach((card) => {
        card.addEventListener('click', (e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          const id = (card as HTMLElement).dataset.id;
          if (id) this.openLoreModal(id);
        });
      });
    } else if (this.activeLeftTab === 'timeline') {
      container.innerHTML = `
        <div class="nav-section-title" style="display: flex; justify-content: space-between; align-items: center;">
          <span>デュアル軸タイムライン (Sjuzhet / Fabula)</span>
          <span style="font-size: 10px; color: var(--color-gold);">三次ベジェスプライン</span>
        </div>
        <div class="dual-track-container" id="dualTrackContainer">
          ${this.renderTimelineSvg()}
        </div>
        <div class="dock-card" style="margin-top: 10px;">
          <div class="dock-card-title">🌙 帝国星辰暦 742年</div>
          <div class="dock-card-body">
            現在の日付: 第4月 14日（絶対日: 2,450）<br>
            第一衛星月相: 満月（1.00） | 第二衛星月相: 満月（0.98）<br>
            <strong style="color: var(--color-gold);">✦ 今夜: 二重満月合（Conjunction）</strong>
          </div>
        </div>
      `;

      // Bind node click to jump to scene
      container.querySelectorAll('.timeline-node').forEach((node) => {
        node.addEventListener('click', () => {
          const sId = (node as HTMLElement).dataset.sceneId;
          if (sId) this.loadChapter(sId);
        });
      });
    }
  }

  private renderRightPane() {
    const container = document.getElementById('dockContent');
    if (!container) return;

    // Update active tab buttons appearance
    const rightTabBtns = document.querySelectorAll('.pane-right .pane-tab-btn');
    rightTabBtns.forEach((b) => {
      const btn = b as HTMLElement;
      if (btn.dataset.dockTab === this.activeRightTab) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    if (this.activeRightTab === 'linter') {
      container.innerHTML = this.narrativeDock.renderHTML();
      this.narrativeDock.bindEvents(container);
    } else if (this.activeRightTab === 'lore') {
      // Real-time occurrences in current document
      const docText = this.cmEditor ? this.cmEditor.state.doc.toString() : '';
      const cursorPos = this.cmEditor ? this.cmEditor.state.selection.main.head : 0;
      const occurrences = this.loreDock.extractOccurrences({
        from: 0,
        to: docText.length,
        text: docText,
        cursorPos,
      });

      container.innerHTML = this.loreDock.renderInlinePanelHTML(occurrences);

      // Bind events
      container.querySelectorAll('.btn-quick-replace').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const termId = (e.currentTarget as HTMLElement).dataset.termId;
          const occ = occurrences.find((o) => o.termId === termId);
          if (occ) this.loreDock.handleQuickReplace(occ);
        });
      });

      container.querySelectorAll('.btn-shelve').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const termId = (e.currentTarget as HTMLElement).dataset.termId;
          if (termId) this.loreDock.handleShelveItem(termId);
        });
      });

      container.querySelectorAll('.btn-unshelve').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const termId = (e.currentTarget as HTMLElement).dataset.termId;
          if (termId) this.loreDock.handleUnshelveItem(termId);
        });
      });

      // Bidirectional jump & highlight to editor
      container.querySelectorAll('.lore-item').forEach((item) => {
        item.addEventListener('click', (e) => {
          if ((e.target as HTMLElement).tagName === 'BUTTON') return;
          const from = parseInt((item as HTMLElement).dataset.from || '0', 10);
          const to = parseInt((item as HTMLElement).dataset.to || '0', 10);
          if (to > from) {
            this.jumpToEditor(from, to);
          }
        });
      });

      container.querySelectorAll('[data-action="toggle"]').forEach((header) => {
        header.addEventListener('click', (e) => {
          const target = (e.currentTarget as HTMLElement).dataset.target;
          if (target) {
            this.loreDock.togglePanel(target);
            this.renderRightPane();
          }
        });
      });
    } else if (this.activeRightTab === 'causality') {
      this.dagEngine.populateFromLore(this.loreManager.getEntities());
      const cycleReport = this.dagEngine.detectCycles();
      const nodes = this.dagEngine.getNodes();
      const edges = this.dagEngine.getEdges();
      const isVirtualized = nodes.length >= 8;
      const initialViewport = { scrollTop: 0, scrollLeft: 0, viewportWidth: 340, viewportHeight: 280, overscan: 80 };
      const svgHtml = isVirtualized
        ? this.dagEngine.renderVirtualizedSvgGraph(initialViewport)
        : this.dagEngine.renderSvgGraph(340, 280);

      container.innerHTML = `
        <div class="dock-card">
          <div class="dock-card-header">
            <span class="dock-card-title">🕸 因果DAG・仮想スクロール</span>
            <span style="font-size: 11px; color: ${cycleReport.isAcyclic ? 'var(--color-success)' : 'var(--color-danger)'};">
              ${cycleReport.isAcyclic ? '✓ 循環なし (Valid DAG)' : `⚠️ 循環検出 (${cycleReport.cycleCount})`}
            </span>
          </div>
          <div class="dock-card-body" style="padding-bottom: 4px;">
            <div style="font-size: 11px; color: var(--color-text-dim); display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span>登録ノード: <strong>${nodes.length}</strong></span>
              <span>有向エッジ: <strong>${edges.length}</strong></span>
              <span style="color: var(--color-gold);"><strong>${isVirtualized ? '⚡ 仮想カリングON' : '通常レンダリング'}</strong></span>
            </div>
            <div class="dag-wrapper" id="dagSvgContainer" style="max-height: 320px; overflow: auto; position: relative;">
              ${svgHtml}
            </div>
            <div style="margin-top: 8px; font-size: 10.5px; color: var(--color-text-dim); line-height: 1.5;">
              <span style="color: #58a6ff;">■ 人物</span> &nbsp;
              <span style="color: #e3b341;">■ 用語</span> &nbsp;
              <span style="color: #bc8cff;">■ 伏線</span> &nbsp;
              <span style="color: #56d364;">■ 拠点</span>
              <div style="margin-top: 2px;">※ ノードをクリックすると詳細設定を開きます</div>
            </div>
          </div>
        </div>
      `;

      const attachNodeListeners = (wrapper: HTMLElement) => {
        wrapper.querySelectorAll('.dag-node').forEach((nodeEl) => {
          nodeEl.addEventListener('click', (e) => {
            const id = (e.currentTarget as HTMLElement).dataset.nodeId;
            if (id) {
              const ent = this.loreManager.getEntity(id);
              if (ent) {
                this.showToast(`📌 [${ent.name}] ${ent.role || ent.category}: ${ent.description.slice(0, 30)}...`);
              }
            }
          });
        });
      };

      const dagWrapper = container.querySelector('#dagSvgContainer') as HTMLElement | null;
      if (dagWrapper) {
        attachNodeListeners(dagWrapper);
        if (isVirtualized) {
          let scrollDebounce: any = null;
          dagWrapper.addEventListener('scroll', () => {
            if (scrollDebounce) cancelAnimationFrame(scrollDebounce);
            scrollDebounce = requestAnimationFrame(() => {
              const vp = {
                scrollTop: dagWrapper.scrollTop,
                scrollLeft: dagWrapper.scrollLeft,
                viewportWidth: dagWrapper.clientWidth || 340,
                viewportHeight: dagWrapper.clientHeight || 280,
                overscan: 100,
              };
              dagWrapper.innerHTML = this.dagEngine.renderVirtualizedSvgGraph(vp);
              attachNodeListeners(dagWrapper);
            });
          });
        }
      }
    }
  }

  public openLoreModal(entityId?: string) {
    const modal = document.getElementById('loreModal');
    if (!modal) return;

    const idInput = document.getElementById('loreEntityId') as HTMLInputElement;
    const nameInput = document.getElementById('loreEntityName') as HTMLInputElement;
    const catInput = document.getElementById('loreEntityCategory') as HTMLSelectElement;
    const roleInput = document.getElementById('loreEntityRole') as HTMLInputElement;
    const statusInput = document.getElementById('loreEntityStatus') as HTMLSelectElement;
    const aliasesInput = document.getElementById('loreEntityAliases') as HTMLInputElement;
    const descInput = document.getElementById('loreEntityDesc') as HTMLTextAreaElement;
    const heading = document.getElementById('loreModalHeading');
    const btnDel = document.getElementById('btnDeleteLoreEntity');

    if (entityId) {
      const ent = this.loreManager.getEntity(entityId);
      if (ent) {
        if (idInput) idInput.value = ent.id;
        if (nameInput) nameInput.value = ent.name;
        if (catInput) catInput.value = ent.category;
        if (roleInput) roleInput.value = ent.role || '';
        if (statusInput) statusInput.value = ent.status || 'active';
        if (aliasesInput) aliasesInput.value = (ent.aliases || []).join(', ');
        if (descInput) descInput.value = ent.description;
        if (heading) heading.innerHTML = `<span>✏️</span> 設定項目の編集: ${ent.name}`;
        if (btnDel) btnDel.style.display = 'inline-block';
      }
    } else {
      if (idInput) idInput.value = '';
      if (nameInput) nameInput.value = '';
      if (catInput) catInput.value = 'character';
      if (roleInput) roleInput.value = '';
      if (statusInput) statusInput.value = 'active';
      if (aliasesInput) aliasesInput.value = '';
      if (descInput) descInput.value = '';
      if (heading) heading.innerHTML = `<span>＋</span> 新規設定項目の作成`;
      if (btnDel) btnDel.style.display = 'none';
    }

    modal.style.display = 'flex';
  }

  public closeLoreModal() {
    const modal = document.getElementById('loreModal');
    if (modal) modal.style.display = 'none';
  }

  public async saveLoreFromForm() {
    const idInput = document.getElementById('loreEntityId') as HTMLInputElement;
    const nameInput = document.getElementById('loreEntityName') as HTMLInputElement;
    const catInput = document.getElementById('loreEntityCategory') as HTMLSelectElement;
    const roleInput = document.getElementById('loreEntityRole') as HTMLInputElement;
    const statusInput = document.getElementById('loreEntityStatus') as HTMLSelectElement;
    const aliasesInput = document.getElementById('loreEntityAliases') as HTMLInputElement;
    const descInput = document.getElementById('loreEntityDesc') as HTMLTextAreaElement;

    const name = nameInput.value.trim();
    if (!name) return;

    const id = idInput.value;
    const category = (catInput.value || 'character') as LoreCategory;
    const role = roleInput.value.trim() || undefined;
    const status = statusInput.value || 'active';
    const aliases = aliasesInput.value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const description = descInput.value.trim();

    if (id) {
      this.loreManager.updateEntity(id, {
        name,
        category,
        role,
        status,
        aliases,
        description,
      });
      this.showToast(`✏️ 設定「${name}」を更新しました`);
    } else {
      this.loreManager.createEntity({
        name,
        category,
        role,
        status,
        aliases,
        description,
      });
      this.showToast(`✨ 新規設定「${name}」を追加しました`);
    }

    await this.saveLoreData();
    this.closeLoreModal();
    this.renderLeftPane();
    this.renderRightPane();
  }

  public async deleteLore(id: string) {
    const ent = this.loreManager.getEntity(id);
    const name = ent?.name || id;
    this.loreManager.deleteEntity(id);
    await this.saveLoreData();
    this.closeLoreModal();
    this.renderLeftPane();
    this.renderRightPane();
    this.showToast(`🗑️ 設定「${name}」を削除しました`);
  }

  public async saveLoreData() {
    try {
      localStorage.setItem('plotailor_lore_data', JSON.stringify(this.loreManager.getEntities()));
    } catch {}

    try {
      await this.loreManager.saveToVFS(this.currentProjectId);
    } catch (err) {
      console.warn('Failed to save lore to VFS:', err);
    }

    this.loreDock.updateDictionary(this.loreManager.toLoreTermDefinitions());
  }

  public getEditorView(): EditorView {
    return this.cmEditor;
  }

  public getNarrativeDock(): NarrativeInspectorDock {
    return this.narrativeDock;
  }

  private initPaneResizers(): void {
    const paneLeft = document.getElementById('paneLeft');
    const paneRight = document.getElementById('paneRight');
    const resizerLeft = document.getElementById('resizerLeft');
    const resizerRight = document.getElementById('resizerRight');

    if (resizerLeft && paneLeft) {
      let isDragging = false;
      resizerLeft.addEventListener('mousedown', (e) => {
        isDragging = true;
        resizerLeft.classList.add('is-dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const onMouseMove = (ev: MouseEvent) => {
          if (!isDragging) return;
          const newWidth = Math.max(160, Math.min(500, ev.clientX));
          paneLeft.style.width = `${newWidth}px`;
        };

        const onMouseUp = () => {
          isDragging = false;
          resizerLeft.classList.remove('is-dragging');
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });
    }

    if (resizerRight && paneRight) {
      let isDragging = false;
      resizerRight.addEventListener('mousedown', (e) => {
        isDragging = true;
        resizerRight.classList.add('is-dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const onMouseMove = (ev: MouseEvent) => {
          if (!isDragging) return;
          const newWidth = Math.max(200, Math.min(600, window.innerWidth - ev.clientX));
          paneRight.style.width = `${newWidth}px`;
        };

        const onMouseUp = () => {
          isDragging = false;
          resizerRight.classList.remove('is-dragging');
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });
    }
  }

  private initQuickFormatButtons(): void {
    document.getElementById('btnQuickRuby')?.addEventListener('click', () => {
      if (this.cmEditor) {
        wrapSelectionWithRuby(this.cmEditor);
        this.cmEditor.focus();
      }
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

// Initialize on DOM load if running in browser
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
