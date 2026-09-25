import type { StateDeltaEvent, SubgraphSlice } from '@schema';
import { WorldOntologyEngine } from '@core';
import { PoPAuditEngine } from './core/pop/PoPAuditEngine.js';
import { ThreePaneAuditView } from './core/pop/ThreePaneAuditView.js';
import type { EditEvent, EventType, ThreePaneView } from './core/pop/types.js';

export class PlotailorIDE {
  private engine = new WorldOntologyEngine();
  private popEngine = new PoPAuditEngine('author-ide');
  private threePaneAuditView = new ThreePaneAuditView(this.popEngine);

  renderScene(slice: SubgraphSlice): void {
    console.log(`Rendering scene for slice ${slice.id}`);
  }

  getEngine(): WorldOntologyEngine {
    return this.engine;
  }

  getPoPEngine(): PoPAuditEngine {
    return this.popEngine;
  }

  getThreePaneAuditView(): ThreePaneAuditView {
    return this.threePaneAuditView;
  }

  /**
   * Records an edit event into the creation process proof engine
   * and applies state delta if provided.
   */
  recordEditEvent<T = unknown>(input: {
    id?: string;
    eventType: EventType;
    payload: T;
    delta?: StateDeltaEvent;
    authorId?: string;
    metadata?: Record<string, unknown>;
  }): EditEvent<T> {
    const eventId = input.id ?? `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (input.delta) {
      this.engine.applyDelta(input.delta);
    }

    const recordedEvent = this.popEngine.recordEvent({
      id: eventId,
      eventType: input.eventType,
      payload: input.payload,
      delta: input.delta,
      authorId: input.authorId,
      metadata: input.metadata,
    });

    return recordedEvent;
  }

  /**
   * Renders and returns the 3-pane layout state.
   */
  renderThreePaneLayout(): ThreePaneView {
    return this.threePaneAuditView.render();
  }
}

export * from './core/ipc/SharedMemoryProtocol.js';
export * from './core/pop/types.js';
export * from './core/pop/CBOR.js';
export * from './core/pop/MerkleHashChain.js';
export * from './core/pop/PoPAuditEngine.js';
export * from './core/pop/ThreePaneAuditView.js';
