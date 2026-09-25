import type { SubgraphSlice } from '@schema';
import { WorldOntologyEngine } from '@core';

export class PlotailorIDE {
  private engine = new WorldOntologyEngine();

  renderScene(slice: SubgraphSlice): void {
    console.log(`Rendering scene for slice ${slice.id}`);
  }

  getEngine(): WorldOntologyEngine {
    return this.engine;
  }
}

export * from './core/ipc/SharedMemoryProtocol.js';
export * from './core/editor/RubyDecorationExtension.js';
