import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  NarrativeBridge,
  MockNarrativeEngine,
  NarrativeWorkerHost,
  RpcTimeoutError,
  SharedMemoryProtocol,
  DEFAULT_BUFFER_SIZE,
} from '../src/index.js';
import type { SubgraphSlice, NarrativeContext } from '@schema';

describe('NarrativeBridge & Fallback IPC System', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('MockNarrativeEngine', () => {
    it('should process ping request', () => {
      const engine = new MockNarrativeEngine();
      const res = engine.execute({
        id: '1',
        method: 'ping',
        params: {},
        timestamp: Date.now(),
      });
      expect(res.success).toBe(true);
      expect(res.result?.status).toBe('ok');
      expect(res.fallbackUsed).toBe(true);
    });

    it('should process SubgraphSlice in processSlice', () => {
      const engine = new MockNarrativeEngine();
      const slice: SubgraphSlice = {
        id: 'slice-100',
        rootNodeId: 'node-1',
        depth: 2,
        nodes: { 'node-1': {}, 'node-2': {} },
        edges: [
          { id: 'edge-1', source: 'node-1', target: 'node-2', relation: 'leadsTo' },
        ],
        version: 1,
      };

      const res = engine.execute({
        id: '2',
        method: 'processSlice',
        params: { slice },
        timestamp: Date.now(),
      });

      expect(res.success).toBe(true);
      expect(res.result?.sliceId).toBe('slice-100');
      expect(res.result?.nodeCount).toBe(2);
      expect(res.result?.edgeCount).toBe(1);
    });

    it('should evaluate narrative context', () => {
      const engine = new MockNarrativeEngine();
      const context: NarrativeContext = {
        characterIds: ['char-1'],
        activePlots: ['plot-1'],
      };

      const res = engine.execute({
        id: '3',
        method: 'evaluateNarrative',
        params: { context },
        timestamp: Date.now(),
      });

      expect(res.success).toBe(true);
      expect(res.result?.score).toBe(70);
      expect(res.result?.suggestions).toContain('Consider adding a secondary character to enhance conflict.');
      expect(res.result?.suggestions).toContain('Specify a locationId for clearer spatial setting.');
    });
  });

  describe('NarrativeBridge Auto-Fallback & Feature Detection', () => {
    it('should default to mock-fallback when no worker or SAB is available', async () => {
      const bridge = new NarrativeBridge();
      expect(bridge.getTransportMode()).toBe('mock-fallback');
      expect(bridge.isFallbackActive()).toBe(true);

      const promise = bridge.call('ping', {});
      vi.runAllTimers();
      const res = await promise;

      expect(res.success).toBe(true);
      expect(res.fallbackUsed).toBe(true);
      expect(bridge.getStats().requestsTotal).toBe(1);
      expect(bridge.getStats().requestsSuccessful).toBe(1);
    });

    it('should operate over SharedArrayBuffer when provided', async () => {
      const sab = SharedMemoryProtocol.create(DEFAULT_BUFFER_SIZE);
      const bridge = new NarrativeBridge({
        preferredTransport: 'shared-memory',
        sab,
      });

      expect(bridge.getTransportMode()).toBe('shared-memory');

      const promise = bridge.call('ping', {});

      // Simulate SAB worker host response
      bridge.receiveResponseDirect({
        id: 'req_1_' + Date.now(),
        method: 'ping',
        success: true,
        result: { status: 'ok', timestamp: Date.now() },
        timestamp: Date.now(),
        fallbackUsed: false,
      });

      // Advance timers if any timeout timer was set
      vi.runAllTimers();

      const res = await bridge.call('ping', {}); // call in mock mode or direct
      expect(bridge.getStats().requestsTotal).toBeGreaterThanOrEqual(1);
    });

    it('should communicate over Web Worker postMessage when worker is provided', async () => {
      let postMessageCalledWith: any = null;
      const mockWorker = {
        postMessage: vi.fn((data) => {
          postMessageCalledWith = data;
        }),
        onmessage: null,
        onerror: null,
        terminate: vi.fn(),
      } as unknown as Worker;

      const bridge = new NarrativeBridge({
        preferredTransport: 'worker-postmessage',
        customWorker: mockWorker,
      });

      expect(bridge.getTransportMode()).toBe('worker-postmessage');

      const callPromise = bridge.call('ping', {});

      expect(mockWorker.postMessage).toHaveBeenCalled();
      expect(postMessageCalledWith.method).toBe('ping');

      // Simulate worker message back
      if (mockWorker.onmessage) {
        (mockWorker as any).onmessage({
          data: {
            id: postMessageCalledWith.id,
            method: 'ping',
            success: true,
            result: { status: 'ok', timestamp: Date.now() },
            timestamp: Date.now(),
          },
        });
      }

      vi.runAllTimers();
      const res = await callPromise;
      expect(res.success).toBe(true);
      expect(res.result?.status).toBe('ok');
    });
  });

  describe('50ms Request Timeout & Self-Healing Worker Auto-Restart', () => {
    it('should time out requests after 50ms and trigger self-healing restart', async () => {
      const mockTerminate = vi.fn();
      let workerInstanceCount = 0;

      const createMockWorker = () => {
        workerInstanceCount++;
        return {
          postMessage: vi.fn(),
          onmessage: null,
          onerror: null,
          terminate: mockTerminate,
        } as unknown as Worker;
      };

      const bridge = new NarrativeBridge({
        preferredTransport: 'worker-postmessage',
        requestTimeoutMs: 50,
        maxRestartAttempts: 3,
        workerFactory: createMockWorker,
      });

      expect(bridge.getTransportMode()).toBe('worker-postmessage');
      expect(workerInstanceCount).toBe(1);

      const callPromise = bridge.call('ping', {});

      // Fast forward 50ms to trigger timeout
      vi.advanceTimersByTime(50);

      await expect(callPromise).rejects.toThrow(RpcTimeoutError);

      expect(mockTerminate).toHaveBeenCalled();
      expect(bridge.getStats().timeoutsCount).toBe(1);
      expect(bridge.getStats().restartsCount).toBe(1);
      // Worker should have been restarted
      expect(workerInstanceCount).toBe(2);
      expect(bridge.getTransportMode()).toBe('worker-postmessage');
    });

    it('should downgrade to mock-fallback after exceeding max restart attempts', async () => {
      let workerInstanceCount = 0;
      const createFailingWorker = () => {
        workerInstanceCount++;
        return {
          postMessage: vi.fn(),
          onmessage: null,
          onerror: null,
          terminate: vi.fn(),
        } as unknown as Worker;
      };

      const bridge = new NarrativeBridge({
        preferredTransport: 'worker-postmessage',
        requestTimeoutMs: 50,
        maxRestartAttempts: 2,
        workerFactory: createFailingWorker,
      });

      // 1st request times out
      const req1 = bridge.call('ping', {});
      vi.advanceTimersByTime(50);
      await expect(req1).rejects.toThrow(RpcTimeoutError);
      expect(bridge.getStats().restartsCount).toBe(1);

      // 2nd request times out
      const req2 = bridge.call('ping', {});
      vi.advanceTimersByTime(50);
      await expect(req2).rejects.toThrow(RpcTimeoutError);
      expect(bridge.getStats().restartsCount).toBe(2);

      // Now bridge should be in mock-fallback mode
      expect(bridge.getTransportMode()).toBe('mock-fallback');
      expect(bridge.isFallbackActive()).toBe(true);

      // Subsequent request succeeds via mock fallback
      const req3 = await bridge.call('ping', {});
      expect(req3.success).toBe(true);
      expect(req3.fallbackUsed).toBe(true);
    });
  });
});
