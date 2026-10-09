import type { StateDeltaEvent, SubgraphSlice, NarrativeContext } from '@schema';
import { WorldOntologyEngine } from '@core';
import { PoPAuditEngine } from './core/pop/PoPAuditEngine.js';
import { ThreePaneAuditView } from './core/pop/ThreePaneAuditView.js';
import type { EditEvent, EventType, ThreePaneView } from './core/pop/types.js';
import { OPFSStorage, WriteAheadLog, CrashRecoveryManager, type RecoveryReport } from './core/storage/index.js';
import { NarrativeBridge } from './core/ipc/NarrativeBridge.js';
import type { NarrativeRpcResponse } from './core/ipc/NarrativeRpcProtocol.js';
import { VerticalViewport } from './core/editor/VerticalViewport.js';
import type { RubyFormat } from './core/editor/RubySyntaxParser.js';
import { RubyBatchConverter, type BatchConverterOptions, type ConversionResult } from './core/editor/RubyBatchConverter.js';

export class PlotailorIDE {
  private engine = new WorldOntologyEngine();
  private popEngine = new PoPAuditEngine('author-ide');
  private threePaneAuditView = new ThreePaneAuditView(this.popEngine);
  private storage: OPFSStorage;
  private wal: WriteAheadLog;
  private recoveryManager: CrashRecoveryManager;
  private latestRecoveryReport: RecoveryReport | null = null;
  private narrativeBridge = new NarrativeBridge();
  private viewport = new VerticalViewport();

  constructor() {
    this.storage = new OPFSStorage();
    this.wal = new WriteAheadLog(this.storage, 'app.wal');
    this.recoveryManager = new CrashRecoveryManager(this.storage, this.wal, 'main.db');

    // Automatically perform crash recovery upon startup
    this.latestRecoveryReport = this.recoveryManager.recoverSession();
  }

  async renderScene(slice: SubgraphSlice): Promise<void> {
    console.log(`Rendering scene for slice ${slice.id}`);
    await this.narrativeBridge.call('processSlice', { slice });
  }

  async evaluateNarrativeContext(context: NarrativeContext): Promise<NarrativeRpcResponse<'evaluateNarrative'>> {
    return this.narrativeBridge.call('evaluateNarrative', { context });
  }

  async analyzeText(text: string): Promise<NarrativeRpcResponse<'analyzeText'>> {
    return this.narrativeBridge.call('analyzeText', { text });
  }

  getEngine(): WorldOntologyEngine {
    return this.engine;
  }

  getPoPEngine(): PoPAuditEngine {
    return this.popEngine;
  }

  getThreePaneAuditView(): ThreePaneAuditView {
    return this.threePaneAuditView;
  }

  getStorage(): OPFSStorage {
    return this.storage;
  }

  getWAL(): WriteAheadLog {
    return this.wal;
  }

  getRecoveryManager(): CrashRecoveryManager {
    return this.recoveryManager;
  }

  getNarrativeBridge(): NarrativeBridge {
    return this.narrativeBridge;
  }

  getViewport(): VerticalViewport {
    return this.viewport;
  }

  /**
   * Status provider for 3-pane IDE layout status bar / sidebar integration.
   * Complies with Constitution: non-modal, inline status access.
   */
  getRecoveryStatus(): RecoveryReport | null {
    return this.latestRecoveryReport;
  }

  /**
   * Records an edit event into the creation process proof engine
   * and applies state delta if provided.
   */
  recordEditEvent<T = unknown>(input: {
    id?: string;
    eventType: EventType;
    payload: T;
    delta?: StateDeltaEvent;
    authorId?: string;
    metadata?: Record<string, unknown>;
  }): EditEvent<T> {
    const eventId = input.id ?? `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (input.delta) {
      this.engine.applyDelta(input.delta);
    }

    const recordedEvent = this.popEngine.recordEvent({
      id: eventId,
      eventType: input.eventType,
      payload: input.payload,
      delta: input.delta,
      authorId: input.authorId,
      metadata: input.metadata,
    });

    return recordedEvent;
  }

  /**
   * Renders and returns the 3-pane layout state.
   */
  renderThreePaneLayout(): ThreePaneView {
    return this.threePaneAuditView.render();
  }

  /**
   * Batch normalize variant ruby/bouten notations into standard Aozora format.
   */
  batchNormalizeRuby(text: string): ConversionResult {
    return RubyBatchConverter.normalizeText(text);
  }

  /**
   * Convert text between Aozora, Kakuyomu, and Narou ruby formats.
   */
  convertRubyFormat(text: string, options: BatchConverterOptions): ConversionResult {
    return RubyBatchConverter.convertFormat(text, options);
  }

  /**
   * Import text pipeline with auto format detection and normalization.
   */
  importText(text: string, options?: { defaultFormat?: RubyFormat }): ConversionResult {
    return RubyBatchConverter.importText(text, options);
  }

  /**
   * Export text pipeline into requested target format.
   */
  exportText(text: string, targetFormat: RubyFormat, options?: { convertBoutenToNarouDots?: boolean }): ConversionResult {
    return RubyBatchConverter.exportText(text, targetFormat, options);
  }
}

export * from './core/ipc/SharedMemoryProtocol.js';
export * from './core/pop/types.js';
export * from './core/pop/CBOR.js';
export * from './core/pop/MerkleHashChain.js';
export * from './core/pop/PoPAuditEngine.js';
export * from './core/pop/ThreePaneAuditView.js';
export * from './core/storage/index.js';
export * from './core/ipc/NarrativeRpcProtocol.js';
export * from './core/ipc/NarrativeEngine.js';
export * from './core/ipc/NarrativeBridge.js';
export * from './core/editor/AozoraParser.js';
export * from './core/editor/ScrollNormalizer.js';
export * from './core/editor/VerticalViewport.js';
export * from './core/editor/LoreLinter.js';
export * from './core/nlp/AhoCorasickAutomaton.js';
export * from './core/storage/MobileResilientStorage.js';
export * from './core/runtime/WorkerHotSwapManager.js';
export * from './core/workspace/ThreePaneWorkspace.js';
export * from './core/editor/cm6ImeGuard.js';
export { PoPCertificateExporter } from './core/audit/PoPCertificateExporter.js';
export {
  RubyWidget,
  RubyOffWidget,
  BoutenWidget,
  RubyDecorationPlugin,
  rubyDecorationPlugin,
  rubyTheme,
  rubyDecorationExtension,
  parseAndBuildDecorations,
  rubyConfigFacet,
  setRubyDisplayMode,
  type RubyDisplayMode,
  type RubyDecorationConfig,
  type RubyMatch,
  type BoutenMatch,
  type ParsedMatch,
  type MappingSpan,
} from './core/editor/RubyDecorationExtension.js';
export * from './ui/LoreInspectorDock.js';
export * from './core/lore/LoreEntityManager.js';
export * from './core/causality/CausalDagEngine.js';
export * from './core/storage/EncryptedOPFSStorage.js';
export * from './core/editor/NarrativeLinterEngine.js';
export * from './core/editor/NarrativeWorkerBridge.js';
export * from './core/editor/CodeMirrorNarrativeExtension.js';
export * from './ui/NarrativeInspectorDock.js';
export * from './core/editor/VerticalWritingExtension.js';
export * from './core/fs/index.js';
export * from './core/project/index.js';
export { PlotailorApp } from './app/main.js';
export * from './core/editor/BracketPairChecker.js';
export * from './core/editor/EllipsisDashLinter.js';
export * from './core/editor/KanjiHiraganaRatioEngine.js';
export * from './core/nlp/PassiveVoiceChecker.js';
export * from './core/nlp/SentenceEndingCadenceCalculator.js';
export * from './core/editor/ParagraphIndenter.js';
export * from './core/editor/DemonstrativeDensityLinter.js';
export * from './core/editor/StyleDiscomfortDetector.js';
export * from './core/editor/PovConsistencyAnalyzer.js';
export * from './core/editor/ParticleRepetitionLinter.js';
export * from './core/editor/SyntacticParticleAuditor.js';
export {
  SceneOutliner,
  type SceneOutlinerOptions,
  type SceneNode,
  type SceneHeadingNode,
} from './core/editor/SceneOutliner.js';
export * from './core/editor/RubySyntaxParser.js';
export * from './core/editor/RubyShortcutExtension.js';
export * from './core/editor/ForeshadowingEngine.js';
export * from './core/editor/ForeshadowingProgressPanel.js';
export * from './core/editor/ExclamationSpacingFormatter.js';
export * from './core/nlp/EmotionalArcAnalyzer.js';
export * from './core/nlp/EmotionalArcChart.js';
export * from './core/editor/CharacterHeatmap.js';
export * from './core/nlp/TaigenRhythmEngine.js';
export * from './core/editor/KanjiHirakuDictionary.js';
export * from './core/editor/HierarchicalTocEngine.js';
export * from './core/editor/JapaneseBeautifyExtension.js';
export * from './types/manuscript-counter.js';
export * from './ui/OrthographyInspector.js';
export * from './types/frontmatter-scene.js';
export * from './lib/parser/frontmatter-parser.js';
export * from './types/vertical-layout.js';
export * from './core/editor/VerticalCanvasCompositor.js';
export { EditorView } from './web/EditorView.js';
export * from './core/editor/RubyBatchConverter.js';
export * from './types/literature-ast.js';
export * from './lib/ast/literature-ast-parser.js';
export * from './ui/FullscreenStatusBar.js';
export * from './core/editor/KinsokuEngine.js';
export * from './core/editor/WritingVelocityWidget.js';
export * from './core/types/multisite-export.js';
export * from './core/exporters/multisite-novel-formatter.js';
export * from './app/controllers/index.js';
export { TateChuYokoParser, type TcyMatch, type TcyParseResult, type TcyOptions } from './core/editor/TateChuYokoParser.js';
export { BoutenSyntaxTransformer, type BoutenType, type BoutenFormat, type BoutenParseResult, type ConvertOptions } from './core/editor/BoutenSyntaxTransformer.js';
export { ManuscriptSheetCalculator, type ManuscriptLayout, type ManuscriptCalculatorOptions } from './core/editor/ManuscriptSheetCalculator.js';
export { Epub3PackageBuilder, type EpubManifestItem, type EpubTocItem, type EpubLandmarkItem, type EpubPackageOptions, type ChapterInput } from './core/export/Epub3PackageBuilder.js';
export * from './core/storage/NonDestructiveRevisionGraph.js';
export * from './core/editor/RevisionGranularityManager.js';
export * from './core/editor/CharacterInteractionMatrix.js';
export { CharacterEmotionalArcTracker, type CharacterDef, type EmotionWord, type CoOccurrenceMention, type ArcProgressPoint, type CharacterEmotionalArcSeries, type ClimaxPoint, type ManuscriptSegment, type EmotionalArcAnalysisResult, type AnalysisOptions } from './core/editor/CharacterEmotionalArcTracker.js';
export * from './core/editor/SensoryLexiconScorer.js';
export * from './core/editor/DecorationLegendDictionary.js';
export * from './core/editor/SlashMentionCommandParser.js';
export * from './core/editor/VerticalKeyNavigationEngine.js';
export * from './core/editor/DemonstrativeOveruseDetector.js';
export * from './core/editor/PassiveVoiceDetector.js';
export * from './core/editor/NarrativeTermLocalizer.js';
export { LandingPageView } from './web/LandingPageView.js';
export { NarrativeNanoDebugView } from './web/NarrativeNanoDebugView.js';
export {
  compositionGuardPlugin,
  compositionGuardFacet,
  createCompositionGuardExtension,
  type CompositionGuardConfig,
  type DecorationScanner,
} from './core/editor/compositionGuardPlugin.js';

export * from './core/editor/ChunkedRangeSet.js';
export * from './core/editor/VerticalWidthOracle.js';
export * from './core/editor/QwertyTypoDetector.js';
export * from './core/editor/CadenceListenerExtension.js';
export * from './core/editor/PrhRuleEngine.js';
export * from './core/lore/StrayLoreEngine.js';
export {
  KinsokuAlignmentEngine,
  type KinsokuAlignmentConfig,
  type KinsokuBoundaryViolation,
  type AlignmentMapEntry,
  type AlignedLine,
  type AlignmentResult,
} from './core/editor/KinsokuAlignmentEngine.js';
export * from './core/lore/ShelvedLoreArchiveManager.js';
export * from './core/project/ProjectDuplicateEngine.js';
export * from './core/editor/TypographyThemeConfig.js';
export * from './data/SampleNovelData.js';
export {
  PrhPersistenceManager,
  DEFAULT_PRH_RULES,
  exportToPrhJson,
  parsePrhJson,
  parsePrhYaml,
} from './core/editor/PrhPersistenceManager.js';
export {
  VerticalInspectorGeometryBridge,
  type GeometryViewportOptions,
  type InspectorTargetRange,
  type ColumnSegmentRect,
  type CharCoordinate,
} from './core/editor/VerticalInspectorGeometryBridge.js';
export * from './core/editor/CausalTimelineSyncEngine.js';
export * from './core/offload/ColabOffloadClient.js';
export * from './core/collab/P2PCrdtSyncEngine.js';


