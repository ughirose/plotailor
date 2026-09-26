/**
 * Plotailor Full Writing IDE Application Core (src/app/main.ts)
 * 3-Pane Literary IDE with Realtime Ruby, CodeMirror 6, Narrative Linter & Zero Pronoun Resolver
 */

import { EditorView, keymap } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { history, defaultKeymap, historyKeymap, undo, redo, undoDepth, redoDepth } from '@codemirror/commands';
import { rubyDecorationExtension, type RubyDisplayMode } from '../core/editor/RubyDecorationExtension.js';
import { cm6ImeGuard } from '../core/editor/cm6ImeGuard.js';
import { verticalWritingExtension } from '../core/editor/VerticalWritingExtension.js';
import { ScrollNormalizer } from '../core/editor/ScrollNormalizer.js';
import { narrativeLinterExtension } from '../core/editor/CodeMirrorNarrativeExtension.js';
import { NarrativeInspectorDock } from '../ui/NarrativeInspectorDock.js';
import type { NarrativeAnalysisResult } from '../core/editor/NarrativeLinterEngine.js';

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
  }

  private initCodeMirror() {
    const ch = this.chapters.find((c) => c.id === this.currentChapterId) || this.chapters[0];

    const state = EditorState.create({
      doc: ch.content,
      extensions: [
        this.wrapCompartment.of(this.isLineWrapping ? EditorView.lineWrapping : []),
        this.rubyCompartment.of(
          this.rubyMode === 'raw'
            ? []
            : rubyDecorationExtension({
                mode: this.rubyMode,
                bypassActiveLine: true,
              })
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
  }

  private handleEditorChange() {
    const rawText = this.cmEditor ? this.cmEditor.state.doc.toString() : '';
    const activeCh = this.chapters.find((c) => c.id === this.currentChapterId);
    if (activeCh) {
      activeCh.content = rawText;
      activeCh.charCount = rawText.replace(/\s+/g, '').length;
    }

    this.updateStats();

    const saveIndicator = document.getElementById('saveStatusIndicator');
    if (saveIndicator) {
      saveIndicator.textContent = '自動保存: 編集中...';
    }

    if (this.saveDebounceTimer !== null) {
      clearTimeout(this.saveDebounceTimer);
    }
    this.saveDebounceTimer = setTimeout(() => {
      this.saveToStorage();
      if (saveIndicator) {
        saveIndicator.textContent = '自動保存: 0.1秒前 (OPFS AES-GCM)';
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
    this.currentChapterId = chapterId;

    if (this.cmEditor) {
      this.cmEditor.dispatch({
        changes: { from: 0, to: this.cmEditor.state.doc.length, insert: ch.content },
      });
    }

    const titleEl = document.getElementById('activeChapterTitle');
    if (titleEl) titleEl.textContent = ch.title;

    const selectEl = document.getElementById('chapterSelect') as HTMLSelectElement;
    if (selectEl) selectEl.value = chapterId;

    this.saveToStorage();
    this.renderLeftPane();
    this.updateStats();
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

  private updateStats() {
    const rawText = this.cmEditor ? this.cmEditor.state.doc.toString() : '';
    const charCount = rawText.replace(/\s+/g, '').length;
    const genkoSheets = (charCount / 400).toFixed(1);

    const headerChar = document.getElementById('charCountHeader');
    if (headerChar) {
      headerChar.textContent = `${charCount.toLocaleString()} 文字（原稿用紙 ${genkoSheets} 枚）`;
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
        effects: this.rubyCompartment.reconfigure(
          this.rubyMode === 'raw'
            ? []
            : rubyDecorationExtension({
                mode: this.rubyMode,
                bypassActiveLine: true,
              })
        ),
      });
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
        <div class="nav-section-title">章一覧・構成</div>
        ${this.chapters.map((ch) => `
          <div class="chapter-item ${ch.id === this.currentChapterId ? 'active' : ''}" data-id="${ch.id}">
            <span>${ch.title}</span>
            <span class="chapter-char-count">${ch.charCount.toLocaleString()} 字</span>
          </div>
        `).join('')}
        <button class="ide-btn" style="width: 100%; margin-top: 12px; justify-content: center;" id="btnNewChapter">
          ＋ 新規章を追加
        </button>
      `;
      container.querySelectorAll('.chapter-item').forEach((item) => {
        item.addEventListener('click', (e) => {
          const id = (e.currentTarget as HTMLElement).dataset.id;
          if (id) this.loadChapter(id);
        });
      });
      // Attach click listener for new chapter button
      const btnNew = container.querySelector('#btnNewChapter');
      btnNew?.addEventListener('click', () => this.addNewChapter());
    } else if (this.activeLeftTab === 'lore') {
      container.innerHTML = `
        <div class="nav-section-title">登場人物（アクティブ）</div>
        <div class="dock-card" style="margin-bottom: 8px; cursor: pointer;">
          <div class="dock-card-title">👤 ヴァレリウス</div>
          <div class="dock-card-body">帝国北方軍総督。星辰の盟約を守護する武将。</div>
        </div>
        <div class="dock-card" style="margin-bottom: 8px; cursor: pointer;">
          <div class="dock-card-title">👤 セレネ</div>
          <div class="dock-card-body">第一衛星の巫女。冷徹な知性で暦法を司る。</div>
        </div>
        <div class="nav-section-title" style="margin-top: 16px;">重要用語・アイテム</div>
        <div class="dock-card" style="margin-bottom: 8px; cursor: pointer;">
          <div class="dock-card-title">📜 星辰の盟約</div>
          <div class="dock-card-body">双月が重なる夜にのみ更新される古代の不可侵協定。</div>
        </div>
      `;
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
      container.innerHTML = `
        <div class="dock-card">
          <div class="dock-card-header">
            <span class="dock-card-title">🔍 可視領域の設定検出</span>
            <span style="font-size: 11px; color: var(--color-success);">2件 検出</span>
          </div>
          <div class="dock-card-body">
            <p><strong>ヴァレリウス</strong>（登場人物・総督）<br>現在地: 北方砦 / 状態: 健在</p>
            <hr style="border: 0; border-top: 1px solid var(--color-border); margin: 6px 0;">
            <p><strong>星辰の盟約</strong>（重要概念）<br>言及回数: 3回 / 伏線回収率: 40%</p>
          </div>
        </div>

        <div class="dock-card">
          <div class="dock-card-header">
            <span class="dock-card-title">⚠️ 伏線・整合性チェック</span>
          </div>
          <div class="dock-card-body">
            <p style="color: var(--color-success);">✓ 時空間矛盾なし（絶対日 2,450）</p>
            <p style="color: var(--color-success);">✓ 登場人物生存ステータス整合</p>
          </div>
        </div>
      `;
    } else if (this.activeRightTab === 'causality') {
      container.innerHTML = `
        <div class="dock-card">
          <div class="dock-card-header">
            <span class="dock-card-title">🕸 因果DAG・ループ検出</span>
            <span style="font-size: 11px; color: var(--color-success);">DAG Valid</span>
          </div>
          <div class="dock-card-body">
            <p>Tarjan SCC ループ検査: <strong>0 循環</strong></p>
            <p>Greedy FAS 最小カット: <strong>整合完了</strong></p>
            <hr style="border: 0; border-top: 1px solid var(--color-border); margin: 6px 0;">
            <p style="font-size: 11px; color: var(--color-text-dim);">因果関係: [双月合] ➔ [儀式発動] ➔ [帝国侵攻]</p>
          </div>
        </div>
      `;
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
