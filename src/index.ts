import type { SubgraphSlice, NarrativeContext } from '@schema';
import { WorldOntologyEngine } from '@core';
import { NarrativeBridge } from './core/ipc/NarrativeBridge.js';
import type { NarrativeRpcResponse } from './core/ipc/NarrativeRpcProtocol.js';

export class PlotailorIDE {
  private engine = new WorldOntologyEngine();
  private narrativeBridge = new NarrativeBridge();

  async renderScene(slice: SubgraphSlice): Promise<void> {
    console.log(`Rendering scene for slice ${slice.id}`);
    await this.narrativeBridge.call('processSlice', { slice });
  }

  async evaluateNarrativeContext(context: NarrativeContext): Promise<NarrativeRpcResponse<'evaluateNarrative'>> {
    return this.narrativeBridge.call('evaluateNarrative', { context });
  }

  getEngine(): WorldOntologyEngine {
    return this.engine;
  }

  getNarrativeBridge(): NarrativeBridge {
    return this.narrativeBridge;
  }
}

export * from './core/ipc/SharedMemoryProtocol.js';
export * from './core/ipc/NarrativeRpcProtocol.js';
export * from './core/ipc/NarrativeEngine.js';
export * from './core/ipc/NarrativeBridge.js';
