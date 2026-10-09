import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NarrativeWorkerBridge } from '../src/core/editor/NarrativeWorkerBridge.js';
import type { NarrativeAnalysisResult } from '../src/core/editor/NarrativeLinterEngine.js';

describe('NarrativeWorkerBridge & ONNX WebWorker Pipeline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes with default options and runs rule-based analysis when no worker is provided', async () => {
    const bridge = new NarrativeWorkerBridge({ debounceMs: 50 });
    expect(bridge.isReady()).toBe(false);

    const promise = bridge.analyzeDebounced('若き魔術師は旅立った。');
    vi.runAllTimers();
    const result = await promise;

    expect(result).toBeDefined();
    expect(result.syntacticScore).toBeGreaterThanOrEqual(0);
    expect(result.syntacticItems).toBeInstanceOf(Array);
  });

  it('loads ArrayBuffer into worker and completes model-assisted analysis', async () => {
    let workerPostedMessage: any = null;
    const listeners = new Map<string, Set<(e: any) => void>>();
    const mockWorker = {
      addEventListener: vi.fn((event: string, handler: (e: any) => void) => {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)!.add(handler);
      }),
      removeEventListener: vi.fn((event: string, handler: (e: any) => void) => {
        listeners.get(event)?.delete(handler);
      }),
      postMessage: vi.fn((msg) => {
        workerPostedMessage = msg;
        if (msg.type === 'INIT') {
          setTimeout(() => {
            const ev = { data: { type: 'INIT_COMPLETE', success: true } };
            listeners.get('message')?.forEach((h) => h(ev));
            if (mockWorker.onmessage) (mockWorker as any).onmessage(ev);
          }, 0);
        } else if (msg.type === 'ANALYZE_TEXT') {
          setTimeout(() => {
            const ev = {
              data: {
                type: 'RESULT',
                result: {
                  id: msg.taskId,
                  accepted: true,
                  executionTimeMs: 12.5,
                  processedTokens: 15,
                  modelOutputs: {
                    seqLen: 15,
                    text: msg.text,
                    offsetStart: 0,
                    epistemic: new Float32Array([0.1, 0.2, 0.95, 0.1]), // Trigger POV at index 2
                  },
                },
              },
            };
            listeners.get('message')?.forEach((h) => h(ev));
            if (mockWorker.onmessage) (mockWorker as any).onmessage(ev);
          }, 0);
        }
      }),
      onmessage: null,
      onerror: null,
      terminate: vi.fn(),
    } as unknown as Worker;

    const bridge = new NarrativeWorkerBridge({
      debounceMs: 50,
      workerInstance: mockWorker,
    });

    const fakeBuffer = new ArrayBuffer(1024);
    const loadPromise = bridge.loadModel(fakeBuffer);
    await vi.runAllTimersAsync();
    await loadPromise;

    expect(bridge.isReady()).toBe(true);
    expect(mockWorker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'INIT' })
    );

    // Trigger debounced analysis
    const analysisPromise = bridge.analyzeDebounced('彼の胸は激しく高鳴り、恐怖で凍りついた。');
    await vi.runAllTimersAsync();
    const result = await analysisPromise;

    expect(result).toBeDefined();
    // Verify model inference outputs integrated into result (e.g. POV item created)
    expect(result.povItems).toBeDefined();
    expect(result.povItems!.length).toBeGreaterThanOrEqual(1);
    expect(result.povItems![0].epistemicScore).toBeGreaterThanOrEqual(0.6);
  });

  it('gracefully falls back to rule-based engine if worker analysis times out', async () => {
    const listeners = new Map<string, Set<(e: any) => void>>();
    const mockWorker = {
      addEventListener: vi.fn((event: string, handler: (e: any) => void) => {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)!.add(handler);
      }),
      removeEventListener: vi.fn((event: string, handler: (e: any) => void) => {
        listeners.get(event)?.delete(handler);
      }),
      postMessage: vi.fn((msg) => {
        if (msg.type === 'INIT') {
          setTimeout(() => {
            const ev = { data: { type: 'INIT_COMPLETE', success: true } };
            listeners.get('message')?.forEach((h) => h(ev));
            if (mockWorker.onmessage) (mockWorker as any).onmessage(ev);
          }, 0);
        }
        // Deliberately do NOT respond to ANALYZE_TEXT to trigger timeout
      }),
      onmessage: null,
      onerror: null,
      terminate: vi.fn(),
    } as unknown as Worker;

    const bridge = new NarrativeWorkerBridge({
      debounceMs: 50,
      workerInstance: mockWorker,
    });

    const fakeBuffer = new ArrayBuffer(1024);
    const loadPromise = bridge.loadModel(fakeBuffer);
    await vi.runAllTimersAsync();
    await loadPromise;

    // Trigger analysis
    const analysisPromise = bridge.analyzeDebounced('テスト文章です。……');
    // Advance timers so both debounce (50ms) and analyzeText timeout (50ms) expire
    await vi.advanceTimersByTimeAsync(200);
    const result = await analysisPromise;

    // Must still return valid result from rule-based engine without crashing
    expect(result).toBeDefined();
    expect(result.syntacticScore).toBeGreaterThanOrEqual(0);
  });
});
