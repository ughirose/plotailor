import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { undoDepth, redoDepth } from '@codemirror/commands';
import type { ChapterData } from './ExportController.js';

export interface SnapshotItem {
  time: number;
  text: string;
  length: number;
}

export interface HistoryControllerDependencies {
  getEditorView: () => EditorView | null;
  getCurrentChapterId: () => string;
  getChapterSnapshots: () => Map<string, SnapshotItem[]>;
  getChapterStates: () => Map<string, EditorState>;
  getChapters: () => ChapterData[];
  createChapterState: (content: string) => EditorState;
  saveToStorage: () => void;
  updateStats: () => void;
  showToast: (msg: string) => void;
  setActiveRightTab: (tab: string) => void;
  renderRightPane: () => void;
}

export type SnapshotListener = (chapterId: string, snapshotCount: number) => void;

export class HistoryController {
  private deps: HistoryControllerDependencies;
  private lastSnapshotTime = 0;
  private snapshotListeners: SnapshotListener[] = [];

  constructor(deps: HistoryControllerDependencies) {
    this.deps = deps;
  }

  public registerSnapshotListener(listener: SnapshotListener): void {
    this.snapshotListeners.push(listener);
  }

  private notifySnapshot(chapterId: string, count: number): void {
    for (const listener of this.snapshotListeners) {
      listener(chapterId, count);
    }
  }

  public recordSnapshot(chapterId: string, text: string): void {
    const snapshotsMap = this.deps.getChapterSnapshots();
    let list = snapshotsMap.get(chapterId);
    if (!list) {
      list = [];
      snapshotsMap.set(chapterId, list);
    }
    const len = text.replace(/\s+/g, '').length;
    // Do not record if text is identical to last recorded snapshot
    if (list.length > 0 && list[list.length - 1].text === text) return;
    list.push({ time: Date.now(), text, length: len });
    if (list.length > 500) list.shift();
    this.notifySnapshot(chapterId, list.length);
  }

  public recordSnapshotDebounced(chapterId: string, text: string): void {
    const now = Date.now();
    if (now - this.lastSnapshotTime > 4000) {
      this.lastSnapshotTime = now;
      this.recordSnapshot(chapterId, text);
    }
  }

  public updateHistoryUI(): void {
    const cm = this.deps.getEditorView();
    if (!cm) return;
    const state = cm.state;
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

  public openHistoryModal(): void {
    // Redirected to right-pane dock tab
    this.deps.setActiveRightTab('history');
    const paneRight = document.getElementById('paneRight');
    if (paneRight && paneRight.style.display === 'none') {
      paneRight.style.display = '';
    }
    this.deps.renderRightPane();
  }

  public closeHistoryModal(): void {
    // No-op: history is now an inline dock tab
  }

  public rollbackToSnapshot(index: number): void {
    const currentChapterId = this.deps.getCurrentChapterId();
    const snapshotsMap = this.deps.getChapterSnapshots();
    const snapshots = snapshotsMap.get(currentChapterId) || [];
    const snap = snapshots[index];
    const cm = this.deps.getEditorView();
    if (!snap || !cm) return;

    // 1. Truncate future snapshots beyond the selected rollback point (Git-style rollback)
    snapshots.splice(index + 1);

    // 2. Reset EditorState with the restored text
    const newState = this.deps.createChapterState(snap.text);
    this.deps.getChapterStates().set(currentChapterId, newState);
    cm.setState(newState);

    // 3. Update chapter model & storage
    const activeCh = this.deps.getChapters().find((c) => c.id === currentChapterId);
    if (activeCh) {
      activeCh.content = snap.text;
      activeCh.charCount = snap.length;
    }
    this.deps.saveToStorage();

    this.deps.showToast(`🕒 ${new Date(snap.time).toLocaleTimeString()} の状態へロールバックしました（未来の履歴を切り捨て）`);
    this.deps.updateStats();
    this.updateHistoryUI();
  }
}
