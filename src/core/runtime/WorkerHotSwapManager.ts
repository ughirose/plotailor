/**
 * WorkerHotSwapManager - Zero-Disruption Dual-Buffer Background Worker Lifecycle Manager
 * 
 * Enables hot-swapping of Wasm inference workers and models in the background
 * without interrupting the author's typing flow, dropping keystrokes, or disturbing IME composition.
 */

export interface WorkerInstance {
  id: string;
  version: string;
  isReady: boolean;
  evaluate(input: unknown): Promise<unknown>;
  terminate(): void;
}

export type SwapState = 'IDLE' | 'PREPARING_STANDBY' | 'WARMING_UP' | 'DRAINING_ACTIVE' | 'SWAPPING';

export interface HotSwapOptions {
  idleThresholdMs?: number;
  drainTimeoutMs?: number;
}

export class WorkerHotSwapManager {
  private activeWorker: WorkerInstance | null = null;
  private standbyWorker: WorkerInstance | null = null;
  private state: SwapState = 'IDLE';
  private lastTypingTimestamp: number = Date.now();
  private isComposing: boolean = false;
  private inFlightRequests: number = 0;
  private idleThresholdMs: number;
  private drainTimeoutMs: number;

  constructor(initialWorker: WorkerInstance, options: HotSwapOptions = {}) {
    this.activeWorker = initialWorker;
    this.idleThresholdMs = options.idleThresholdMs ?? 500;
    this.drainTimeoutMs = options.drainTimeoutMs ?? 2000;
  }

  public getState(): SwapState {
    return this.state;
  }

  public getActiveWorker(): WorkerInstance | null {
    return this.activeWorker;
  }

  public getStandbyWorker(): WorkerInstance | null {
    return this.standbyWorker;
  }

  /**
   * Notifies manager of user keystroke to maintain typing activity window.
   */
  public reportKeystroke(isComposing: boolean = false): void {
    this.lastTypingTimestamp = Date.now();
    this.isComposing = isComposing;
  }

  /**
   * Evaluates input using active worker, tracking in-flight requests.
   */
  public async evaluate(input: unknown): Promise<unknown> {
    if (!this.activeWorker) {
      throw new Error('No active inference worker available.');
    }

    this.inFlightRequests++;
    try {
      return await this.activeWorker.evaluate(input);
    } finally {
      this.inFlightRequests = Math.max(0, this.inFlightRequests - 1);
    }
  }

  /**
   * Initiates zero-disruption background hot-swap to a new worker version.
   */
  public async prepareHotSwap(newWorker: WorkerInstance): Promise<boolean> {
    if (this.state !== 'IDLE') {
      return false; // Swap already in progress
    }

    this.state = 'PREPARING_STANDBY';
    this.standbyWorker = newWorker;

    // Warm up the new standby worker in background
    this.state = 'WARMING_UP';
    try {
      await this.standbyWorker.evaluate({ warmup: true });
    } catch {
      // Warmup fallback if input structure differs
    }

    // Wait for author idle window (typing paused & not in IME composition)
    this.state = 'SWAPPING';
    await this.waitForAuthorIdle();

    // Perform atomic pointer swap
    const oldWorker = this.activeWorker;
    this.activeWorker = this.standbyWorker;
    this.standbyWorker = null;
    this.state = 'IDLE';

    // Gracefully terminate old worker after safety drain
    if (oldWorker) {
      setTimeout(() => {
        try {
          oldWorker.terminate();
        } catch {
          // ignore
        }
      }, 100);
    }

    return true;
  }

  /**
   * Waits until author is in idle state and no IME composition is ongoing.
   */
  private async waitForAuthorIdle(): Promise<void> {
    const startTime = Date.now();

    while (true) {
      const now = Date.now();
      const elapsedSinceTyping = now - this.lastTypingTimestamp;

      // Safe swap conditions: author idle for threshold AND not composing AND in-flight requests <= 0
      if (elapsedSinceTyping >= this.idleThresholdMs && !this.isComposing && this.inFlightRequests === 0) {
        return;
      }

      // If author continues typing heavily beyond drain timeout, swap immediately between keystrokes
      if (now - startTime > this.drainTimeoutMs && !this.isComposing) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}
