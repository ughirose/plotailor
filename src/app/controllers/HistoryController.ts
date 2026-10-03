import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { undoDepth, redoDepth } from '@codemirror/commands';
import { NonDestructiveRevisionGraph } from '../../core/storage/NonDestructiveRevisionGraph.js';
import { RevisionGranularityManager } from '../../core/editor/RevisionGranularityManager.js';
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
  getSnapshotFrequency?: () => 'minimal' | 'low' | 'standard' | 'high' | 'custom';
  getSnapshotCustomChars?: () => number;
  getSnapshotCustomSeconds?: () => number;
}

export type SnapshotListener = (chapterId: string, snapshotCount: number) => void;

export class HistoryController {
  private deps: HistoryControllerDependencies;
  private lastSnapshotTime = 0;
  private snapshotListeners: SnapshotListener[] = [];
  private revisionGraph = new NonDestructiveRevisionGraph<string>();
  private granularityManager = new RevisionGranularityManager();

  constructor(deps: HistoryControllerDependencies) {
    this.deps = deps;
  }

  public getRevisionGraph(): NonDestructiveRevisionGraph<string> {
    return this.revisionGraph;
  }

  public getGranularityManager(): RevisionGranularityManager {
    return this.granularityManager;
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
    const now = Date.now();
    list.push({ time: now, text, length: len });
    if (list.length > 500) list.shift();

    // Sync to NonDestructiveRevisionGraph & GranularityManager
    try {
      if (!this.revisionGraph.getCurrentNode()) {
        this.revisionGraph.createRootNode(text, '初回ドラフト', 'initial');
      } else {
        this.revisionGraph.commit(text, `スナップショット (${len}字)`, 'auto');
      }
      this.granularityManager.addSnapshot({
        timestamp: now,
        content: text,
        trigger: 'timer',
      });
    } catch {}

    this.notifySnapshot(chapterId, list.length);
  }

  public recordSnapshotDebounced(chapterId: string, text: string): void {
    const list = this.deps.getChapterSnapshots().get(chapterId) || [];
    const lastSnap = list.length > 0 ? list[list.length - 1] : null;
    const len = text.replace(/\s+/g, '').length;
    const lastLen = lastSnap ? lastSnap.length : 0;
    const charDelta = Math.abs(len - lastLen);

    const freq = this.deps.getSnapshotFrequency ? this.deps.getSnapshotFrequency() : 'standard';
    let minTrivialDelta = 3;
    let minSentenceDelta = 10;
    let minSentenceInterval = 3000;
    let minBurstDelta = 25;
    let minBurstInterval = 5000;
    let minIdlePause = 15000;
    let minIdleDelta = 10;

    if (freq === 'minimal') {
      minTrivialDelta = 20;
      minSentenceDelta = 100;
      minSentenceInterval = 20000;
      minBurstDelta = 200;
      minBurstInterval = 30000;
      minIdlePause = 60000;
      minIdleDelta = 100;
    } else if (freq === 'low') {
      minTrivialDelta = 10;
      minSentenceDelta = 40;
      minSentenceInterval = 8000;
      minBurstDelta = 80;
      minBurstInterval = 15000;
      minIdlePause = 30000;
      minIdleDelta = 40;
    } else if (freq === 'high') {
      minTrivialDelta = 1;
      minSentenceDelta = 5;
      minSentenceInterval = 1500;
      minBurstDelta = 12;
      minBurstInterval = 2500;
      minIdlePause = 5000;
      minIdleDelta = 5;
    } else if (freq === 'custom') {
      const customChars = Math.max(5, (this.deps.getSnapshotCustomChars ? this.deps.getSnapshotCustomChars() : 25));
      const customIdleMs = Math.max(2000, ((this.deps.getSnapshotCustomSeconds ? this.deps.getSnapshotCustomSeconds() : 15)) * 1000);
      minTrivialDelta = Math.max(1, Math.round(customChars * 0.1));
      minSentenceDelta = Math.max(3, Math.round(customChars * 0.4));
      minSentenceInterval = Math.round(customIdleMs * 0.3);
      minBurstDelta = customChars;
      minBurstInterval = Math.round(customIdleMs * 0.5);
      minIdlePause = customIdleMs;
      minIdleDelta = Math.max(3, Math.round(customChars * 0.4));
    }

    if (charDelta < minTrivialDelta && lastSnap) {
      return;
    }

    const now = Date.now();
    const timeSinceLast = now - this.lastSnapshotTime;

    const endsWithSentenceBoundary = /[。！？!?]\n?$/.test(text.trim());
    const isSentenceBoundaryTrigger = endsWithSentenceBoundary && charDelta >= minSentenceDelta && timeSinceLast > minSentenceInterval;
    const isSubstantialChange = charDelta >= minBurstDelta && timeSinceLast > minBurstInterval;
    const isIdlePauseTrigger = timeSinceLast > minIdlePause && charDelta >= minIdleDelta;

    if (isSentenceBoundaryTrigger || isSubstantialChange || isIdlePauseTrigger || list.length === 0) {
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
