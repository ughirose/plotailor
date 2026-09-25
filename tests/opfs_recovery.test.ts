import { describe, it, expect, beforeEach } from 'vitest';
import {
  OPFSStorage,
  InMemorySyncAccessHandle,
  WriteAheadLog,
  CrashRecoveryManager,
  WALOpType,
  computeCRC32,
  PlotailorIDE,
} from '../src/index.js';

describe('OPFS Atomic Storage, WAL and Crash Recovery', () => {
  let storage: OPFSStorage;
  let wal: WriteAheadLog;
  let recoveryManager: CrashRecoveryManager;

  beforeEach(() => {
    storage = new OPFSStorage();
    wal = new WriteAheadLog(storage, 'test.wal');
    recoveryManager = new CrashRecoveryManager(storage, wal, 'test.db');
  });

  describe('OPFSStorage & InMemorySyncAccessHandle', () => {
    it('should synchronously write and read atomic data', () => {
      const path = 'atomic_test.dat';
      const data = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
      storage.atomicWrite(path, data, 0);

      const readData = storage.read(path, 4, 0);
      expect(Array.from(readData)).toEqual([0xde, 0xad, 0xbe, 0xef]);
    });

    it('should correctly handle truncate and getSize', () => {
      const handle = new InMemorySyncAccessHandle();
      handle.write(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
      expect(handle.getSize()).toBe(8);

      handle.truncate(4);
      expect(handle.getSize()).toBe(4);

      const readBuf = new Uint8Array(4);
      handle.read(readBuf, { at: 0 });
      expect(Array.from(readBuf)).toEqual([1, 2, 3, 4]);
    });
  });

  describe('WriteAheadLog (WAL)', () => {
    it('should write transaction records and read them correctly with valid CRC32', () => {
      const txnId = wal.beginTransaction();
      const payload = new TextEncoder().encode('Hello OPFS WAL');
      wal.logWrite(txnId, 0, payload);
      wal.commitTransaction(txnId);

      const records = wal.readAllRecords();
      expect(records.length).toBe(3); // BEGIN, WRITE, COMMIT
      expect(records[0].opType).toBe(WALOpType.BEGIN);
      expect(records[1].opType).toBe(WALOpType.WRITE);
      expect(records[1].targetOffset).toBe(0);
      expect(new TextDecoder().decode(records[1].payload)).toBe('Hello OPFS WAL');
      expect(records[1].isValidChecksum).toBe(true);
      expect(records[2].opType).toBe(WALOpType.COMMIT);
    });

    it('should detect corrupted CRC checksums', () => {
      const txnId = wal.beginTransaction();
      wal.logWrite(txnId, 0, new Uint8Array([10, 20, 30]));
      wal.commitTransaction(txnId);

      // Corrupt payload byte directly in handle
      const walHandle = storage.getOrCreateHandle('test.wal');
      // Record 1 (BEGIN): header 20B at offset 4 -> end offset 24
      // Record 2 (WRITE): header 20B at offset 24 -> payload at offset 44
      const corruptBuf = new Uint8Array([99]);
      walHandle.write(corruptBuf, { at: 44 });

      const records = wal.readAllRecords();
      expect(records[1].isValidChecksum).toBe(false);
    });
  });

  describe('CrashRecoveryManager', () => {
    it('should replay fully committed transaction on crash recovery', () => {
      const txnId = wal.beginTransaction();
      const data = new TextEncoder().encode('Committed Block Data');
      wal.logWrite(txnId, 0, data);
      wal.commitTransaction(txnId);

      // Main DB has not been updated directly (simulating pre-checkpoint crash)
      const dbHandle = storage.getOrCreateHandle('test.db');
      expect(dbHandle.getSize()).toBe(0);

      const report = recoveryManager.recoverSession();
      expect(report.status).toBe('RECOVERED_WITH_CHANGES');
      expect(report.recoveredTransactionsCount).toBe(1);
      expect(report.uncommittedDiscardedCount).toBe(0);

      // Verify DB now contains replayed data
      const readData = storage.read('test.db', data.length, 0);
      expect(new TextDecoder().decode(readData)).toBe('Committed Block Data');
    });

    it('should discard uncommitted transaction on crash recovery', () => {
      const txn1 = wal.beginTransaction();
      wal.logWrite(txn1, 0, new TextEncoder().encode('Txn 1 Data'));
      wal.commitTransaction(txn1);

      const txn2 = wal.beginTransaction();
      wal.logWrite(txn2, 100, new TextEncoder().encode('Txn 2 Data (Uncommitted)'));
      // No commit for txn2 (simulating power failure during txn2)

      const report = recoveryManager.recoverSession();
      expect(report.recoveredTransactionsCount).toBe(1);
      expect(report.uncommittedDiscardedCount).toBe(1);

      // Txn1 replayed, Txn2 discarded
      const txn1Data = storage.read('test.db', 10, 0);
      expect(new TextDecoder().decode(txn1Data)).toBe('Txn 1 Data');

      const txn2Data = storage.read('test.db', 20, 100);
      expect(txn2Data.every((b) => b === 0)).toBe(true);
    });

    it('should handle corrupted WAL record during crash recovery', () => {
      const txn = wal.beginTransaction();
      wal.logWrite(txn, 0, new Uint8Array([1, 2, 3, 4]));
      wal.commitTransaction(txn);

      // Corrupt byte at payload position
      const walHandle = storage.getOrCreateHandle('test.wal');
      walHandle.write(new Uint8Array([0xff]), { at: 44 });

      const report = recoveryManager.recoverSession();
      expect(report.status).toBe('CORRUPTION_DETECTED');
      expect(report.corruptedRecordsCount).toBe(1);
    });
  });

  describe('PlotailorIDE Integration', () => {
    it('should automatically initialize OPFS, WAL, CrashRecoveryManager, and report clean or recovered status without modal dialogs', () => {
      const ide = new PlotailorIDE();
      const status = ide.getRecoveryStatus();
      expect(status).not.toBeNull();
      expect(status?.status).toBe('CLEAN');
      expect(ide.getStorage()).toBeInstanceOf(OPFSStorage);
      expect(ide.getWAL()).toBeInstanceOf(WriteAheadLog);
      expect(ide.getRecoveryManager()).toBeInstanceOf(CrashRecoveryManager);
    });
  });
});
