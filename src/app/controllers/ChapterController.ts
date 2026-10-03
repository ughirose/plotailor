import type { EditorView } from '@codemirror/view';
import type { EditorState } from '@codemirror/state';
import { showInlineConfirm } from '../InlineDialog.js';
import { SlashMentionCommandParser, type SlashCommandDefinition } from '../../core/editor/SlashMentionCommandParser.js';
import type { ChapterData } from './ExportController.js';
import type { ProjectManager } from '../../core/project/index.js';

export interface ChapterControllerDependencies {
  getChapters: () => ChapterData[];
  setChapters: (chapters: ChapterData[]) => void;
  getCurrentChapterId: () => string;
  setCurrentChapterId: (id: string) => void;
  getEditorView: () => EditorView | null;
  getChapterStates: () => Map<string, EditorState>;
  getChapterSnapshots: () => Map<string, Array<any>>;
  createChapterState: (content: string) => EditorState;
  getProjectManager: () => ProjectManager;
  getCurrentProjectId: () => string;
  recordSnapshot: (chapterId: string, content: string) => void;
  saveToStorage: () => void;
  renderLeftPane: () => void;
  updateStats: () => void;
  updateHistoryUI: () => void;
  updateMultiLayerDecorations: () => void;
  showToast: (msg: string) => void;
}

export type ChapterChangeListener = (action: 'load' | 'add' | 'delete' | 'rename' | 'reorder', chapterId: string) => void;

export class ChapterController {
  private deps: ChapterControllerDependencies;
  private changeListeners: ChapterChangeListener[] = [];
  private commandParser = new SlashMentionCommandParser();

  constructor(deps: ChapterControllerDependencies) {
    this.deps = deps;
  }

  public getCommandParser(): SlashMentionCommandParser {
    return this.commandParser;
  }

  public registerChapterChangeListener(listener: ChapterChangeListener): void {
    this.changeListeners.push(listener);
  }

  private notifyChange(action: 'load' | 'add' | 'delete' | 'rename' | 'reorder', chapterId: string): void {
    for (const listener of this.changeListeners) {
      listener(action, chapterId);
    }
  }

  public renderChapterSelect(): void {
    const selectEl = document.getElementById('chapterSelect') as HTMLSelectElement | null;
    if (!selectEl) return;
    const chapters = this.deps.getChapters();
    const currentChapterId = this.deps.getCurrentChapterId();
    selectEl.innerHTML = chapters.map((ch) => `
      <option value="${ch.id}" ${ch.id === currentChapterId ? 'selected' : ''}>${ch.title}</option>
    `).join('');
  }

  public loadChapter(chapterId: string): void {
    const chapters = this.deps.getChapters();
    const ch = chapters.find((c) => c.id === chapterId);
    if (!ch) return;

    const cm = this.deps.getEditorView();
    const currentChapterId = this.deps.getCurrentChapterId();
    const chapterStates = this.deps.getChapterStates();

    if (cm) {
      // 1. Save current chapter state to map before switching
      chapterStates.set(currentChapterId, cm.state);

      this.deps.setCurrentChapterId(chapterId);

      // 2. Load or create target chapter state
      let targetState = chapterStates.get(chapterId);
      if (!targetState) {
        targetState = this.deps.createChapterState(ch.content);
        chapterStates.set(chapterId, targetState);
      }
      cm.setState(targetState);
    } else {
      this.deps.setCurrentChapterId(chapterId);
    }

    const titleEl = document.getElementById('activeChapterTitle');
    if (titleEl) titleEl.textContent = ch.title;

    const selectEl = document.getElementById('chapterSelect') as HTMLSelectElement | null;
    if (selectEl) selectEl.value = chapterId;

    this.deps.saveToStorage();
    this.deps.renderLeftPane();
    this.deps.updateStats();
    this.deps.updateHistoryUI();
    this.deps.updateMultiLayerDecorations();
    this.notifyChange('load', chapterId);
  }

  public addNewChapter(): void {
    const chapters = this.deps.getChapters();
    const newIdx = chapters.length + 1;
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

    chapters.push(newChapter);
    this.deps.saveToStorage();
    this.renderChapterSelect();
    this.loadChapter(newId);
    this.notifyChange('add', newId);
    this.deps.showToast(`✨ 新規の章「${newTitle}」を追加しました`);
  }

  public async deleteChapter(chapterId: string): Promise<void> {
    let chapters = this.deps.getChapters();
    if (chapters.length <= 1) {
      this.deps.showToast('⚠️ 最後の1章は削除できません');
      return;
    }

    const targetCh = chapters.find((c) => c.id === chapterId);
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

    const delIdx = chapters.findIndex((c) => c.id === chapterId);
    chapters = chapters.filter((c) => c.id !== chapterId);
    this.deps.setChapters(chapters);

    this.deps.getChapterStates().delete(chapterId);
    this.deps.getChapterSnapshots().delete(chapterId);

    try {
      await this.deps.getProjectManager().deleteChapter(this.deps.getCurrentProjectId(), chapterId);
    } catch (err) {
      console.warn('VFS deleteChapter error:', err);
    }

    const currentChapterId = this.deps.getCurrentChapterId();
    if (currentChapterId === chapterId) {
      const nextIdx = Math.min(delIdx, chapters.length - 1);
      this.loadChapter(chapters[nextIdx].id);
    } else {
      this.deps.saveToStorage();
      this.renderChapterSelect();
      this.deps.renderLeftPane();
      this.deps.updateStats();
    }

    this.notifyChange('delete', chapterId);
    this.deps.showToast(`🗑️ 章「${targetCh.title}」を削除しました`);
  }

  public renameChapter(chapterId: string, newTitle: string): void {
    const trimmed = newTitle.trim();
    if (!trimmed) return;

    const chapters = this.deps.getChapters();
    const ch = chapters.find((c) => c.id === chapterId);
    if (!ch) return;

    ch.title = trimmed;
    this.deps.saveToStorage();
    this.renderChapterSelect();

    if (this.deps.getCurrentChapterId() === chapterId) {
      const activeTitleEl = document.getElementById('activeChapterTitle');
      if (activeTitleEl) activeTitleEl.textContent = trimmed;
    }

    this.deps.renderLeftPane();
    this.notifyChange('rename', chapterId);
    this.deps.showToast(`✏️ 章名を「${trimmed}」に変更しました`);
  }

  public async reorderChapters(fromIndex: number, toIndex: number): Promise<void> {
    const chapters = this.deps.getChapters();
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    if (fromIndex >= chapters.length || toIndex >= chapters.length) return;

    const [moved] = chapters.splice(fromIndex, 1);
    chapters.splice(toIndex, 0, moved);

    this.deps.saveToStorage();
    this.renderChapterSelect();
    this.deps.renderLeftPane();

    try {
      await this.deps.getProjectManager().reorderChapters(
        this.deps.getCurrentProjectId(),
        chapters.map((c) => c.id)
      );
    } catch (err) {
      console.warn('VFS reorder error:', err);
    }

    this.notifyChange('reorder', moved.id);
  }
}
