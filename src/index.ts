import type { SubgraphSlice } from '@schema';
import { OPFSStorage, WriteAheadLog, CrashRecoveryManager, RecoveryReport } from './core/storage/index.js';

export class WorldOntologyEngine {
  // World ontology engine stub
}

export class PlotailorIDE {
  private engine = new WorldOntologyEngine();
  private storage: OPFSStorage;
  private wal: WriteAheadLog;
  private recoveryManager: CrashRecoveryManager;
  private latestRecoveryReport: RecoveryReport | null = null;

  constructor() {
    this.storage = new OPFSStorage();
    this.wal = new WriteAheadLog(this.storage, 'app.wal');
    this.recoveryManager = new CrashRecoveryManager(this.storage, this.wal, 'main.db');

    // Automatically perform crash recovery upon startup
    this.latestRecoveryReport = this.recoveryManager.recoverSession();
  }

  renderScene(slice: SubgraphSlice): void {
    console.log(`Rendering scene for slice ${slice.id}`);
  }

  getEngine(): WorldOntologyEngine {
    return this.engine;
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

  /**
   * Status provider for 3-pane IDE layout status bar / sidebar integration.
   * Complies with Constitution: non-modal, inline status access.
   */
  getRecoveryStatus(): RecoveryReport | null {
    return this.latestRecoveryReport;
  }
}

export * from './core/ipc/SharedMemoryProtocol.js';
export * from './core/storage/index.js';
