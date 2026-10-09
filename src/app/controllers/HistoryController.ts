import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { undoDepth, redoDepth } from '@codemirror/commands';
import { NonDestructiveRevisionGraph } from '../../core/storage/NonDestructiveRevisionGraph.js';
import { RevisionGranularityManager } from '../../core/editor/RevisionGranularityManager.js';
import { RevisionDiffSummarizer } from '../../core/editor/RevisionDiffSummarizer.js';
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
  setSnapshotFrequency?: (freq: 'minimal' | 'low' | 'standard' | 'high' | 'custom') => void;
  getSnapshotCustomChars?: () => number;
  getSnapshotCustomSeconds?: () => number;
  updateMultiLayerDecorations?: () => void;
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
      const currentChapterId = this.deps.getCurrentChapterId();
      const snapshots = this.deps.getChapterSnapshots().get(currentChapterId) || [];
      const snapCount = snapshots.length;
      badge.textContent = `履歴: ${snapCount} / 500 ▾`;
      badge.title = `現在章の履歴スナップショット: ${snapCount}件 / 最大500件 (クリックで編集履歴・ロールバック比較モーダルを開く)`;
    }
  }

  private selectedHistorySnapshotIndex: number | null = null;
  private isHistoryDiffOnly = false;

  public getSelectedHistorySnapshotIndex(): number | null {
    return this.selectedHistorySnapshotIndex;
  }

  public setSelectedHistorySnapshotIndex(index: number | null): void {
    this.selectedHistorySnapshotIndex = index;
  }

  public getIsHistoryDiffOnly(): boolean {
    return this.isHistoryDiffOnly;
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

  public openHistoryModal(): void {
    const modal = document.getElementById('historyModal');
    if (!modal) return;
    modal.style.display = 'flex';

    const currentChapterId = this.deps.getCurrentChapterId();
    let snapshots = this.deps.getChapterSnapshots().get(currentChapterId) || [];
    const cm = this.deps.getEditorView();
    const currentText = cm ? cm.state.doc.toString() : '';
    if (snapshots.length === 0 && currentText) {
      this.recordSnapshot(currentChapterId, currentText);
      snapshots = this.deps.getChapterSnapshots().get(currentChapterId) || [];
    }

    const selQuick = document.getElementById('historySnapshotFrequencyQuick') as HTMLSelectElement | null;
    if (selQuick && this.deps.getSnapshotFrequency) {
      selQuick.value = this.deps.getSnapshotFrequency();
    }

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

  public closeHistoryModal(): void {
    const modal = document.getElementById('historyModal');
    if (modal) modal.style.display = 'none';
  }

  public renderHistoryList(): void {
    const container = document.getElementById('historyListContainer');
    if (!container) return;
    const currentChapterId = this.deps.getCurrentChapterId();
    const snapshots = this.deps.getChapterSnapshots().get(currentChapterId) || [];
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

  public renderHistoryDiff(index: number): void {
    const currentChapterId = this.deps.getCurrentChapterId();
    const snapshots = this.deps.getChapterSnapshots().get(currentChapterId) || [];
    const snap = snapshots[index];
    const diffContainer = document.getElementById('historyDiffContainer');
    const diffStats = document.getElementById('historyDiffStats');
    const btnRollback = document.getElementById('btnConfirmHistoryRollback') as HTMLButtonElement | null;
    if (!snap || !diffContainer) return;

    const cm = this.deps.getEditorView();
    const currentText = cm ? cm.state.doc.toString() : '';
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

  public initHistoryModal(): void {
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
      if (this.deps.setSnapshotFrequency) {
        this.deps.setSnapshotFrequency(val);
      }
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

  public rollbackToSnapshot(index: number): void {
    const currentChapterId = this.deps.getCurrentChapterId();
    const snapshotsMap = this.deps.getChapterSnapshots();
    const snapshots = snapshotsMap.get(currentChapterId) || [];
    const snap = snapshots[index];
    const cm = this.deps.getEditorView();
    if (!snap || !cm) return;

    // 1. Truncate future snapshots beyond the selected rollback point (Git-style rollback)
    snapshots.splice(index + 1);

    // 2. Reset EditorState with the restored text so rollback itself does not pollute history
    const newState = this.deps.createChapterState(snap.text);
    this.deps.getChapterStates().set(currentChapterId, newState);
    cm.setState(newState);

    // 3. Update chapter model & storage
    const activeCh = this.deps.getChapters().find((c) => c.id === currentChapterId);
    if (activeCh) {
      activeCh.content = snap.text;
      activeCh.charCount = snap.length;
    }

    // 4. Reset debounce timer so future edits are immediately registered in snapshots
    this.lastSnapshotTime = 0;
    this.deps.saveToStorage();

    this.deps.showToast(`🕒 ${new Date(snap.time).toLocaleTimeString()} の状態へロールバックしました（未来の履歴を切り捨て）`);
    this.deps.updateStats();
    this.deps.updateMultiLayerDecorations?.();
    this.updateHistoryUI();
    this.closeHistoryModal();
  }
}
