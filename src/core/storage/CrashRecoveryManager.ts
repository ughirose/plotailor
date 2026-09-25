/**
 * Crash Recovery Manager
 *
 * Scans WAL logs upon system startup, validates record integrity (checksums and completeness),
 * replays fully committed transactions to primary storage files, rolls back / discards uncommitted
 * or corrupted transactions, and generates recovery session reports for IDE status display.
 */

import { OPFSStorage } from './OPFSStorage.js';
import { WriteAheadLog, WALOpType, WALRecord } from './WriteAheadLog.js';

export interface RecoveryReport {
  recoveredTransactionsCount: number;
  uncommittedDiscardedCount: number;
  corruptedRecordsCount: number;
  totalBytesReplayed: number;
  status: 'CLEAN' | 'RECOVERED_WITH_CHANGES' | 'CORRUPTION_DETECTED';
  details: string[];
}

export class CrashRecoveryManager {
  private storage: OPFSStorage;
  private wal: WriteAheadLog;
  private dataFilePath: string;

  constructor(storage: OPFSStorage, wal: WriteAheadLog, dataFilePath: string = 'main.db') {
    this.storage = storage;
    this.wal = wal;
    this.dataFilePath = dataFilePath;
  }

  /**
   * Evaluates WAL logs and recovers session state.
   */
  recoverSession(): RecoveryReport {
    const details: string[] = [];
    let recoveredTransactionsCount = 0;
    let uncommittedDiscardedCount = 0;
    let corruptedRecordsCount = 0;
    let totalBytesReplayed = 0;

    let records: WALRecord[] = [];
    try {
      records = this.wal.readAllRecords();
    } catch (err: any) {
      return {
        recoveredTransactionsCount: 0,
        uncommittedDiscardedCount: 0,
        corruptedRecordsCount: 1,
        totalBytesReplayed: 0,
        status: 'CORRUPTION_DETECTED',
        details: [`Failed to parse WAL header or file: ${err.message}`],
      };
    }

    // Group records by transaction ID
    const txnMap = new Map<
      number,
      {
        begun: boolean;
        committed: boolean;
        aborted: boolean;
        writes: Array<{ targetOffset: number; payload: Uint8Array }>;
        hasCorruptedRecord: boolean;
      }
    >();

    for (const rec of records) {
      if (!rec.isValidChecksum) {
        corruptedRecordsCount++;
        details.push(`Corrupted record detected in transaction #${rec.txnId}`);
        let entry = txnMap.get(rec.txnId);
        if (entry) {
          entry.hasCorruptedRecord = true;
        }
        continue;
      }

      let entry = txnMap.get(rec.txnId);
      if (!entry) {
        entry = {
          begun: false,
          committed: false,
          aborted: false,
          writes: [],
          hasCorruptedRecord: false,
        };
        txnMap.set(rec.txnId, entry);
      }

      switch (rec.opType) {
        case WALOpType.BEGIN:
          entry.begun = true;
          break;
        case WALOpType.WRITE:
          entry.writes.push({
            targetOffset: rec.targetOffset,
            payload: rec.payload,
          });
          break;
        case WALOpType.COMMIT:
          entry.committed = true;
          break;
        case WALOpType.ABORT:
          entry.aborted = true;
          break;
      }
    }

    // Process transactions in order of TxnId
    const sortedTxnIds = Array.from(txnMap.keys()).sort((a, b) => a - b);

    for (const txnId of sortedTxnIds) {
      const entry = txnMap.get(txnId)!;

      if (entry.hasCorruptedRecord) {
        details.push(`Transaction #${txnId} ignored due to record corruption.`);
        continue;
      }

      if (entry.committed && !entry.aborted) {
        // Replay committed transaction writes
        for (const write of entry.writes) {
          this.storage.atomicWrite(this.dataFilePath, write.payload, write.targetOffset);
          totalBytesReplayed += write.payload.byteLength;
        }
        recoveredTransactionsCount++;
        details.push(
          `Successfully replayed Txn #${txnId} (${entry.writes.length} writes, ${
            entry.writes.reduce((acc, w) => acc + w.payload.byteLength, 0)
          } bytes)`
        );
      } else {
        // Uncommitted or explicitly aborted transaction: rollback / discard
        uncommittedDiscardedCount++;
        details.push(
          `Discarded uncommitted/aborted Txn #${txnId} (${entry.writes.length} writes)`
        );
      }
    }

    // Truncate/reset WAL post recovery
    this.wal.clear();

    let status: RecoveryReport['status'] = 'CLEAN';
    if (corruptedRecordsCount > 0) {
      status = 'CORRUPTION_DETECTED';
    } else if (recoveredTransactionsCount > 0 || uncommittedDiscardedCount > 0) {
      status = 'RECOVERED_WITH_CHANGES';
    }

    return {
      recoveredTransactionsCount,
      uncommittedDiscardedCount,
      corruptedRecordsCount,
      totalBytesReplayed,
      status,
      details,
    };
  }
}
