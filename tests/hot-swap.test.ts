import { describe, it, expect, vi } from 'vitest';
import {
  WorkerHotSwapManager,
  InferenceWorker,
  InferenceRequest,
  InferenceResponse,
} from '../src/core/runtime/WorkerHotSwapManager.js';

class MockInferenceWorker implements InferenceWorker<string, string> {
  public id: string;
  public version: string;
  public status: 'initializing' | 'ready' | 'processing' | 'draining' | 'terminated' = 'ready';
  private activeRequestCount = 0;
  private delayMs: number;

  constructor(id: string, version: string = '1.0.0', delayMs: number = 20) {
    this.id = id;
    this.version = version;
    this.delayMs = delayMs;
  }

  async process(request: InferenceRequest<string>): Promise<InferenceResponse<string>> {
    if (this.status === 'terminated') {
      throw new Error(`Worker ${this.id} is terminated`);
    }

    this.activeRequestCount++;
    const prevStatus = this.status;
    if (this.status === 'ready') {
      this.status = 'processing';
    }

    await new Promise((resolve) => setTimeout(resolve, this.delayMs));

    this.activeRequestCount--;
    if (this.status === 'processing' && this.activeRequestCount === 0) {
      this.status = 'ready';
    }

    return {
      requestId: request.id,
      result: `Processed by ${this.id} (v${this.version}): ${request.payload}`,
      timestamp: Date.now(),
    };
  }

  async terminate(): Promise<void> {
    this.status = 'terminated';
  }

  getActiveRequestCount(): number {
    return this.activeRequestCount;
  }
}

describe('WorkerHotSwapManager (Dual-Buffer Hot-Swap Manager)', () => {
  it('should initialize Active and Standby buffers correctly', () => {
    const manager = new WorkerHotSwapManager<string, string>();
    const workerA = new MockInferenceWorker('worker-a', '1.0.0');
    const workerB = new MockInferenceWorker('worker-b', '1.1.0');

    manager.setActiveWorker(workerA);
    manager.setStandbyWorker(workerB);

    expect(manager.getActiveWorker()).toBe(workerA);
    expect(manager.getStandbyWorker()).toBe(workerB);
    expect(manager.getDrainingWorkers()).toHaveLength(0);
  });

  it('should execute transparent request routing to Active worker', async () => {
    const manager = new WorkerHotSwapManager<string, string>();
    const workerA = new MockInferenceWorker('worker-a', '1.0.0', 10);
    manager.setActiveWorker(workerA);

    const req: InferenceRequest<string> = {
      id: 'req-1',
      payload: 'Hello Plotailor',
      timestamp: Date.now(),
    };

    const response = await manager.dispatch(req);
    expect(response.requestId).toBe('req-1');
    expect(response.result).toBe('Processed by worker-a (v1.0.0): Hello Plotailor');
  });

  it('should perform atomic hot-swap from Standby to Active without request loss', async () => {
    const swapCompletedFn = vi.fn();
    const manager = new WorkerHotSwapManager<string, string>({
      onSwapCompleted: swapCompletedFn,
    });

    const worker1 = new MockInferenceWorker('worker-1', '1.0.0', 50);
    const worker2 = new MockInferenceWorker('worker-2', '2.0.0', 10);

    manager.setActiveWorker(worker1);
    manager.setStandbyWorker(worker2);

    // Dispatch request 1 to Worker 1 (in flight)
    const req1Promise = manager.dispatch({
      id: 'req-1',
      payload: 'In-flight text',
      timestamp: Date.now(),
    });

    // Execute atomic hot swap while req1 is still processing
    await manager.swap({ strategy: 'drain' });

    expect(manager.getActiveWorker()).toBe(worker2);
    expect(manager.getStandbyWorker()).toBeNull();
    expect(manager.getDrainingWorkers()).toContain(worker1);
    expect(swapCompletedFn).toHaveBeenCalledWith('worker-1', 'worker-2');

    // Dispatch request 2 after hot-swap - should route to Worker 2
    const req2Promise = manager.dispatch({
      id: 'req-2',
      payload: 'New text post-swap',
      timestamp: Date.now(),
    });

    const [res1, res2] = await Promise.all([req1Promise, req2Promise]);

    expect(res1.result).toBe('Processed by worker-1 (v1.0.0): In-flight text');
    expect(res2.result).toBe('Processed by worker-2 (v2.0.0): New text post-swap');

    // Wait for drain completion
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(worker1.status).toBe('terminated');
    expect(manager.getDrainingWorkers()).toHaveLength(0);
  });

  it('should support immediate termination strategy if requested', async () => {
    const manager = new WorkerHotSwapManager<string, string>();
    const worker1 = new MockInferenceWorker('worker-1', '1.0.0');
    const worker2 = new MockInferenceWorker('worker-2', '2.0.0');

    manager.setActiveWorker(worker1);
    manager.setStandbyWorker(worker2);

    await manager.swap({ strategy: 'immediate' });

    expect(worker1.status).toBe('terminated');
    expect(manager.getActiveWorker()).toBe(worker2);
    expect(manager.getDrainingWorkers()).toHaveLength(0);
  });

  it('should handle high throughput and continuous hot-swaps under zero downtime', async () => {
    const manager = new WorkerHotSwapManager<string, string>();
    let currentWorkerNum = 1;

    let activeWorker = new MockInferenceWorker(`worker-${currentWorkerNum}`, `1.0.${currentWorkerNum}`, 5);
    manager.setActiveWorker(activeWorker);

    const TOTAL_REQUESTS = 100;
    const promises: Promise<InferenceResponse<string>>[] = [];

    for (let i = 0; i < TOTAL_REQUESTS; i++) {
      // Periodic hot-swap every 20 requests
      if (i > 0 && i % 20 === 0) {
        currentWorkerNum++;
        const standbyWorker = new MockInferenceWorker(
          `worker-${currentWorkerNum}`,
          `1.0.${currentWorkerNum}`,
          5
        );
        manager.setStandbyWorker(standbyWorker);
        await manager.swap({ strategy: 'drain' });
      }

      const reqPromise = manager.dispatch({
        id: `req-${i}`,
        payload: `Chunk ${i}`,
        timestamp: Date.now(),
      });
      promises.push(reqPromise);
    }

    const results = await Promise.all(promises);
    expect(results).toHaveLength(TOTAL_REQUESTS);

    for (let i = 0; i < TOTAL_REQUESTS; i++) {
      expect(results[i].requestId).toBe(`req-${i}`);
      expect(results[i].result).toContain(`Chunk ${i}`);
    }

    await manager.destroy();
  });
});
