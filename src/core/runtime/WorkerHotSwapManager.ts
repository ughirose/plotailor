export interface InferenceRequest<TPayload = unknown> {
  id: string;
  payload: TPayload;
  timestamp: number;
}

export interface InferenceResponse<TResult = unknown> {
  requestId: string;
  result: TResult;
  error?: Error | string;
  timestamp: number;
}

export interface InferenceWorker<TReqPayload = unknown, TResResult = unknown> {
  id: string;
  version: string;
  status: 'initializing' | 'ready' | 'processing' | 'draining' | 'terminated';
  process(request: InferenceRequest<TReqPayload>): Promise<InferenceResponse<TResResult>>;
  terminate(): Promise<void>;
  getActiveRequestCount(): number;
}

export type SwapStrategy = 'immediate' | 'drain';

export interface HotSwapOptions {
  strategy?: SwapStrategy;
  drainTimeoutMs?: number;
}

export interface WorkerHotSwapManagerEvents<TReqPayload = unknown, TResResult = unknown> {
  onSwapCompleted?: (oldWorkerId: string | null, newWorkerId: string) => void;
  onWorkerError?: (workerId: string, error: Error) => void;
  onDrainTimeout?: (workerId: string, pendingCount: number) => void;
}

interface PendingItem<TReqPayload, TResResult> {
  request: InferenceRequest<TReqPayload>;
  resolve: (value: InferenceResponse<TResResult>) => void;
  reject: (reason?: any) => void;
}

export class WorkerHotSwapManager<TReqPayload = unknown, TResResult = unknown> {
  private activeWorker: InferenceWorker<TReqPayload, TResResult> | null = null;
  private standbyWorker: InferenceWorker<TReqPayload, TResResult> | null = null;
  private drainingWorkers: Set<InferenceWorker<TReqPayload, TResResult>> = new Set();
  private pendingItems: PendingItem<TReqPayload, TResResult>[] = [];
  private events: WorkerHotSwapManagerEvents<TReqPayload, TResResult>;
  private isDestroyed = false;

  constructor(events: WorkerHotSwapManagerEvents<TReqPayload, TResResult> = {}) {
    this.events = events;
  }

  /**
   * Sets or updates the Active worker buffer.
   */
  public setActiveWorker(worker: InferenceWorker<TReqPayload, TResResult>): void {
    this.activeWorker = worker;
    this.flushPendingQueue();
  }

  /**
   * Sets or prepares a Standby worker buffer.
   */
  public setStandbyWorker(worker: InferenceWorker<TReqPayload, TResResult>): void {
    this.standbyWorker = worker;
  }

  public getActiveWorker(): InferenceWorker<TReqPayload, TResResult> | null {
    return this.activeWorker;
  }

  public getStandbyWorker(): InferenceWorker<TReqPayload, TResResult> | null {
    return this.standbyWorker;
  }

  public getDrainingWorkers(): InferenceWorker<TReqPayload, TResResult>[] {
    return Array.from(this.drainingWorkers);
  }

  /**
   * Atomically swaps the Standby worker to Active.
   * Old Active worker enters draining state and is safely terminated once in-flight requests complete.
   */
  public async swap(options: HotSwapOptions = {}): Promise<void> {
    if (this.isDestroyed) {
      throw new Error('WorkerHotSwapManager is destroyed');
    }

    const { strategy = 'drain', drainTimeoutMs = 5000 } = options;

    if (!this.standbyWorker) {
      throw new Error('Cannot swap: Standby worker is not set');
    }

    const oldActive = this.activeWorker;
    const newActive = this.standbyWorker;

    // Atomic handoff of Active reference
    this.activeWorker = newActive;
    this.standbyWorker = null;

    if (oldActive) {
      if (strategy === 'immediate') {
        await oldActive.terminate();
      } else {
        // Drain strategy
        this.drainingWorkers.add(oldActive);
        oldActive.status = 'draining';

        this.scheduleWorkerDrain(oldActive, drainTimeoutMs);
      }
    }

    if (this.events.onSwapCompleted) {
      this.events.onSwapCompleted(oldActive ? oldActive.id : null, newActive.id);
    }

    // Process any queued requests with the new active worker
    this.flushPendingQueue();
  }

  /**
   * Dispatches an inference request transparently to the Active worker.
   */
  public async dispatch(request: InferenceRequest<TReqPayload>): Promise<InferenceResponse<TResResult>> {
    if (this.isDestroyed) {
      throw new Error('WorkerHotSwapManager is destroyed');
    }

    if (
      !this.activeWorker ||
      (this.activeWorker.status !== 'ready' && this.activeWorker.status !== 'processing')
    ) {
      return new Promise<InferenceResponse<TResResult>>((resolve, reject) => {
        this.pendingItems.push({ request, resolve, reject });
      });
    }

    return await this.activeWorker.process(request);
  }

  /**
   * Schedule draining and subsequent safe termination for an old worker.
   */
  private scheduleWorkerDrain(worker: InferenceWorker<TReqPayload, TResResult>, timeoutMs: number): void {
    const start = Date.now();

    const checkDrain = async () => {
      if (worker.getActiveRequestCount() === 0) {
        this.drainingWorkers.delete(worker);
        await worker.terminate();
        return;
      }

      if (Date.now() - start >= timeoutMs) {
        if (this.events.onDrainTimeout) {
          this.events.onDrainTimeout(worker.id, worker.getActiveRequestCount());
        }
        this.drainingWorkers.delete(worker);
        await worker.terminate();
        return;
      }

      setTimeout(checkDrain, 10);
    };

    setTimeout(checkDrain, 0);
  }

  private async flushPendingQueue(): Promise<void> {
    if (
      this.pendingItems.length === 0 ||
      !this.activeWorker ||
      (this.activeWorker.status !== 'ready' && this.activeWorker.status !== 'processing')
    ) {
      return;
    }

    const items = [...this.pendingItems];
    this.pendingItems = [];

    for (const item of items) {
      try {
        const res = await this.dispatch(item.request);
        item.resolve(res);
      } catch (err) {
        item.reject(err);
      }
    }
  }

  /**
   * Shutdown manager and terminate all workers.
   */
  public async destroy(): Promise<void> {
    this.isDestroyed = true;

    // Reject all pending items
    for (const item of this.pendingItems) {
      item.reject(new Error('WorkerHotSwapManager destroyed'));
    }
    this.pendingItems = [];

    if (this.activeWorker) {
      await this.activeWorker.terminate();
      this.activeWorker = null;
    }
    if (this.standbyWorker) {
      await this.standbyWorker.terminate();
      this.standbyWorker = null;
    }
    for (const draining of this.drainingWorkers) {
      await draining.terminate();
    }
    this.drainingWorkers.clear();
  }
}
