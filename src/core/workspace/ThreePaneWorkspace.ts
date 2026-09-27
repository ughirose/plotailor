/**
 * ThreePaneWorkspace - Unified Master Orchestrator for Plotailor Literature IDE
 * 
 * Strict compliance with the 3-Pane Integrated IDE Constitution:
 * - Left Pane: WorldCraft Lore Tree & Character Subgraph Dock
 * - Center Pane: CodeMirror 6 Vertical Writing Mode & Aozora Parser Viewport
 * - Right Pane: Proof of Process (PoP) Merkle Inspector, Consistency Panel, & Character Heatmap Dock
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
  CharacterHeatmapEngine,
  type CharacterTermDef,
  type HeatmapAnalysisResult,
} from '../editor/CharacterHeatmap.js';

export interface WorkspaceState {
  currentDocumentId: string;
  rawText: string;
  isComposing: boolean;
  activeLeftTab: 'world-tree' | 'character-dock' | 'shelved';
  activeRightTab: 'pop-audit' | 'consistency-inspector' | 'appearance' | 'character-heatmap';
  diagnostics: LoreDiagnostic[];
  heatmapResult: HeatmapAnalysisResult | null;
  isSaving: boolean;
  lastSavedTimestamp: number;
}

export class ThreePaneWorkspace {
  private ontologyEngine: WorldOntologyEngine;
  private popEngine: PoPAuditEngine;
  private auditView: ThreePaneAuditView;
  private viewport: VerticalViewport;
  private linter: LoreLinterEngine;
  private heatmapEngine: CharacterHeatmapEngine;
  private storage: MobileResilientStorage;
  private hotSwapManager: WorkerHotSwapManager | null = null;
  private characterTargets: CharacterTermDef[];
  private state: WorkspaceState;

  constructor(options?: {
    initialText?: string;
    regulations?: TermRegulation[];
    characterTargets?: CharacterTermDef[];
    worker?: WorkerInstance;
  }) {
    this.ontologyEngine = new WorldOntologyEngine();
    this.popEngine = new PoPAuditEngine('three-pane-session');
    this.auditView = new ThreePaneAuditView(this.popEngine);
    this.viewport = new VerticalViewport();
    this.linter = new LoreLinterEngine(options?.regulations ?? []);
    this.heatmapEngine = new CharacterHeatmapEngine();
    this.storage = new MobileResilientStorage(new OPFSStorage());

    this.characterTargets = options?.characterTargets ?? [
      { id: 'c1', name: 'ヴァレリウス', aliases: ['ヴァレリウス将軍'], color: '#cfa85c' },
      { id: 'c2', name: 'アーサー', aliases: ['従卒アーサー'], color: '#6366f1' },
      { id: 'c3', name: 'エレナ', aliases: ['皇女エレナ', 'エレナ皇女'], color: '#ec4899' },
      { id: 'c4', name: '紫電の剣', aliases: ['雷撃剣'], color: '#10b981' },
    ];

    if (options?.worker) {
      this.hotSwapManager = new WorkerHotSwapManager(options.worker);
    }

    const initialText = options?.initialText ?? '';
    const initialHeatmap = this.heatmapEngine.analyze(initialText, this.characterTargets);

    this.state = {
      currentDocumentId: `doc-${Date.now()}`,
      rawText: initialText,
      isComposing: false,
      activeLeftTab: 'world-tree',
      activeRightTab: 'consistency-inspector',
      diagnostics: [],
      heatmapResult: initialHeatmap,
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

  public getHeatmapEngine(): CharacterHeatmapEngine {
    return this.heatmapEngine;
  }

  public setCharacterTargets(targets: CharacterTermDef[]): void {
    this.characterTargets = targets;
    this.reevaluateHeatmap();
  }

  private reevaluateHeatmap(): void {
    this.state.heatmapResult = this.heatmapEngine.analyze(this.state.rawText, this.characterTargets);
  }

  /**
   * Handle text edits from the central CodeMirror 6 editor.
   * Runs in O(N+M) with Aho-Corasick, updates PoP audit block, re-evaluates character heatmaps, and avoids interrupting author.
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

    // Update Heatmap Result
    this.reevaluateHeatmap();

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
    } else if (this.state.activeRightTab === 'character-heatmap') {
      const result = this.state.heatmapResult;
      if (!result || result.series.length === 0) {
        rightContentHtml = `<div class="character-heatmap-dock"><p>登場人物・用語データがありません</p></div>`;
      } else {
        const matrixSvg = this.heatmapEngine.renderSvgHeatmapMatrix(result);
        const sparklinesHtml = result.series
          .map((s) => {
            const svg = this.heatmapEngine.renderSvgSparkline(s, { width: 180, height: 28 });
            return `
              <div class="heatmap-series-item" style="margin-bottom: 0.5rem;">
                <div style="display: flex; justify-content: space-between; font-size: 0.75rem;">
                  <span>${s.target.name} (計${s.totalCount}回)</span>
                  <span style="color: var(--text-muted);">ピーク: ${s.maxChapterTitle} (${s.maxCount}回)</span>
                </div>
                ${svg}
              </div>
            `;
          })
          .join('');

        rightContentHtml = `
          <div class="character-heatmap-dock">
            <h4>📊 登場人物・用語 出現頻度ヒートマップ</h4>
            <div class="heatmap-matrix-wrapper" style="margin-bottom: 0.75rem;">${matrixSvg}</div>
            <div class="sparklines-wrapper">${sparklinesHtml}</div>
          </div>
        `;
      }
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
