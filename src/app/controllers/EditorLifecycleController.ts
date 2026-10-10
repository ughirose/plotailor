import type { EditorView } from '@codemirror/view';
import type { ChapterData } from './ExportController.js';
import type { KinsokuEngine } from '../../core/editor/KinsokuEngine.js';
import type { WritingVelocityWidget } from '../../core/editor/WritingVelocityWidget.js';
import type { FullscreenStatusBar } from '../../ui/FullscreenStatusBar.js';
import type { NarrativeInspectorDock } from '../../ui/NarrativeInspectorDock.js';
import type { OpfsWalWorkerBridge } from '../../core/storage/OpfsWalWorkerBridge.js';

export interface EditorLifecycleDependencies {
  getEditorView: () => EditorView | null;
  getChapters: () => ChapterData[];
  getCurrentChapterId: () => string;
  getKinsokuColumns: () => number;
  getKinsokuEngine: () => KinsokuEngine;
  getVelocityWidget: () => WritingVelocityWidget;
  getFullscreenStatusBar: () => FullscreenStatusBar | null;
  getNarrativeDock: () => NarrativeInspectorDock;
  getWalWorkerBridge: () => OpfsWalWorkerBridge;
  getActiveLeftTab: () => string;
  updateStats: () => void;
  recordSnapshotDebounced: (chapterId: string, text: string) => void;
  saveToStorage: () => void;
  reconcileShelvedLore: (notify?: boolean) => void;
  renderLeftPane: () => void;
}

export class EditorLifecycleController {
  private deps: EditorLifecycleDependencies;
  private saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private tocDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(deps: EditorLifecycleDependencies) {
    this.deps = deps;
  }

  public handleEditorChange(): void {
    const cm = this.deps.getEditorView();
    const rawText = cm ? cm.state.doc.toString() : '';
    const currentChapterId = this.deps.getCurrentChapterId();
    const activeCh = this.deps.getChapters().find((c) => c.id === currentChapterId);
    if (activeCh) {
      activeCh.content = rawText;
      activeCh.charCount = rawText.replace(/\s+/g, '').length;
    }

    this.deps.updateStats();

    this.deps.getVelocityWidget().recordKeystroke(rawText);
    this.deps.getFullscreenStatusBar()?.updateText(rawText);
    const kinsokuViolations = this.deps.getKinsokuEngine().detectViolations(rawText, this.deps.getKinsokuColumns() * 2);
    this.deps.getNarrativeDock().updateKinsokuViolations(kinsokuViolations);

    // Record snapshot debounced
    this.deps.recordSnapshotDebounced(currentChapterId, rawText);

    const saveIndicator = document.getElementById('saveStatusIndicator');
    if (saveIndicator) {
      saveIndicator.textContent = '自動保存: 編集中...';
      saveIndicator.style.color = 'var(--color-gold)';
    }

    // Async OPFS WAL Worker write (0ms main thread blocking)
    this.deps.getWalWorkerBridge().writeAsync(0, new TextEncoder().encode(rawText)).catch(() => {});

    if (this.saveDebounceTimer !== null) {
      clearTimeout(this.saveDebounceTimer);
    }
    this.saveDebounceTimer = setTimeout(() => {
      this.deps.saveToStorage();
      this.deps.reconcileShelvedLore(true);
      if (saveIndicator) {
        saveIndicator.textContent = '自動保存: 0.1秒前 (OPFS WAL Worker & AES-GCM)';
        saveIndicator.style.color = 'var(--color-text-dim)';
      }
    }, 400);

    // 見出し・目次ツリー（SceneOutliner）のリアルタイム追従（即時反映）
    if (this.deps.getActiveLeftTab() === 'toc') {
      if (this.tocDebounceTimer !== null) {
        clearTimeout(this.tocDebounceTimer);
      }
      this.tocDebounceTimer = setTimeout(() => {
        this.tocDebounceTimer = null;
        this.deps.renderLeftPane();
      }, 250);
    }
  }

  public destroy(): void {
    if (this.saveDebounceTimer !== null) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }
    if (this.tocDebounceTimer !== null) {
      clearTimeout(this.tocDebounceTimer);
      this.tocDebounceTimer = null;
    }
  }
}
