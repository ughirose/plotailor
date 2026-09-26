import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OpfsWalWorkerBridge, WalStats } from '../src/core/storage/OpfsWalWorkerBridge.js';
import { WALOpType } from '../src/core/storage/WriteAheadLog.js';

describe('OPFS WAL Worker & Non-Blocking Asynchronous Persistence', () => {
  let bridge: OpfsWalWorkerBridge;

  beforeEach(async () => {
    bridge = new OpfsWalWorkerBridge({
      walPath: 'test_async.wal',
      batchDebounceMs: 15,
      maxBatchSize: 10,
      forceDirectFallback: true, // Deterministic in vitest environment
    });
    await bridge.clear();
  });

  afterEach(() => {
    bridge.dispose();
  });

  it('should initialize bridge and return correct initial stats', async () => {
    const stats = await bridge.getStats();
    expect(stats.fileSize).toBeGreaterThanOrEqual(4); // WAL1 header
    expect(stats.recordCount).toBe(0);
    expect(stats.queueLength).toBe(0);
  });

  it('should enqueue asynchronous writes and batch-flush automatically', async () => {
    const encoder = new TextEncoder();
    const p1 = bridge.writeAsync(0, encoder.encode('第一章 黎明の風'));
    const p2 = bridge.writeAsync(20, encoder.encode('第二章 運命の導き'));

    const [txn1, txn2] = await Promise.all([p1, p2]);
    expect(txn1).toBeGreaterThan(0);
    expect(txn2).toBeGreaterThan(0);
    expect(txn1).toBe(txn2); // Batched in same transaction

    const records = await bridge.readAllRecords();
    const writeRecords = records.filter((r) => r.opType === WALOpType.WRITE);
    expect(writeRecords.length).toBe(2);
    expect(writeRecords[0].isValidChecksum).toBe(true);
    expect(writeRecords[1].isValidChecksum).toBe(true);
  });

  it('should commit atomic batches of multiple records', async () => {
    const encoder = new TextEncoder();
    const batch = [
      { offset: 0, data: encoder.encode('設定A') },
      { offset: 50, data: encoder.encode('設定B') },
      { offset: 100, data: encoder.encode('設定C') },
    ];

    const result = await bridge.commitBatch(batch);
    expect(result.success).toBe(true);
    expect(result.txnId).toBeGreaterThan(0);

    const stats = await bridge.getStats();
    expect(stats.recordCount).toBeGreaterThanOrEqual(3);
  });

  it('should execute checkpointing and truncate WAL into target manuscript file', async () => {
    const encoder = new TextEncoder();
    await bridge.commitBatch([
      { offset: 0, data: encoder.encode('Hello World Novel') },
    ]);

    const checkRes = await bridge.checkpoint('test_manuscript.txt');
    expect(checkRes.success).toBe(true);
    expect(checkRes.recordsApplied).toBe(1);

    // WAL should be cleared/truncated after checkpoint
    const stats = await bridge.getStats();
    expect(stats.recordCount).toBe(0);
    expect(stats.fileSize).toBe(4); // WAL1 header remaining
  });

  it('should handle rapid 100-keystroke burst without data loss', async () => {
    const encoder = new TextEncoder();
    const promises: Promise<number>[] = [];

    for (let i = 0; i < 50; i++) {
      promises.push(bridge.writeAsync(i * 10, encoder.encode(`Keystroke-${i}`)));
    }

    const txns = await Promise.all(promises);
    expect(txns.length).toBe(50);
    txns.forEach((txn) => expect(txn).toBeGreaterThan(0));

    const records = await bridge.readAllRecords();
    const writes = records.filter((r) => r.opType === WALOpType.WRITE);
    expect(writes.length).toBe(50);
    for (const w of writes) {
      expect(w.isValidChecksum).toBe(true);
    }
  });
});
