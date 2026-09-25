import type { StateDeltaEvent, SubgraphSlice, NarrativeContext } from '@schema';
import { WorldOntologyEngine } from '@core';
import { PoPAuditEngine } from './core/pop/PoPAuditEngine.js';
import { ThreePaneAuditView } from './core/pop/ThreePaneAuditView.js';
import type { EditEvent, EventType, ThreePaneView } from './core/pop/types.js';
import { OPFSStorage, WriteAheadLog, CrashRecoveryManager, type RecoveryReport } from './core/storage/index.js';
import { NarrativeBridge } from './core/ipc/NarrativeBridge.js';
import type { NarrativeRpcResponse } from './core/ipc/NarrativeRpcProtocol.js';
import { VerticalViewport } from './core/editor/VerticalViewport.js';

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
