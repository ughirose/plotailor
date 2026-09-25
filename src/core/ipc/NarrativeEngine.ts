import type {
  NarrativeMethod,
  NarrativeRpcRequest,
  NarrativeRpcResponse,
  NarrativeMethodMap,
} from './NarrativeRpcProtocol.js';

export class MockNarrativeEngine {
  execute<M extends NarrativeMethod>(
    req: NarrativeRpcRequest<M>
  ): NarrativeRpcResponse<M> {
    const timestamp = Date.now();
    switch (req.method) {
      case 'ping': {
        const result: NarrativeMethodMap['ping']['response'] = {
          status: 'ok',
          timestamp,
        };
        return {
          id: req.id,
          method: req.method,
          success: true,
          result: result as NarrativeMethodMap[M]['response'],
          timestamp,
          fallbackUsed: true,
        };
      }
      case 'processSlice': {
        const { slice } = req.params as NarrativeMethodMap['processSlice']['request'];
        const nodeCount = slice?.nodes ? Object.keys(slice.nodes).length : 0;
        const edgeCount = slice?.edges ? slice.edges.length : 0;
        const result: NarrativeMethodMap['processSlice']['response'] = {
          sliceId: slice?.id ?? 'unknown-slice',
          nodeCount,
          edgeCount,
          processed: true,
        };
        return {
          id: req.id,
          method: req.method,
          success: true,
          result: result as NarrativeMethodMap[M]['response'],
          timestamp,
          fallbackUsed: true,
        };
      }
      case 'evaluateNarrative': {
        const { context } = req.params as NarrativeMethodMap['evaluateNarrative']['request'];
        const charCount = context?.characterIds?.length ?? 0;
        const suggestions: string[] = [];
        const warnings: string[] = [];

        if (charCount === 0) {
          warnings.push('No active characters in context.');
        } else if (charCount === 1) {
          suggestions.push('Consider adding a secondary character to enhance conflict.');
        }

        if (!context?.locationId) {
          suggestions.push('Specify a locationId for clearer spatial setting.');
        }

        const score = Math.min(100, Math.max(50, 60 + charCount * 10));

        const result: NarrativeMethodMap['evaluateNarrative']['response'] = {
          score,
          suggestions,
          warnings,
        };
        return {
          id: req.id,
          method: req.method,
          success: true,
          result: result as NarrativeMethodMap[M]['response'],
          timestamp,
          fallbackUsed: true,
        };
      }
      default: {
        return {
          id: req.id,
          method: req.method,
          success: false,
          error: `Unknown RPC method: ${String(req.method)}`,
          timestamp,
          fallbackUsed: true,
        };
      }
    }
  }
}

/**
 * Worker host dispatcher logic that can handle incoming request payloads from Workers or SAB ring buffers.
 */
export class NarrativeWorkerHost {
  private mockEngine = new MockNarrativeEngine();

  handleRequest<M extends NarrativeMethod>(req: NarrativeRpcRequest<M>): NarrativeRpcResponse<M> {
    const res = this.mockEngine.execute(req);
    // Overwrite fallbackUsed flag if executing in full engine mode
    res.fallbackUsed = false;
    return res;
  }
}
