/**
 * ThreePaneWorkspace - Unified Master Orchestrator for Plotailor Literature IDE
 * 
 * Strict compliance with the 3-Pane Integrated IDE Constitution:
 * - Left Pane: WorldCraft Lore Tree & Character Subgraph Dock
 * - Center Pane: CodeMirror 6 Vertical Writing Mode & Aozora Parser Viewport
 * - Right Pane: Proof of Process (PoP) Merkle Inspector, Consistency Panel & OPFS Revision History
 * - Prohibition: Zero single-use modal dialogs. Everything is docked and inline.
 */

import type { SubgraphSlice } from '@schema';
import { WorldOntologyEngine } from '@core';
import { VerticalViewport } from '../editor/VerticalViewport.js';
import { LoreLinterEngine, type LoreDiagnostic, type TermRegulation } from '../editor/LoreLinter.js';
import { AozoraParser } from '../editor/AozoraParser.js';
import { PoPAuditEngine } from '../pop/PoPAuditEngine.js';
import { ThreePaneAuditView } from '../pop/ThreePaneAuditView.js';
import { MobileResilientStorage } from '../storage/MobileResilientStorage.js';
import { OPFSStorage } from '../storage/OPFSStorage.js';
import { RevisionHistoryManager } from '../storage/RevisionHistoryManager.js';
import { WorkerHotSwapManager, type WorkerInstance } from '../runtime/WorkerHotSwapManager.js';

export interface WorkspaceState {
  currentDocumentId: string;
  rawText: string;
  isComposing: boolean;
  activeLeftTab: 'world-tree' | 'character-dock' | 'shelved';
  activeRightTab: 'pop-audit' | 'consistency-inspector' | 'appearance' | 'revision-history';
  diagnostics: LoreDiagnostic[];
  isSaving: boolean;
  lastSavedTimestamp: number;
}

export class ThreePaneWorkspace {
  private ontologyEngine: WorldOntologyEngine;
  private popEngine: PoPAuditEngine;
  private auditView: ThreePaneAuditView;
  private viewport: VerticalViewport;
  private linter: LoreLinterEngine;
  private rawStorage: OPFSStorage;
  private storage: MobileResilientStorage;
  private revisionManager: RevisionHistoryManager;
  private hotSwapManager: WorkerHotSwapManager | null = null;
  private state: WorkspaceState;

  constructor(options?: {
    initialText?: string;
    regulations?: TermRegulation[];
    worker?: WorkerInstance;
  }) {
    this.ontologyEngine = new WorldOntologyEngine();
    this.popEngine = new PoPAuditEngine('three-pane-session');
    this.auditView = new ThreePaneAuditView(this.popEngine);
    this.viewport = new VerticalViewport();
    this.linter = new LoreLinterEngine(options?.regulations ?? []);
    this.rawStorage = new OPFSStorage();
    this.storage = new MobileResilientStorage(this.rawStorage);

    const docId = `doc-${Date.now()}`;
    this.revisionManager = new RevisionHistoryManager(this.rawStorage, docId);

    if (options?.worker) {
      this.hotSwapManager = new WorkerHotSwapManager(options.worker);
    }

    const initialText = options?.initialText ?? '';
    this.state = {
      currentDocumentId: docId,
      rawText: initialText,
      isComposing: false,
      activeLeftTab: 'world-tree',
      activeRightTab: 'consistency-inspector',
      diagnostics: [],
      isSaving: false,
      lastSavedTimestamp: Date.now(),
    };

    if (initialText) {
      this.revisionManager.createSnapshot(initialText, 'Initial document state');
    }
  }

  public getState(): WorkspaceState {
    return { ...this.state };
  }

  public getViewport(): VerticalViewport {
    return this.viewport;
  }

  public getHotSwapManager(): WorkerHotSwapManager | null {
    return this.hotSwapManager;
  }

  public getRevisionManager(): RevisionHistoryManager {
    return this.revisionManager;
  }

  /**
   * Handle text edits from the central CodeMirror 6 editor.
   * Runs in O(N+M) with Aho-Corasick, updates PoP audit block, and avoids interrupting author.
   */
  public onTextChange(newText: string, isComposing: boolean = false): void {
    this.state.rawText = newText;
    this.state.isComposing = isComposing;

    if (this.hotSwapManager) {
      this.hotSwapManager.reportKeystroke(isComposing);
    }

    // Run Lore Linter (bypassed if composing with Japanese IME)
    const { map } = AozoraParser.parse(newText);
    this.state.diagnostics = this.linter.lint(newText, { isComposing, displayMap: map });

    // Record edit event in PoP Merkle chain
    if (!isComposing) {
      this.popEngine.recordEvent({
        id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        eventType: 'text-insert',
        payload: { length: newText.length, timestamp: Date.now() },
        authorId: 'local-author',
      });
    }
  }

  /**
   * Safe atomic save to OPFS in background without stalling the UI.
   * Also creates a generation snapshot in RevisionHistoryManager.
   */
  public async autoSave(): Promise<boolean> {
    if (this.state.isComposing || this.state.isSaving) {
      return false; // Skip saving while author is actively converting IME
    }

    this.state.isSaving = true;
    try {
      const payload = JSON.stringify({
        id: this.state.currentDocumentId,
        content: this.state.rawText,
        savedAt: Date.now(),
      });

      await this.storage.writeSafe(`${this.state.currentDocumentId}.json`, payload);
      this.revisionManager.createSnapshot(this.state.rawText, 'Auto-save snapshot');
      this.state.lastSavedTimestamp = Date.now();
      return true;
    } finally {
      this.state.isSaving = false;
    }
  }

  /**
   * Safe non-destructive rollback to target revision (undo tree protection).
   */
  public rollbackToRevision(targetRevisionId: string): void {
    const { restoredContent } = this.revisionManager.rollback(targetRevisionId);
    this.onTextChange(restoredContent, false);
  }

  /**
   * Dock tab navigation (strictly inline, replacing standalone modals).
   */
  public setLeftTab(tab: WorkspaceState['activeLeftTab']): void {
    this.state.activeLeftTab = tab;
  }

  public setRightTab(tab: WorkspaceState['activeRightTab']): void {
    this.state.activeRightTab = tab;
  }

  /**
   * Renders the complete 3-pane layout model.
   */
  public renderWorkspaceModel(): {
    leftPane: { activeTab: string; contentHtml: string };
    centerPane: { style: Record<string, string>; classes: string[]; html: string };
    rightPane: { activeTab: string; contentHtml: string };
  } {
    const parsedHtml = this.viewport.renderContent(this.state.rawText);

    let rightPaneHtml = '';
    if (this.state.activeRightTab === 'pop-audit') {
      rightPaneHtml = `<div class="pop-audit-dock"><span>監査イベント数: ${this.popEngine.getChain().getEvents().length}</span></div>`;
    } else if (this.state.activeRightTab === 'revision-history') {
      rightPaneHtml = this.revisionManager.renderDockViewHtml();
    } else {
      rightPaneHtml = `<div class="consistency-dock"><span>検出表記ゆれ: ${this.state.diagnostics.length}件</span></div>`;
    }

    return {
      leftPane: {
        activeTab: this.state.activeLeftTab,
        contentHtml: `<div class="world-tree-dock" data-tab="${this.state.activeLeftTab}"><h4>世界観ツリー</h4></div>`,
      },
      centerPane: {
        style: this.viewport.getContainerStyle(),
        classes: this.viewport.getContainerClasses(),
        html: parsedHtml,
      },
      rightPane: {
        activeTab: this.state.activeRightTab,
        contentHtml: rightPaneHtml,
      },
    };
  }
}
