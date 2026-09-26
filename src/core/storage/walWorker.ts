/**
 * walWorker.ts - Dedicated Web Worker for Asynchronous OPFS Write-Ahead Logging
 *
 * Runs off the main UI thread to prevent keystroke lag and frame drops
 * during large manuscript edits (100k - 1M chars).
 */

import { WriteAheadLog, WALOpType, WALRecord } from './WriteAheadLog.js';
import { OPFSStorage } from './OPFSStorage.js';

export interface WalWorkerRequest {
  id: number;
  type: 'INIT' | 'WRITE_BATCH' | 'CHECKPOINT' | 'READ_ALL' | 'CLEAR' | 'STATS';
  walPath?: string;
  targetPath?: string;
  records?: Array<{ offset: number; data: Uint8Array }>;
}

export interface WalWorkerResponse {
  id: number;
  type: 'INIT_ACK' | 'WRITE_BATCH_ACK' | 'CHECKPOINT_ACK' | 'READ_ALL_ACK' | 'CLEAR_ACK' | 'STATS_ACK' | 'ERROR';
  txnId?: number;
  recordsApplied?: number;
  records?: WALRecord[];
  stats?: {
    fileSize: number;
    recordCount: number;
    lastTxnId: number;
  };
  error?: string;
}

let storage: OPFSStorage | null = null;
let wal: WriteAheadLog | null = null;
let walFilePath = 'app.wal';

export function handleWorkerMessage(req: WalWorkerRequest, postReply: (res: WalWorkerResponse) => void): void {
  try {
    switch (req.type) {
      case 'INIT': {
        walFilePath = req.walPath || 'app.wal';
        storage = new OPFSStorage();
        wal = new WriteAheadLog(storage, walFilePath);
        postReply({ id: req.id, type: 'INIT_ACK' });
        break;
      }

      case 'WRITE_BATCH': {
        if (!wal) {
          throw new Error('WAL not initialized');
        }
        const records = req.records || [];
        const txnId = wal.beginTransaction();
        for (const item of records) {
          wal.logWrite(txnId, item.offset, item.data);
        }
        wal.commitTransaction(txnId);
        postReply({ id: req.id, type: 'WRITE_BATCH_ACK', txnId });
        break;
      }

      case 'CHECKPOINT': {
        if (!wal || !storage) {
          throw new Error('WAL not initialized');
        }
        const allRecords = wal.readAllRecords();
        const committedWrites = new Map<number, Uint8Array>();
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

        postReply({ id: req.id, type: 'CHECKPOINT_ACK', recordsApplied: applied });
        break;
      }

      case 'READ_ALL': {
        if (!wal) {
          throw new Error('WAL not initialized');
        }
        const records = wal.readAllRecords();
        postReply({ id: req.id, type: 'READ_ALL_ACK', records });
        break;
      }

      case 'CLEAR': {
        if (!wal) {
          throw new Error('WAL not initialized');
        }
        wal.clear();
        postReply({ id: req.id, type: 'CLEAR_ACK' });
        break;
      }

      case 'STATS': {
        if (!wal || !storage) {
          throw new Error('WAL not initialized');
        }
        const handle = storage.getOrCreateHandle(walFilePath);
        const records = wal.readAllRecords();
        const lastTxnId = records.length > 0 ? records[records.length - 1].txnId : 0;
        postReply({
          id: req.id,
          type: 'STATS_ACK',
          stats: {
            fileSize: handle.getSize(),
            recordCount: records.length,
            lastTxnId,
          },
        });
        break;
      }

      default:
        postReply({ id: req.id, type: 'ERROR', error: `Unknown request type: ${(req as any).type}` });
    }
  } catch (err: any) {
    postReply({ id: req.id, type: 'ERROR', error: err?.message || String(err) });
  }
}

// In standard DedicatedWorkerGlobalScope:
if (typeof self !== 'undefined' && typeof (self as any).postMessage === 'function' && typeof window === 'undefined') {
  self.onmessage = (e: MessageEvent<WalWorkerRequest>) => {
    handleWorkerMessage(e.data, (res) => self.postMessage(res));
  };
}
