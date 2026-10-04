import { SPSCRingBuffer, type RingBufferStats } from '@worldcraft/narrative-nano';
import {
  NarrativeLinterEngine,
  type NarrativeAnalysisResult,
} from './NarrativeLinterEngine.js';

export interface WorkerBridgeOptions {
  debounceMs?: number;
  slidingWindowSize?: number;
  enableSimd?: boolean;
  ringBufferCapacity?: number;
}

export class NarrativeWorkerBridge {
  private engine: NarrativeLinterEngine;
  private debounceMs: number;
  private slidingWindowSize: number;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private isProcessing = false;
  private pendingRequest: { text: string; cursorPos?: number; resolve: (res: NarrativeAnalysisResult) => void } | null = null;

  private inputRingBuffer: SPSCRingBuffer;
  private outputRingBuffer: SPSCRingBuffer;
  private throughputOps = 0;
  private lastThroughputCheck = Date.now();

  constructor(options: WorkerBridgeOptions = {}) {
    this.engine = new NarrativeLinterEngine();
    this.debounceMs = options.debounceMs ?? 80; // 80ms debounce satisfies 50-200ms IKI
    this.slidingWindowSize = options.slidingWindowSize ?? 128; // 128 chars sliding window

    const capacity = options.ringBufferCapacity ?? 64;
    this.inputRingBuffer = new SPSCRingBuffer({ capacity, elementSizeBytes: 2048 });
    this.outputRingBuffer = new SPSCRingBuffer({ capacity, elementSizeBytes: 2048 });
  }

  public getRingBufferStats(): RingBufferStats {
    return this.inputRingBuffer.getStats();
  }

  /**
   * Schedules a debounced sliding-window analysis without blocking the main typing loop.
   */
  public analyzeDebounced(
    text: string,
    cursorPos?: number,
    isComposing: boolean = false
  ): Promise<NarrativeAnalysisResult> {
    // If Japanese IME composition is active, immediately resolve with empty/skipped result
    // to prevent any UI stutter or cursor jumping during composition
    if (isComposing) {
      return Promise.resolve({
        syntacticItems: [],
        zeroPronounItems: [],
        syntacticScore: 100,
        totalWarnings: 0,
      });
    }

    return new Promise<NarrativeAnalysisResult>((resolve) => {
      this.pendingRequest = { text, cursorPos, resolve };

      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }

      this.debounceTimer = setTimeout(() => {
        this.processPending();
      }, this.debounceMs);
    });
  }

  private async processPending(): Promise<void> {
    if (!this.pendingRequest) return;
    const req = this.pendingRequest;
    this.pendingRequest = null;

    this.isProcessing = true;
    const startTime = performance.now();

    try {
      // Execute non-blocking analysis across the full document so all warnings are preserved
      const result = await new Promise<NarrativeAnalysisResult>((r) => {
        // Yield to microtask queue to ensure UI paint is never held up
        queueMicrotask(() => {
          const res = this.engine.analyzeDocument(req.text);
          r(res);
        });
      });

      this.throughputOps++;
      req.resolve(result);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Immediate synchronous analysis (for initial load or explicit inspection trigger).
   */
  public analyzeImmediate(text: string): NarrativeAnalysisResult {
    return this.engine.analyzeDocument(text);
  }

  public getEngine(): NarrativeLinterEngine {
    return this.engine;
  }

  public setCadenceStatus(status?: import('./QwertyTypoDetector.js').CadenceStatusKind): void {
    this.engine.setCadenceStatus(status);
  }

  public getPrhEngine(): import('./PrhRuleEngine.js').PrhRuleEngine {
    return this.engine.getPrhEngine();
  }
}
