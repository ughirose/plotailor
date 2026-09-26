/**
 * OpfsWalWorkerBridge.ts - Main-thread bridge for Asynchronous OPFS WAL Worker
 *
 * Ensures 0ms main thread blocking during continuous keystroke writes in large manuscripts.
 * Supports automatic transparent fallback when Web Worker or OPFS is unavailable in testing/node.
 */

import { WriteAheadLog, WALOpType, WALRecord } from './WriteAheadLog.js';
import { OPFSStorage } from './OPFSStorage.js';
import { WalWorkerRequest, WalWorkerResponse, handleWorkerMessage } from './walWorker.js';

export interface WalBridgeOptions {
  walPath?: string;
  batchDebounceMs?: number;
  maxBatchSize?: number;
  workerInstance?: Worker;
  forceDirectFallback?: boolean;
}

export interface WalStats {
  fileSize: number;
  recordCount: number;
  lastTxnId: number;
  queueLength: number;
  isWorkerActive: boolean;
}

export class OpfsWalWorkerBridge {
  private walPath: string;
  private batchDebounceMs: number;
  private maxBatchSize: number;
  private worker: Worker | null = null;
  private isFallback: boolean = false;

  // Direct Fallback instances
  private fallbackStorage: OPFSStorage | null = null;
  private fallbackWal: WriteAheadLog | null = null;

  // Request/Response correlation
  private nextReqId = 1;
  private pendingRequests = new Map<
    number,
    { resolve: (val: any) => void; reject: (err: any) => void }
  >();

  // Write queue for batching
  private writeQueue: Array<{ offset: number; data: Uint8Array }> = [];
  private batchTimer: any = null;
  private pendingBatchResolvers: Array<(txnId: number) => void> = [];

  constructor(options: WalBridgeOptions = {}) {
    this.walPath = options.walPath || 'app.wal';
    this.batchDebounceMs = options.batchDebounceMs ?? 20;
    this.maxBatchSize = options.maxBatchSize ?? 100;

    if (options.forceDirectFallback || typeof Worker === 'undefined') {
      this.initDirectFallback();
    } else if (options.workerInstance) {
      this.worker = options.workerInstance;
      this.setupWorkerListeners();
      this.sendRequest({ type: 'INIT', walPath: this.walPath }).catch(() => {
        this.initDirectFallback();
      });
    } else {
      // In browser environment with standard Vite worker constructor
      try {
        // Vite worker import or blob worker fallback
        this.worker = new Worker(new URL('./walWorker.ts', import.meta.url), { type: 'module' });
        this.setupWorkerListeners();
        this.sendRequest({ type: 'INIT', walPath: this.walPath }).catch(() => {
          this.initDirectFallback();
        });
      } catch {
        this.initDirectFallback();
      }
    }
  }

  private initDirectFallback(): void {
    this.isFallback = true;
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch {
        // ignore
      }
      this.worker = null;
    }
    this.fallbackStorage = new OPFSStorage();
    this.fallbackWal = new WriteAheadLog(this.fallbackStorage, this.walPath);
  }

  private setupWorkerListeners(): void {
    if (!this.worker) return;

    this.worker.onmessage = (e: MessageEvent<WalWorkerResponse>) => {
      const res = e.data;
      const pending = this.pendingRequests.get(res.id);
      if (!pending) return;

      this.pendingRequests.delete(res.id);
      if (res.type === 'ERROR') {
        pending.reject(new Error(res.error || 'Worker error'));
      } else {
        pending.resolve(res);
      }
    };

    this.worker.onerror = (err) => {
      console.warn('[OpfsWalWorkerBridge] Worker encountered error, activating fallback:', err);
      this.initDirectFallback();
    };
  }

  private async sendRequest(reqData: Omit<WalWorkerRequest, 'id'>): Promise<WalWorkerResponse> {
    if (this.isFallback) {
      const id = this.nextReqId++;
      return this.handleFallbackDirect(id, reqData);
    }

    return new Promise<WalWorkerResponse>((resolve, reject) => {
      const id = this.nextReqId++;
      const fullReq: WalWorkerRequest = { id, ...reqData };
      this.pendingRequests.set(id, { resolve, reject });
      this.worker!.postMessage(fullReq);
    });
  }

  private handleFallbackDirect(id: number, req: Omit<WalWorkerRequest, 'id'>): WalWorkerResponse {
    if (!this.fallbackWal || !this.fallbackStorage) {
      this.initDirectFallback();
    }
    const wal = this.fallbackWal!;
    const storage = this.fallbackStorage!;

    switch (req.type) {
      case 'INIT':
        return { id, type: 'INIT_ACK' };
      case 'WRITE_BATCH': {
        const records = req.records || [];
        const txnId = wal.beginTransaction();
        for (const item of records) {
          wal.logWrite(txnId, item.offset, item.data);
        }
        wal.commitTransaction(txnId);
        return { id, type: 'WRITE_BATCH_ACK', txnId };
      }
      case 'CHECKPOINT': {
        const allRecords = wal.readAllRecords();
        const targetPath = req.targetPath || 'manuscript.txt';
        const targetHandle = storage.getOrCreateHandle(targetPath);
        let applied = 0;
        for (const rec of allRecords) {
          if (rec.opType === WALOpType.WRITE && rec.isValidChecksum) {
            targetHandle.write(rec.payload, { at: rec.targetOffset });
            applied++;
          }
        }
        targetHandle.flush();
        wal.clear();
        return { id, type: 'CHECKPOINT_ACK', recordsApplied: applied };
      }
      case 'READ_ALL': {
        const records = wal.readAllRecords();
        return { id, type: 'READ_ALL_ACK', records };
      }
      case 'CLEAR': {
        wal.clear();
        return { id, type: 'CLEAR_ACK' };
      }
      case 'STATS': {
        const handle = storage.getOrCreateHandle(this.walPath);
        const records = wal.readAllRecords();
        const lastTxnId = records.length > 0 ? records[records.length - 1].txnId : 0;
        return {
          id,
          type: 'STATS_ACK',
          stats: {
            fileSize: handle.getSize(),
            recordCount: records.length,
            lastTxnId,
          },
        };
      }
      default:
        return { id, type: 'ERROR', error: 'Unknown fallback request' };
    }
  }

  /**
   * Non-blocking write queuing. Flushes automatically when maxBatchSize is reached or debounce expires.
   */
  public async writeAsync(offset: number, data: Uint8Array): Promise<number> {
    return new Promise<number>((resolve) => {
      this.writeQueue.push({ offset, data });
      this.pendingBatchResolvers.push(resolve);

      if (this.writeQueue.length >= this.maxBatchSize) {
        this.flushBatchImmediately();
      } else if (!this.batchTimer) {
        this.batchTimer = setTimeout(() => {
          this.flushBatchImmediately();
        }, this.batchDebounceMs);
      }
    });
  }

  /**
   * Explicitly commits a batch of writes immediately in a single atomic transaction.
   */
  public async commitBatch(records: Array<{ offset: number; data: Uint8Array }>): Promise<{ txnId: number; success: boolean }> {
    const res = await this.sendRequest({
      type: 'WRITE_BATCH',
      records,
    });
    return {
      txnId: res.txnId ?? 0,
      success: res.type === 'WRITE_BATCH_ACK',
    };
  }

  /**
   * Forces any queued writes to be sent to WAL immediately.
   */
  public async flush(): Promise<number> {
    if (this.writeQueue.length === 0) return 0;
    return this.flushBatchImmediately();
  }

  private async flushBatchImmediately(): Promise<number> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    if (this.writeQueue.length === 0) return 0;

    const currentBatch = [...this.writeQueue];
    const resolvers = [...this.pendingBatchResolvers];
    this.writeQueue = [];
    this.pendingBatchResolvers = [];

    try {
      const res = await this.commitBatch(currentBatch);
      for (const resolve of resolvers) {
        resolve(res.txnId);
      }
      return res.txnId;
    } catch (err) {
      for (const resolve of resolvers) {
        resolve(-1);
      }
      throw err;
    }
  }

  /**
   * Checkpoints WAL records into the target manuscript file and truncates WAL.
   */
  public async checkpoint(targetPath?: string): Promise<{ recordsApplied: number; success: boolean }> {
    await this.flush();
    const res = await this.sendRequest({
      type: 'CHECKPOINT',
      targetPath,
    });
    return {
      recordsApplied: res.recordsApplied ?? 0,
      success: res.type === 'CHECKPOINT_ACK',
    };
  }

  /**
   * Reads all valid WAL records.
   */
  public async readAllRecords(): Promise<WALRecord[]> {
    await this.flush();
    const res = await this.sendRequest({
      type: 'READ_ALL',
    });
    return res.records ?? [];
  }

  /**
   * Clears the WAL file.
   */
  public async clear(): Promise<void> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    this.writeQueue = [];
    this.pendingBatchResolvers = [];

    await this.sendRequest({
      type: 'CLEAR',
    });
  }

  /**
   * Retrieves operational statistics.
   */
  public async getStats(): Promise<WalStats> {
    const res = await this.sendRequest({
      type: 'STATS',
    });
    return {
      fileSize: res.stats?.fileSize ?? 0,
      recordCount: res.stats?.recordCount ?? 0,
      lastTxnId: res.stats?.lastTxnId ?? 0,
      queueLength: this.writeQueue.length,
      isWorkerActive: !this.isFallback,
    };
  }

  public dispose(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    this.writeQueue = [];
    this.pendingBatchResolvers = [];
    this.pendingRequests.clear();

    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}
