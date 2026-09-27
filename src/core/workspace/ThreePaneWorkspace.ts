/**
 * ThreePaneWorkspace - Unified Master Orchestrator for Plotailor Literature IDE
 * 
 * Strict compliance with the 3-Pane Integrated IDE Constitution:
 * - Left Pane: WorldCraft Lore Tree & Character Subgraph Dock
 * - Center Pane: CodeMirror 6 Vertical Writing Mode & Aozora Parser Viewport
 * - Right Pane: Proof of Process (PoP) Merkle Inspector & Real-time Consistency Panel
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
import { EllipsisDashLinterEngine, type EllipsisDashDiagnostic } from '../editor/EllipsisDashLinter.js';
import { PassiveVoiceChecker, type PassiveVoiceDiagnostic } from '../nlp/PassiveVoiceChecker.js';
import { SentenceEndingCadenceCalculator, type CadenceAnalysisResult } from '../nlp/SentenceEndingCadenceCalculator.js';
import { ParagraphIndenter } from '../editor/ParagraphIndenter.js';
import { SceneOutliner, type SceneNode } from '../editor/SceneOutliner.js';
import { TaigenRhythmEngine, type RhythmAnalysisResult } from '../nlp/TaigenRhythmEngine.js';
import { RubySyntaxParser, type RubyFormatStyle, type NormalizationOptions } from '../editor/RubySyntaxParser.js';
import { EmotionalArcAnalyzer, type EmotionalArcResult } from '../nlp/EmotionalArcAnalyzer.js';
import { EmotionalArcChart } from '../nlp/EmotionalArcChart.js';
import { ExclamationSpacingFormatter, type ExclamationDiagnostic, type FormatExclamationResult } from '../editor/ExclamationSpacingFormatter.js';
import { ForeshadowingEngine, type ForeshadowingJumpTarget } from '../editor/ForeshadowingEngine.js';
import { ForeshadowingProgressPanel } from '../editor/ForeshadowingProgressPanel.js';
import { KanjiHirakuDictionaryEngine, type HirakuDiagnostic } from '../editor/KanjiHirakuDictionary.js';
import { PovConsistencyAnalyzer, type PovAnalysisResult } from '../editor/PovConsistencyAnalyzer.js';
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
  activeRightTab: 'pop-audit' | 'consistency-inspector' | 'appearance' | 'revision-history' | 'scene-outliner' | 'emotional-arc' | 'foreshadowing' | 'character-heatmap' | string;
  diagnostics: LoreDiagnostic[];
  ellipsisDashDiagnostics: EllipsisDashDiagnostic[];
  passiveDiagnostics: PassiveVoiceDiagnostic[];
  cadenceResult: CadenceAnalysisResult | null;
  scenes: SceneNode[];
  rhythmResult: RhythmAnalysisResult | null;
  emotionalArc: EmotionalArcResult | null;
  exclamationDiagnostics: ExclamationDiagnostic[];
  hirakuDiagnostics: HirakuDiagnostic[];
  povResult: PovAnalysisResult | null;
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
  private rawStorage: OPFSStorage;
  private storage: MobileResilientStorage;
  private revisionManager: RevisionHistoryManager;
  private hotSwapManager: WorkerHotSwapManager | null = null;
  private ellipsisLinter: EllipsisDashLinterEngine;
  private passiveChecker: PassiveVoiceChecker;
  private cadenceCalculator: SentenceEndingCadenceCalculator;
  private emotionalArcAnalyzer: EmotionalArcAnalyzer;
  private exclamationFormatter: ExclamationSpacingFormatter;
  private foreshadowingEngine: ForeshadowingEngine;
  private hirakuEngine: KanjiHirakuDictionaryEngine;
  private povAnalyzer: PovConsistencyAnalyzer;
  private heatmapEngine: CharacterHeatmapEngine;
  private characterTargets: CharacterTermDef[];
  private state: WorkspaceState;

  constructor(options?: {
    initialText?: string;
    regulations?: TermRegulation[];
    worker?: WorkerInstance;
    passiveVoiceThreshold?: number;
    knownCharacters?: string[];
  }) {
    this.ontologyEngine = new WorldOntologyEngine();
    this.popEngine = new PoPAuditEngine('three-pane-session');
    this.auditView = new ThreePaneAuditView(this.popEngine);
    this.viewport = new VerticalViewport();
    this.linter = new LoreLinterEngine(options?.regulations ?? []);
    this.ellipsisLinter = new EllipsisDashLinterEngine();
    this.passiveChecker = new PassiveVoiceChecker({
      threshold: options?.passiveVoiceThreshold ?? 3,
    });
    this.cadenceCalculator = new SentenceEndingCadenceCalculator();
    this.emotionalArcAnalyzer = new EmotionalArcAnalyzer();
    this.exclamationFormatter = new ExclamationSpacingFormatter();
    this.foreshadowingEngine = new ForeshadowingEngine();
    this.hirakuEngine = new KanjiHirakuDictionaryEngine();
    this.povAnalyzer = new PovConsistencyAnalyzer({ knownCharacters: options?.knownCharacters });
    this.heatmapEngine = new CharacterHeatmapEngine();
    this.characterTargets = [
      { id: 'char-valerius', name: 'ヴァレリウス', aliases: ['ヴァレリウス将軍'] },
      { id: 'char-arthur', name: 'アーサー' },
    ];
    this.rawStorage = new OPFSStorage();
    this.storage = new MobileResilientStorage(this.rawStorage);

    const docId = `doc-${Date.now()}`;
    this.revisionManager = new RevisionHistoryManager(this.rawStorage, docId);

    if (options?.worker) {
      this.hotSwapManager = new WorkerHotSwapManager(options.worker);
    }

    const initialText = options?.initialText ?? '';
    const { map } = AozoraParser.parse(initialText);
    if (initialText) {
      this.foreshadowingEngine.parseManuscript(initialText);
    }

    this.state = {
      currentDocumentId: docId,
      rawText: initialText,
      isComposing: false,
      activeLeftTab: 'world-tree',
      activeRightTab: 'consistency-inspector',
      diagnostics: initialText ? this.linter.lint(initialText, { displayMap: map }) : [],
      ellipsisDashDiagnostics: initialText ? this.ellipsisLinter.lint(initialText, { displayMap: map }) : [],
      passiveDiagnostics: initialText ? this.passiveChecker.check(initialText, { displayMap: map }) : [],
      cadenceResult: initialText ? this.cadenceCalculator.analyze(initialText) : null,
      scenes: initialText ? SceneOutliner.analyzeScenes(initialText) : [],
      rhythmResult: initialText ? TaigenRhythmEngine.analyze(initialText) : null,
      emotionalArc: initialText ? this.emotionalArcAnalyzer.analyze(initialText) : null,
      exclamationDiagnostics: initialText ? this.exclamationFormatter.lint(initialText) : [],
      hirakuDiagnostics: initialText ? this.hirakuEngine.lint(initialText) : [],
      povResult: initialText ? this.povAnalyzer.analyze(initialText) : null,
      heatmapResult: initialText ? this.heatmapEngine.analyze(initialText, this.characterTargets) : null,
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

  public normalizeRuby(options?: NormalizationOptions): string {
    const normalized = RubySyntaxParser.normalize(this.state.rawText, options);
    this.onTextChange(normalized);
    return normalized;
  }

  public convertRubyFormat(targetStyle: RubyFormatStyle): string {
    const converted = RubySyntaxParser.convertFormat(this.state.rawText, targetStyle);
    this.onTextChange(converted);
    return converted;
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

    // Run Lore Linter & Wave 1 Linters (bypassed if composing with Japanese IME)
    const { map } = AozoraParser.parse(newText);
    this.state.diagnostics = this.linter.lint(newText, { isComposing, displayMap: map });
    this.state.ellipsisDashDiagnostics = this.ellipsisLinter.lint(newText, { isComposing, displayMap: map });
    this.state.passiveDiagnostics = this.passiveChecker.check(newText, { isComposing, displayMap: map });
    this.state.cadenceResult = this.cadenceCalculator.analyze(newText);
    this.state.scenes = SceneOutliner.analyzeScenes(newText);
    this.state.rhythmResult = isComposing ? null : TaigenRhythmEngine.analyze(newText);
    this.foreshadowingEngine.parseManuscript(newText);
    this.state.exclamationDiagnostics = this.exclamationFormatter.lint(newText);
    this.state.hirakuDiagnostics = this.hirakuEngine.lint(newText);
    this.state.povResult = isComposing ? null : this.povAnalyzer.analyze(newText);
    this.state.emotionalArc = this.emotionalArcAnalyzer.analyze(newText);
    this.state.heatmapResult = this.heatmapEngine.analyze(newText, this.characterTargets);

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

  public getUnindentedParagraphs(): any[] {
    return ParagraphIndenter.detectUnindentedLines(this.state.rawText);
  }

  public applyParagraphIndentation(): string {
    const indented = ParagraphIndenter.applyIndent(this.state.rawText);
    this.onTextChange(indented);
    return indented;
  }

  public removeParagraphIndentation(): string {
    const removed = ParagraphIndenter.removeIndent(this.state.rawText);
    this.onTextChange(removed);
    return removed;
  }

  public toggleParagraphIndentation(): string {
    const toggled = ParagraphIndenter.toggleIndent(this.state.rawText);
    this.onTextChange(toggled);
    return toggled;
  }

  public getForeshadowingEngine(): ForeshadowingEngine {
    return this.foreshadowingEngine;
  }

  public jumpToForeshadowing(id: string): ForeshadowingJumpTarget | null {
    return this.foreshadowingEngine.jumpToForeshadowing(id);
  }

  public getPovAnalyzer(): PovConsistencyAnalyzer {
    return this.povAnalyzer;
  }

  public formatExclamationSpacing(): FormatExclamationResult {
    const result = this.exclamationFormatter.format(this.state.rawText);
    this.onTextChange(result.formattedText);
    return result;
  }

  public setCharacterTargets(targets: CharacterTermDef[]): void {
    this.characterTargets = targets;
    this.state.heatmapResult = this.heatmapEngine.analyze(this.state.rawText, this.characterTargets);
  }

  /**
   * Safe atomic save to OPFS in background without stalling the UI.
   * Also creates a generation snapshot in RevisionHistoryManager.
   */
  public async autoSave(options?: { autoFormatExclamationSpacing?: boolean }): Promise<boolean> {
    if (this.state.isComposing || this.state.isSaving) {
      return false; // Skip saving while author is actively converting IME
    }

    if (options?.autoFormatExclamationSpacing) {
      this.formatExclamationSpacing();
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
    } else if (this.state.activeRightTab === 'scene-outliner') {
      const outliner = new SceneOutliner();
      rightPaneHtml = outliner.renderRightDockTree(this.state.scenes);
    } else if (this.state.activeRightTab === 'emotional-arc') {
      rightPaneHtml = this.state.emotionalArc
        ? new EmotionalArcChart(this.state.emotionalArc).renderHtmlContainer()
        : '<div class="emotional-arc-empty">データなし</div>';
    } else if (this.state.activeRightTab === 'foreshadowing') {
      rightPaneHtml = new ForeshadowingProgressPanel(this.foreshadowingEngine).renderHtml();
    } else if (this.state.activeRightTab === 'character-heatmap') {
      const result = this.state.heatmapResult;
      const matrixSvg = result ? this.heatmapEngine.renderSvgHeatmapMatrix(result) : '';
      const sparklinesHtml = (result?.series ?? [])
        .map(
          (s) => `
        <div class="character-sparkline-row">
          <span>${s.target.name}</span>
          <div class="character-sparkline">${this.heatmapEngine.renderSvgSparkline(s)}</div>
        </div>
      `
        )
        .join('');

      rightPaneHtml = `
        <div class="character-heatmap-dock">
          <h4>📊 登場人物・用語 出現頻度ヒートマップ</h4>
          <div class="heatmap-matrix-svg">${matrixSvg}</div>
          <div class="sparklines-container">${sparklinesHtml}</div>
        </div>
      `;
    } else {
      const oddCount = this.state.ellipsisDashDiagnostics?.length ?? 0;
      const passiveCount = this.state.passiveDiagnostics?.length ?? 0;
      const hirakuCount = this.state.hirakuDiagnostics?.length ?? 0;
      const taigenDomeCount = this.state.rhythmResult?.summary.consecutiveTaigenDomeMatches ?? 0;
      const duplicateSubjectCount = this.state.rhythmResult?.summary.duplicateSubjectMatches ?? 0;
      const povBadge = this.state.povResult?.badge.badgeHtml ?? '';
      rightPaneHtml = `<div class="consistency-dock"><span>検出表記ゆれ: ${this.state.diagnostics.length}件</span> / <span>偶数対警告: ${oddCount}件</span> / <span>受動態過多: ${passiveCount}件</span> / <span>ひらくべき漢字: ${hirakuCount}件</span> / <span>体言止め連続警告: ${taigenDomeCount}件</span> / <span>主語重複警告: ${duplicateSubjectCount}件</span>${povBadge ? ` / ${povBadge}` : ''}</div>`;
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
