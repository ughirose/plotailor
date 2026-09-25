import { describe, it, expect, vi } from 'vitest';
import { WorkerHotSwapManager, WorkerInstance } from '../src/index.js';

describe('WorkerHotSwapManager - Zero-Disruption Background Updates', () => {
  function createMockWorker(id: string, version: string): WorkerInstance {
    return {
      id,
      version,
      isReady: true,
      evaluate: vi.fn().mockImplementation(async (input: unknown) => ({ processedBy: id, version, input })),
      terminate: vi.fn(),
    };
  }

  it('evaluates using initial worker', async () => {
    const workerV1 = createMockWorker('worker-1', '1.0.0');
    const manager = new WorkerHotSwapManager(workerV1);

    const res = (await manager.evaluate({ text: 'テスト原稿' })) as { processedBy: string; version: string };
    expect(res.processedBy).toBe('worker-1');
    expect(res.version).toBe('1.0.0');
  });

  it('performs hot-swap in background after idle threshold without interrupting typing', async () => {
    const workerV1 = createMockWorker('worker-1', '1.0.0');
    const workerV2 = createMockWorker('worker-2', '2.0.0');
    const manager = new WorkerHotSwapManager(workerV1, { idleThresholdMs: 100 });

    // User is typing
    manager.reportKeystroke(false);

    // Prepare swap in background
    const swapPromise = manager.prepareHotSwap(workerV2);

    // While preparing, active worker is still v1
    const midRes = (await manager.evaluate({ text: '執筆中' })) as { version: string };
    expect(midRes.version).toBe('1.0.0');

    // Wait for swap to complete after user idles for 100ms
    await swapPromise;

    expect(manager.getState()).toBe('IDLE');
    expect(manager.getActiveWorker()?.id).toBe('worker-2');

    // New evaluation goes to worker v2
    const postRes = (await manager.evaluate({ text: '執筆再開' })) as { version: string };
    expect(postRes.version).toBe('2.0.0');
  });

  it('delays swap if user is currently composing with Japanese IME', async () => {
    const workerV1 = createMockWorker('worker-1', '1.0.0');
    const workerV2 = createMockWorker('worker-2', '2.0.0');
    const manager = new WorkerHotSwapManager(workerV1, { idleThresholdMs: 50, drainTimeoutMs: 500 });

    // Mark IME as actively composing
    manager.reportKeystroke(true);

    let swapped = false;
    const swapPromise = manager.prepareHotSwap(workerV2).then(() => {
      swapped = true;
    });

    // Wait 100ms (more than idleThresholdMs), but since isComposing is true, it shouldn't swap yet
    await new Promise((r) => setTimeout(r, 100));
    expect(swapped).toBe(false);

    // End IME composition
    manager.reportKeystroke(false);
    await swapPromise;
    expect(swapped).toBe(true);
    expect(manager.getActiveWorker()?.id).toBe('worker-2');
  });
});
