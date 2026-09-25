import {
  SharedMemoryProtocol,
  SharedMemoryProducer,
  SharedMemoryConsumer,
  DEFAULT_BUFFER_SIZE,
} from './SharedMemoryProtocol.js';
import {
  NarrativeMethod,
  NarrativeMethodMap,
  NarrativeRpcRequest,
  NarrativeRpcResponse,
  serializeRpcRequest,
  deserializeRpcResponse,
  serializeRpcResponse,
  deserializeRpcRequest,
} from './NarrativeRpcProtocol.js';
import { MockNarrativeEngine, NarrativeWorkerHost } from './NarrativeEngine.js';

export type TransportMode = 'shared-memory' | 'worker-postmessage' | 'mock-fallback';

export interface NarrativeBridgeOptions {
  preferredTransport?: TransportMode;
  requestTimeoutMs?: number; // default 50ms per task requirement
  maxRestartAttempts?: number; // default 3
  workerFactory?: () => Worker;
  customWorker?: Worker;
  sab?: SharedArrayBuffer;
}

export interface BridgeStats {
  requestsTotal: number;
  requestsSuccessful: number;
  timeoutsCount: number;
  restartsCount: number;
  fallbacksCount: number;
  currentTransportMode: TransportMode;
}

export class RpcTimeoutError extends Error {
  constructor(method: string, timeoutMs: number) {
    super(`RPC Request '${method}' timed out after ${timeoutMs}ms`);
    this.name = 'RpcTimeoutError';
  }
}

export class NarrativeBridge {
  private transportMode: TransportMode = 'mock-fallback';
  private requestTimeoutMs: number;
  private maxRestartAttempts: number;
  private restartAttempts = 0;

  private workerFactory?: () => Worker;
  private activeWorker?: Worker;

  private sab?: SharedArrayBuffer;
  private requestProducer?: SharedMemoryProducer;
  private responseConsumer?: SharedMemoryConsumer;

  private mockEngine = new MockNarrativeEngine();
  private pendingRequests = new Map<
    string,
    {
      resolve: (value: NarrativeRpcResponse<any>) => void;
      reject: (reason: any) => void;
      timer: ReturnType<typeof setTimeout>;
      method: NarrativeMethod;
    }
  >();

  private stats: BridgeStats = {
    requestsTotal: 0,
    requestsSuccessful: 0,
    timeoutsCount: 0,
    restartsCount: 0,
    fallbacksCount: 0,
    currentTransportMode: 'mock-fallback',
  };

  private requestCounter = 0;

  constructor(options: NarrativeBridgeOptions = {}) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? 50;
    this.maxRestartAttempts = options.maxRestartAttempts ?? 3;
    this.workerFactory = options.workerFactory;

    if (options.customWorker) {
      this.activeWorker = options.customWorker;
    }

    if (options.sab) {
      this.sab = options.sab;
    }

    this.initTransport(options.preferredTransport);
  }

  /**
   * Heuristically determines and initializes the best available transport mechanism.
   */
  private initTransport(preferred?: TransportMode): void {
    if (preferred === 'mock-fallback') {
      this.setTransportMode('mock-fallback');
      return;
    }

    // Attempt SharedArrayBuffer transport if requested or available
    const hasSAB =
      typeof SharedArrayBuffer !== 'undefined' &&
      (this.sab !== undefined || preferred === 'shared-memory');

    if (hasSAB && (preferred === 'shared-memory' || !preferred)) {
      try {
        if (!this.sab) {
          this.sab = SharedMemoryProtocol.create(DEFAULT_BUFFER_SIZE);
        } else {
          SharedMemoryProtocol.validate(this.sab);
        }
        this.requestProducer = new SharedMemoryProducer(this.sab);
        this.responseConsumer = new SharedMemoryConsumer(this.sab);
        this.setTransportMode('shared-memory');
        return;
      } catch (err) {
        console.warn('[NarrativeBridge] SharedArrayBuffer initialization failed, falling back:', err);
      }
    }

    // Attempt Web Worker transport
    const hasWorkerCapability =
      this.activeWorker !== undefined ||
      this.workerFactory !== undefined ||
      typeof Worker !== 'undefined';

    if (hasWorkerCapability && (preferred === 'worker-postmessage' || !preferred)) {
      try {
        if (!this.activeWorker && this.workerFactory) {
          this.activeWorker = this.workerFactory();
        }
        if (this.activeWorker) {
          this.setupWorkerListeners(this.activeWorker);
          this.setTransportMode('worker-postmessage');
          return;
        }
      } catch (err) {
        console.warn('[NarrativeBridge] Web Worker initialization failed, falling back:', err);
      }
    }

    // Default heuristic fallback
    this.setTransportMode('mock-fallback');
  }

  private setTransportMode(mode: TransportMode): void {
    this.transportMode = mode;
    this.stats.currentTransportMode = mode;
    if (mode === 'mock-fallback') {
      this.stats.fallbacksCount++;
    }
  }

  private setupWorkerListeners(worker: Worker): void {
    worker.onmessage = (event: MessageEvent) => {
      const response = event.data as NarrativeRpcResponse;
      if (response && response.id) {
        this.resolvePending(response.id, response);
      }
    };

    worker.onerror = (error) => {
      console.error('[NarrativeBridge] Worker error detected:', error);
      this.handleWorkerFailure('Worker script error');
    };
  }

  /**
   * Invokes a strongly-typed RPC method on narrative-nano with automatic timeout monitoring.
   */
  async call<M extends NarrativeMethod>(
    method: M,
    params: NarrativeMethodMap[M]['request'],
    timeoutMs: number = this.requestTimeoutMs
  ): Promise<NarrativeRpcResponse<M>> {
    this.stats.requestsTotal++;
    const requestId = `req_${++this.requestCounter}_${Date.now()}`;
    const request: NarrativeRpcRequest<M> = {
      id: requestId,
      method,
      params,
      timestamp: Date.now(),
    };

    if (this.transportMode === 'mock-fallback') {
      const response = this.mockEngine.execute(request);
      this.stats.requestsSuccessful++;
      return response;
    }

    return new Promise<NarrativeRpcResponse<M>>((resolve, reject) => {
      // Set 50ms (or custom) timeout watcher
      const timer = setTimeout(() => {
        this.handleTimeout(requestId, method, timeoutMs);
      }, timeoutMs);

      this.pendingRequests.set(requestId, { resolve, reject, timer, method });

      try {
        if (this.transportMode === 'shared-memory' && this.requestProducer) {
          const payload = serializeRpcRequest(request);
          const pushed = this.requestProducer.tryPush(payload, 0);

          if (!pushed) {
            // Ring buffer full or unreachable, trigger immediate fallback
            this.cancelPending(requestId);
            const fallbackRes = this.mockEngine.execute(request);
            this.stats.requestsSuccessful++;
            resolve(fallbackRes);
            return;
          }

          // If consumer response available synchronously / poll-based in test or SAB worker
          if (this.responseConsumer && !this.responseConsumer.isEmpty()) {
            const pkt = this.responseConsumer.tryPop();
            if (pkt) {
              const res = deserializeRpcResponse<M>(pkt.payload);
              this.resolvePending(requestId, res);
            }
          }
        } else if (this.transportMode === 'worker-postmessage' && this.activeWorker) {
          this.activeWorker.postMessage(request);
        } else {
          // Fallback if transport state lost
          this.cancelPending(requestId);
          const fallbackRes = this.mockEngine.execute(request);
          this.stats.requestsSuccessful++;
          resolve(fallbackRes);
        }
      } catch (err) {
        this.cancelPending(requestId);
        console.warn(`[NarrativeBridge] Dispatch failed for ${method}, using mock fallback:`, err);
        const fallbackRes = this.mockEngine.execute(request);
        this.stats.requestsSuccessful++;
        resolve(fallbackRes);
      }
    });
  }

  /**
   * Called when a response is received from worker / SAB.
   */
  resolvePending(id: string, response: NarrativeRpcResponse): void {
    const pending = this.pendingRequests.get(id);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingRequests.delete(id);
      this.stats.requestsSuccessful++;
      this.restartAttempts = 0; // Reset consecutive restart counter on successful response
      pending.resolve(response);
    }
  }

  private cancelPending(id: string): void {
    const pending = this.pendingRequests.get(id);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingRequests.delete(id);
    }
  }

  /**
   * Handles timeout monitoring (50ms).
   */
  private handleTimeout(id: string, method: NarrativeMethod, timeoutMs: number): void {
    const pending = this.pendingRequests.get(id);
    if (!pending) return;

    this.stats.timeoutsCount++;
    this.pendingRequests.delete(id);

    // Reject current request with RpcTimeoutError
    pending.reject(new RpcTimeoutError(method, timeoutMs));

    // Trigger self-healing and auto-restart sequence
    this.handleWorkerFailure(`Request '${method}' timed out after ${timeoutMs}ms`);
  }

  /**
   * Self-healing and worker auto-restart mechanism.
   */
  private handleWorkerFailure(reason: string): void {
    console.warn(`[NarrativeBridge] Worker failure detected: ${reason}. Initiating self-healing...`);
    this.restartAttempts++;
    this.stats.restartsCount++;

    // Terminate current worker
    if (this.activeWorker) {
      try {
        this.activeWorker.terminate();
      } catch {}
      this.activeWorker = undefined;
    }

    if (this.restartAttempts >= this.maxRestartAttempts) {
      console.error(
        `[NarrativeBridge] Exceeded max restart attempts (${this.maxRestartAttempts}). Downgrading to mock-fallback.`
      );
      this.setTransportMode('mock-fallback');
      return;
    }

    // Attempt restart
    try {
      if (this.workerFactory) {
        this.activeWorker = this.workerFactory();
        this.setupWorkerListeners(this.activeWorker);
        console.log(`[NarrativeBridge] Worker successfully restarted (attempt ${this.restartAttempts})`);
      } else {
        this.setTransportMode('mock-fallback');
      }
    } catch (err) {
      console.error('[NarrativeBridge] Auto-restart failed:', err);
      this.setTransportMode('mock-fallback');
    }
  }

  getTransportMode(): TransportMode {
    return this.transportMode;
  }

  getStats(): BridgeStats {
    return { ...this.stats };
  }

  isFallbackActive(): boolean {
    return this.transportMode === 'mock-fallback';
  }

  /**
   * Process message manually in SAB or simulated response contexts (for testing).
   */
  receiveResponseDirect<M extends NarrativeMethod>(res: NarrativeRpcResponse<M>): void {
    this.resolvePending(res.id, res);
  }
}
