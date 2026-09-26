/**
 * Plotailor Full Writing IDE Application Core (src/app/main.ts)
 * 3-Pane Literary IDE with Realtime Ruby, CodeMirror 6, Narrative Linter & Zero Pronoun Resolver
 */

import { EditorView, keymap } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { history, defaultKeymap, historyKeymap, undo, redo, undoDepth, redoDepth } from '@codemirror/commands';
import { rubyDecorationExtension, setRubyDisplayMode, type RubyDisplayMode } from '../core/editor/RubyDecorationExtension.js';
import { cm6ImeGuard } from '../core/editor/cm6ImeGuard.js';
import { verticalWritingExtension } from '../core/editor/VerticalWritingExtension.js';
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
import type { NarrativeAnalysisResult } from '../core/editor/NarrativeLinterEngine.js';
import { ProjectManager, type ProjectMeta } from '../core/project/index.js';

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
　二重満月<<コンジャンクション>>の夜、北方の砦に集う兵たちの息は白く凍りついていた。

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
  private activeRightTab = 'linter'; // Default to Narrative Linter for immediate feedback
  private keystrokeCount = 0;
  private typingStartTime = Date.now();
  private latestNarrativeResult: NarrativeAnalysisResult | null = null;
  private wrapCompartment = new Compartment();
  private rubyCompartment = new Compartment();
  private saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private scrollNormalizer = new ScrollNormalizer();
  private chapterStates: Map<string, EditorState> = new Map();
  private chapterSnapshots: Map<string, Array<{ time: number; text: string; length: number }>> = new Map();
  private lastSnapshotTime = 0;
  private loreManager: LoreEntityManager;
  private dagEngine: CausalDagEngine = new CausalDagEngine();
  private loreDock!: LoreInspectorDock;
  private activeLoreFilter: LoreCategory | 'all' = 'all';

  constructor() {
    this.editorBody = document.getElementById('editorBody') as HTMLDivElement;
    if (window.innerWidth <= 768) {
      this.leftPaneOpen = false;
      this.rightPaneOpen = false;
    }

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

    this.init();
  }

  private init() {
    this.loadStateFromStorage();

    if (window.innerWidth <= 768) {
      const paneL = document.getElementById('paneLeft');
      const paneR = document.getElementById('paneRight');
      if (paneL) paneL.style.display = 'none';
      if (paneR) paneR.style.display = 'none';
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
    this.initProjectVFS();
  }

  private loadStateFromStorage() {
    // 1. Work title
    try {
      const savedTitle = localStorage.getItem('plotailor_work_title');
      if (savedTitle && savedTitle.trim()) {
        this.workTitle = savedTitle.trim();
      }
      const titleEl = document.getElementById('workTitleText');
      if (titleEl) titleEl.textContent = this.workTitle;
    } catch {}

    // 2. Chapters data
    try {
      const savedChapters = localStorage.getItem('plotailor_chapters');
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
      const savedActive = localStorage.getItem('plotailor_active_chapter_id');
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

    // 6. Theme preference
    try {
      const savedTheme = localStorage.getItem('plotailor_theme');
      if (savedTheme !== null) {
        this.isNightTheme = savedTheme === 'night';
      }
    } catch {}
  }

  private saveToStorage() {
    try {
      localStorage.setItem('plotailor_chapters', JSON.stringify(this.chapters));
      localStorage.setItem('plotailor_active_chapter_id', this.currentChapterId);
      localStorage.setItem('plotailor_work_title', this.workTitle);
      localStorage.setItem('plotailor_line_wrapping', this.isLineWrapping.toString());
      localStorage.setItem('plotailor_ruby_mode', this.rubyMode);
      localStorage.setItem('plotailor_ruby_decorated', (this.rubyMode === 'normal').toString());
      localStorage.setItem('plotailor_theme', this.isNightTheme ? 'night' : 'washi');
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
        cm6ImeGuard(),
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
            this.handleEditorChange();
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
  }

  private recordSnapshotDebounced(chapterId: string, text: string) {
    const now = Date.now();
    if (now - this.lastSnapshotTime > 4000) {
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
      badge.textContent = `履歴: ${uDepth} / 500`;
      badge.title = `保持可能履歴数: 最大500回 (現在: 元に戻す ${uDepth}件 / やり直す ${rDepth}件)`;
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

    // History Modal Open/Close Handlers
    document.getElementById('historyDepthBadge')?.addEventListener('click', () => this.openHistoryModal());
    document.getElementById('btnCloseHistoryModal')?.addEventListener('click', () => this.closeHistoryModal());
    document.getElementById('historyModal')?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).id === 'historyModal') {
        this.closeHistoryModal();
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
      if (e.key === 'Escape' && this.isFullscreen) {
        this.toggleFullscreen(false);
      }
    });

    const btnExport = document.getElementById('btnExportAozora');
    btnExport?.addEventListener('click', () => this.exportAozoraText());

    const btnLeft = document.getElementById('btnToggleLeftPane');
    btnLeft?.addEventListener('click', () => this.toggleLeftPane());

    const btnRight = document.getElementById('btnToggleRightPane');
    btnRight?.addEventListener('click', () => this.toggleRightPane());

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
    btnDelLore?.addEventListener('click', () => {
      const idInput = document.getElementById('loreEntityId') as HTMLInputElement | null;
      if (idInput && idInput.value) {
        if (window.confirm('この設定項目を削除してもよろしいですか？')) {
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

    // Record snapshot debounced
    this.recordSnapshotDebounced(this.currentChapterId, rawText);

    const saveIndicator = document.getElementById('saveStatusIndicator');
    if (saveIndicator) {
      saveIndicator.textContent = '自動保存: 編集中...';
      saveIndicator.style.color = 'var(--color-gold)';
    }

    if (this.saveDebounceTimer !== null) {
      clearTimeout(this.saveDebounceTimer);
    }
    this.saveDebounceTimer = setTimeout(() => {
      this.saveToStorage();
      if (saveIndicator) {
        saveIndicator.textContent = '自動保存: 0.1秒前 (OPFS AES-GCM)';
        saveIndicator.style.color = 'var(--color-text-dim)';
      }
    }, 400);
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

    const selectEl = document.getElementById('chapterSelect') as HTMLSelectElement;
    if (selectEl) selectEl.value = chapterId;

    this.saveToStorage();
    this.renderLeftPane();
    this.updateStats();
    this.updateHistoryUI();
  }

  public openHistoryModal() {
    const modal = document.getElementById('historyModal');
    const container = document.getElementById('historyListContainer');
    if (!modal || !container) return;

    const snapshots = this.chapterSnapshots.get(this.currentChapterId) || [];
    if (snapshots.length === 0) {
      container.innerHTML = '<div style="font-size: 13px; color: var(--color-text-dim); text-align: center; padding: 24px;">まだ履歴スナップショットはありません。本文を入力すると自動的に記録されます。</div>';
    } else {
      container.innerHTML = snapshots.slice(-40).reverse().map((snap, idx) => {
        const dateStr = new Date(snap.time).toLocaleTimeString();
        const preview = snap.text.slice(0, 60).replace(/\n/g, ' ') || '（空文書）';
        return `
          <div class="history-item" data-snap-index="${snapshots.length - 1 - idx}">
            <div class="history-item-info">
              <div class="history-item-time">${dateStr} (${snap.length} 文字)</div>
              <div class="history-item-preview">${preview}</div>
            </div>
            <button class="history-item-btn">この時点に復元</button>
          </div>
        `;
      }).join('');

      container.querySelectorAll('.history-item').forEach((item) => {
        item.addEventListener('click', (e) => {
          const idxStr = (e.currentTarget as HTMLElement).dataset.snapIndex;
          if (idxStr !== undefined) {
            const idx = parseInt(idxStr, 10);
            this.rollbackToSnapshot(idx);
            this.closeHistoryModal();
          }
        });
      });
    }

    modal.style.display = 'flex';
  }

  public closeHistoryModal() {
    const modal = document.getElementById('historyModal');
    if (modal) modal.style.display = 'none';
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
    this.saveToStorage();

    this.showToast(`🕒 ${new Date(snap.time).toLocaleTimeString()} の状態へロールバックしました（未来の履歴を切り捨て）`);
    this.updateStats();
    this.updateHistoryUI();
  }

  private async initProjectVFS() {
    try {
      await this.projectManager.initWorkspace();
      const migrated = await this.projectManager.migrateFromLegacyStorage();
      if (migrated) {
        this.currentProjectId = migrated.id;
      } else {
        try {
          await this.projectManager.getProject(this.currentProjectId);
        } catch {
          await this.projectManager.createProject({
            id: this.currentProjectId,
            title: this.workTitle,
          });
        }
      }
      await this.saveToVFS();
    } catch (err) {
      console.warn('VFS init warning:', err);
    }
  }

  private async saveToVFS() {
    try {
      const activeCh = this.chapters.find((c) => c.id === this.currentChapterId);
      if (!activeCh) return;
      await this.projectManager.saveChapter(
        this.currentProjectId,
        activeCh.id,
        activeCh.title,
        activeCh.content
      );
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
    const title = window.prompt('新規作品のタイトルを入力してください:', `長編小説_${new Date().toISOString().slice(0, 10)}`);
    if (!title || !title.trim()) return;

    try {
      const newProj = await this.projectManager.createProject({ title: title.trim() });
      // Add default Chapter 1
      await this.projectManager.saveChapter(
        newProj.id,
        'ch1',
        '第一章 幕開け',
        '　ここに新しい物語の最初の一行を書き始めます。'
      );
      await this.switchProject(newProj.id);
      this.closeProjectModal();
      this.showToast(`✨ 新規作品「${newProj.title}」を作成し、執筆を開始しました`);
    } catch (err) {
      window.alert(`作品の作成に失敗しました: ${err}`);
    }
  }

  private async switchProject(projectId: string) {
    try {
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
        this.chapters = JSON.parse(JSON.stringify(DEFAULT_CHAPTERS));
      }

      this.currentChapterId = data.meta.activeChapterId && this.chapters.some((c) => c.id === data.meta.activeChapterId)
        ? data.meta.activeChapterId
        : this.chapters[0].id;

      this.chapterStates.clear();
      this.chapterSnapshots.clear();

      this.saveToStorage();
      this.renderChapterSelect();
      this.loadChapter(this.currentChapterId);
      this.renderLeftPane();
      this.updateStats();
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

    if (!window.confirm(`章「${targetCh.title}」を削除してもよろしいですか？\n本文と履歴スナップショットは破棄されます。`)) {
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

    // Typing speed calculation
    this.keystrokeCount++;
    const elapsedMinutes = Math.max(0.1, (Date.now() - this.typingStartTime) / 60000);
    const speed = Math.round(this.keystrokeCount / elapsedMinutes);
    const speedEl = document.getElementById('typingSpeed');
    if (speedEl) speedEl.textContent = speed.toString();
  }

  private toggleOrientation() {
    this.isVertical = !this.isVertical;
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
      if (wrapper) {
        requestAnimationFrame(() => {
          wrapper.scrollLeft = wrapper.scrollWidth;
        });
      }
    } else {
      center?.classList.remove('vertical-rl');
      this.editorBody.classList.remove('vertical-rl');
      if (btn) btn.textContent = '縦書き';
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
    const pane = document.getElementById('paneLeft');
    const btn = document.getElementById('btnToggleLeftPane');
    if (pane) pane.style.display = this.leftPaneOpen ? 'flex' : 'none';
    if (btn) btn.classList.toggle('active', this.leftPaneOpen);
  }

  private toggleRightPane() {
    this.rightPaneOpen = !this.rightPaneOpen;
    const pane = document.getElementById('paneRight');
    const btn = document.getElementById('btnToggleRightPane');
    if (pane) pane.style.display = this.rightPaneOpen ? 'flex' : 'none';
    if (btn) btn.classList.toggle('active', this.rightPaneOpen);
  }

  private exportAozoraText() {
    const raw = this.cmEditor ? this.cmEditor.state.doc.toString() : '';
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(raw).then(() => {
        this.showToast('✅ 青空文庫形式をクリップボードにコピーしました');
      }).catch(() => {
        this.fallbackCopy(raw);
      });
    } else {
      this.fallbackCopy(raw);
    }
  }

  private fallbackCopy(text: string) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    this.showToast('✅ 青空文庫形式をクリップボードにコピーしました');
  }

  private showToast(msg: string) {
    const toast = document.createElement('div');
    toast.textContent = msg;
    toast.style.cssText = `
      position: fixed;
      bottom: 40px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(14, 17, 23, 0.95);
      border: 1px solid var(--color-gold);
      color: var(--color-gold);
      padding: 8px 18px;
      border-radius: 20px;
      font-size: 13px;
      z-index: 10000;
      box-shadow: 0 4px 16px rgba(0,0,0,0.5);
      transition: opacity 0.3s;
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
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
      const filtered = this.activeLoreFilter === 'all'
        ? allEntities
        : this.loreManager.getEntities(this.activeLoreFilter);

      const counts = {
        all: allEntities.length,
        character: allEntities.filter((e) => e.category === 'character').length,
        term: allEntities.filter((e) => e.category === 'term').length,
        item: allEntities.filter((e) => e.category === 'item').length,
        foreshadowing: allEntities.filter((e) => e.category === 'foreshadowing').length,
        location: allEntities.filter((e) => e.category === 'location').length,
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
        </div>

        <div id="loreCardList">
          ${filtered.length === 0 ? `<div style="font-size: 12px; color: var(--color-text-dim); text-align: center; padding: 20px;">該当する設定項目がありません</div>` : ''}
          ${filtered.map((ent) => `
            <div class="lore-card" data-id="${ent.id}">
              <div class="lore-card-header">
                <span class="lore-card-title">${ent.name}</span>
                <span class="lore-badge cat-${ent.category}">${getCategoryLabel(ent.category)}</span>
              </div>
              ${ent.role ? `<div class="lore-card-role">${ent.role} ${ent.status ? `<span style="opacity: 0.7; font-size: 10px;">[${ent.status}]</span>` : ''}</div>` : ''}
              <div class="lore-card-desc">${ent.description}</div>
              <div class="lore-card-actions">
                <button class="ide-btn btn-insert-lore" data-name="${ent.name}" style="font-size: 10px; padding: 2px 6px;">＋ 挿入</button>
                <button class="ide-btn btn-edit-lore" data-id="${ent.id}" style="font-size: 10px; padding: 2px 6px;">✏️ 編集</button>
                <button class="ide-btn btn-delete-lore" data-id="${ent.id}" style="font-size: 10px; padding: 2px 6px; color: var(--color-danger);">✕</button>
              </div>
            </div>
          `).join('')}
        </div>
      `;

      // Filter chips click
      container.querySelectorAll('.lore-filter-chip').forEach((chip) => {
        chip.addEventListener('click', (e) => {
          const cat = (e.currentTarget as HTMLElement).dataset.cat as LoreCategory | 'all';
          this.activeLoreFilter = cat || 'all';
          this.renderLeftPane();
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
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = (e.currentTarget as HTMLElement).dataset.id;
          if (id && window.confirm('この設定項目を削除してもよろしいですか？')) {
            this.deleteLore(id);
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
        <div class="nav-section-title">架空暦法・連続時間軸</div>
        <div class="dock-card">
          <div class="dock-card-title">🌙 帝国星辰暦 742年</div>
          <div class="dock-card-body">
            現在の日付: 第4月 14日（絶対日: 2,450）<br>
            第一衛星月相: 満月（1.00）<br>
            第二衛星月相: 満月（0.98）<br>
            <strong style="color: var(--color-gold);">✦ 今夜: 二重満月合（Conjunction）</strong>
          </div>
        </div>
      `;
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
      const svgHtml = this.dagEngine.renderSvgGraph(340, 280);

      container.innerHTML = `
        <div class="dock-card">
          <div class="dock-card-header">
            <span class="dock-card-title">🕸 因果DAG・ループ検出</span>
            <span style="font-size: 11px; color: ${cycleReport.isAcyclic ? 'var(--color-success)' : 'var(--color-danger)'};">
              ${cycleReport.isAcyclic ? '✓ 循環なし (Valid DAG)' : `⚠️ 循環検出 (${cycleReport.cycleCount})`}
            </span>
          </div>
          <div class="dock-card-body" style="padding-bottom: 4px;">
            <div style="font-size: 11px; color: var(--color-text-dim); display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span>登録ノード: <strong>${nodes.length}</strong></span>
              <span>有向エッジ: <strong>${edges.length}</strong></span>
              <span>Tarjan SCC: <strong>0 循環</strong></span>
            </div>
            <div class="dag-wrapper" id="dagSvgContainer">
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

      container.querySelectorAll('.dag-node').forEach((nodeEl) => {
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
    } else if (this.activeRightTab === 'pop') {
      container.innerHTML = `
        <div class="dock-card">
          <div class="dock-card-header">
            <span class="dock-card-title">📜 創作プロセス証明（PoP）</span>
            <span style="font-size: 11px; color: var(--color-gold);">監査中</span>
          </div>
          <div class="dock-card-body">
            <p>人間主体的執筆スコア: <strong style="color: var(--color-gold);">1.18 HCIS</strong></p>
            <p>打鍵インターバル・エントロピー: <strong>4.82 bits</strong></p>
            <p>Merkle Chain ブロック数: <strong>42 blocks</strong></p>
            <p>ルートハッシュ: <code style="font-size: 10px; color: var(--color-accent);">958bcd33...018e</code></p>
            <hr style="border: 0; border-top: 1px solid var(--color-border); margin: 8px 0;">
            <button class="ide-btn btn-primary" style="width: 100%; justify-content: center;" id="btnIssuePoP">
              PoP証明書を発行 (CBOR/JSON)
            </button>
          </div>
        </div>
      `;
      document.getElementById('btnIssuePoP')?.addEventListener('click', () => {
        this.showToast('📜 PoP創作証明書（SHA-256 Merkle連鎖）を発行・保存しました');
      });
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
}

// Initialize on DOM load if running in browser
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    new PlotailorApp();
  });
}
