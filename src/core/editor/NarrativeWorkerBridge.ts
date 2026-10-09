import {
  SPSCRingBuffer,
  type RingBufferStats,
  InferenceWorkerClient,
  type InferenceResult,
} from '@worldcraft/narrative-nano';
import {
  NarrativeLinterEngine,
  type NarrativeAnalysisResult,
  type ModelMultiTaskOutputs,
} from './NarrativeLinterEngine.js';

export interface WorkerBridgeOptions {
  debounceMs?: number;
  slidingWindowSize?: number;
  enableSimd?: boolean;
  ringBufferCapacity?: number;
  workerScriptUrl?: string;
  workerInstance?: Worker;
  workerFactory?: () => Worker;
}

export class NarrativeWorkerBridge {
  private engine: NarrativeLinterEngine;
  private workerClient: InferenceWorkerClient | null = null;
  private isModelLoaded = false;
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

    // Initialize InferenceWorkerClient if worker or script URL is provided
    let workerInst: Worker | undefined = options.workerInstance;
    if (!workerInst && options.workerFactory) {
      try {
        workerInst = options.workerFactory();
      } catch (err) {
        console.warn('[NarrativeWorkerBridge] workerFactory failed to create worker, fallback to local engine:', err);
      }
    }

    if (workerInst || options.workerScriptUrl) {
      try {
        this.workerClient = new InferenceWorkerClient({
          workerInstance: workerInst,
          workerScriptUrl: options.workerScriptUrl,
          ringBufferCapacity: capacity,
          enableSimd: options.enableSimd ?? true,
        });
      } catch (err) {
        console.warn('[NarrativeWorkerBridge] InferenceWorkerClient instantiation failed:', err);
      }
    }
  }

  /**
   * Loads quantized ONNX model from ArrayBuffer and initializes the inference worker.
   */
  public async loadModel(modelBuffer: ArrayBuffer): Promise<void> {
    if (!this.workerClient) {
      // If no worker instance was provided in constructor, create default one if in browser
      if (typeof Worker !== 'undefined') {
        try {
          const workerUrl = new URL('../../worker/inferenceWorkerBundle.js', import.meta.url).href;
          this.workerClient = new InferenceWorkerClient({ workerScriptUrl: workerUrl });
        } catch {
          // Fallback or test environment
        }
      }
    }

    if (this.workerClient) {
      try {
        await this.workerClient.initialize(modelBuffer);
        this.isModelLoaded = true;
      } catch (err) {
        console.warn('[NarrativeWorkerBridge] Failed to initialize model in worker:', err);
        this.isModelLoaded = false;
      }
    }
  }

  public isReady(): boolean {
    return this.isModelLoaded && (this.workerClient?.ready() ?? false);
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
      // 1. Execute rule-based analysis across document
      let result = await new Promise<NarrativeAnalysisResult>((r) => {
        // Yield to microtask queue to ensure UI paint is never held up
        queueMicrotask(() => {
          const res = this.engine.analyzeDocument(req.text);
          r(res);
        });
      });

      // 2. If ONNX model worker is ready, augment result with multi-task tensor inference
      if (this.workerClient && this.isModelLoaded) {
        try {
          const inferRes = await this.workerClient.analyzeText(req.text, 0, 256, 50);
          if (inferRes && inferRes.modelOutputs) {
            result = this.engine.integrateModelInference(result, inferRes.modelOutputs as ModelMultiTaskOutputs);
          }
        } catch (inferErr) {
          // Non-blocking fail-safe: keep rule-based results if inference times out (>50ms) or fails
          console.warn('[NarrativeWorkerBridge] Worker model inference failed or timed out, keeping baseline result:', inferErr);
        }
      }

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
