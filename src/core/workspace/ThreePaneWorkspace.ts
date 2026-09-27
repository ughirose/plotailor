/**
 * ThreePaneWorkspace - Unified Master Orchestrator for Plotailor Literature IDE
 * 
 * Strict compliance with the 3-Pane Integrated IDE Constitution:
 * - Left Pane: WorldCraft Lore Tree & Character Subgraph Dock
 * - Center Pane: CodeMirror 6 Vertical Writing Mode & Aozora Parser Viewport
 * - Right Pane: Proof of Process (PoP) Merkle Inspector, Consistency & Dialogue Pacing Panel
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
import { WorkerHotSwapManager, type WorkerInstance } from '../runtime/WorkerHotSwapManager.js';
import {
  analyzeDocument,
  type DocumentAnalysis,
  type DialogueRatioConfig,
} from '../nlp/DialogueRatioAnalyzer.js';

export interface WorkspaceState {
  currentDocumentId: string;
  rawText: string;
  isComposing: boolean;
  activeLeftTab: 'world-tree' | 'character-dock' | 'shelved';
  activeRightTab: 'pop-audit' | 'consistency-inspector' | 'pacing-inspector' | 'appearance';
  diagnostics: LoreDiagnostic[];
  pacingAnalysis: DocumentAnalysis;
  isSaving: boolean;
  lastSavedTimestamp: number;
}

export class ThreePaneWorkspace {
  private ontologyEngine: WorldOntologyEngine;
  private popEngine: PoPAuditEngine;
  private auditView: ThreePaneAuditView;
  private viewport: VerticalViewport;
  private linter: LoreLinterEngine;
  private storage: MobileResilientStorage;
  private hotSwapManager: WorkerHotSwapManager | null = null;
  private ratioConfig: DialogueRatioConfig;
  private state: WorkspaceState;

  constructor(options?: {
    initialText?: string;
    regulations?: TermRegulation[];
    worker?: WorkerInstance;
    ratioConfig?: DialogueRatioConfig;
  }) {
    this.ontologyEngine = new WorldOntologyEngine();
    this.popEngine = new PoPAuditEngine('three-pane-session');
    this.auditView = new ThreePaneAuditView(this.popEngine);
    this.viewport = new VerticalViewport();
    this.linter = new LoreLinterEngine(options?.regulations ?? []);
    this.storage = new MobileResilientStorage(new OPFSStorage());
    this.ratioConfig = options?.ratioConfig ?? {};

    if (options?.worker) {
      this.hotSwapManager = new WorkerHotSwapManager(options.worker);
    }

    const initialText = options?.initialText ?? '';
    const initialPacing = analyzeDocument(initialText, this.ratioConfig);

    this.state = {
      currentDocumentId: `doc-${Date.now()}`,
      rawText: initialText,
      isComposing: false,
      activeLeftTab: 'world-tree',
      activeRightTab: 'consistency-inspector',
      diagnostics: [],
      pacingAnalysis: initialPacing,
      isSaving: false,
      lastSavedTimestamp: Date.now(),
    };
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

  /**
   * Handle text edits from the central CodeMirror 6 editor.
   * Runs in O(N+M) with Aho-Corasick & Dialogue Ratio Analyzer, updates PoP audit block.
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

    // Run Dialogue Ratio Analyzer
    this.state.pacingAnalysis = analyzeDocument(newText, this.ratioConfig);

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
      this.state.lastSavedTimestamp = Date.now();
      return true;
    } finally {
      this.state.isSaving = false;
    }
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

    let rightContentHtml = '';
    if (this.state.activeRightTab === 'pop-audit') {
      rightContentHtml = `<div class="pop-audit-dock"><span>監査イベント数: ${this.popEngine.getChain().getEvents().length}</span></div>`;
    } else if (this.state.activeRightTab === 'pacing-inspector') {
      const dialPct = (this.state.pacingAnalysis.overallDialogueRatio * 100).toFixed(1);
      const narrPct = (this.state.pacingAnalysis.overallNarrativeRatio * 100).toFixed(1);
      const statusLabel =
        this.state.pacingAnalysis.overallPacingStatus === 'BALANCED'
          ? '黄金比（良好）'
          : this.state.pacingAnalysis.overallPacingStatus === 'DIALOGUE_DENSE'
          ? '会話過密（過多）'
          : '地の文説明過多';

      rightContentHtml = `<div class="pacing-dock">
        <h4>地の文と台詞の会話比率アナライザー</h4>
        <div>会話比率: ${dialPct}% / 地の文比率: ${narrPct}%</div>
        <div>テンポ判定: <strong>${statusLabel}</strong></div>
        <div>指摘件数: ${this.state.pacingAnalysis.diagnostics.length}件</div>
      </div>`;
    } else {
      rightContentHtml = `<div class="consistency-dock"><span>検出表記ゆれ: ${this.state.diagnostics.length}件</span></div>`;
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
        contentHtml: rightContentHtml,
      },
    };
  }
}
