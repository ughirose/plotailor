import { StrayLoreStateSchema, type StrayLoreState } from '@worldcraft/schema';
import type { LoreEntity } from './LoreEntityManager.js';
import {
  calculateManualScore,
  reconcileEntityLifecycles,
  type LifecycleReconciliationResult,
} from './ShelvedLoreLifecycle.js';

export interface StrayLoreScanOptions {
  isCommitted?: boolean;
  provenanceBlockId?: string;
}

/**
 * Stray Lore (Shelved Lore) Lifecycle Management Engine.
 * Automatically evacuates orphaned entities whose manuscript anchors have vanished.
 */
export class StrayLoreEngine {
  private strayStates: Map<string, StrayLoreState> = new Map();

  /**
   * Reconciles manuscript entities and detects orphaned lore items.
   */
  public scanAndReconcile(
    manuscriptText: string,
    entities: LoreEntity[],
    options: StrayLoreScanOptions = {}
  ): {
    reconciliation: LifecycleReconciliationResult;
    strayLores: StrayLoreState[];
  } {
    const isCommitted = options.isCommitted ?? false;
    const reconciliation = reconcileEntityLifecycles(manuscriptText, entities, isCommitted);

    // Update internal stray states for shelved and dangling entities
    const currentStrays: StrayLoreState[] = [];

    // Shelved entities (high manual effort, preserved in shelf)
    for (const ent of reconciliation.shelvedEntities) {
      const score = calculateManualScore(ent);
      const existing = this.strayStates.get(ent.id);

      const state: StrayLoreState = {
        entityId: ent.id,
        canonicalName: ent.name,
        manualScore: score,
        status: 'shelved',
        evacuationTimestamp: existing?.evacuationTimestamp ?? Date.now(),
        evacuationContext: ent.description || '本文中からの参照消失により退避棚へ保管',
        provenanceBlockId: options.provenanceBlockId,
      };

      const validated = StrayLoreStateSchema.parse(state);
      this.strayStates.set(ent.id, validated);
      currentStrays.push(validated);
    }

    // Dangling entities (orphaned in current draft) - track as shelved candidate if score >= 4.0 or shelved status
    for (const ent of reconciliation.danglingEntities) {
      const score = calculateManualScore(ent);
      const existing = this.strayStates.get(ent.id);

      const state: StrayLoreState = {
        entityId: ent.id,
        canonicalName: ent.name,
        manualScore: score,
        status: 'shelved',
        evacuationTimestamp: existing?.evacuationTimestamp ?? Date.now(),
        evacuationContext: ent.description || '一時孤立のため退避棚へ保管',
        provenanceBlockId: options.provenanceBlockId,
      };

      const validated = StrayLoreStateSchema.parse(state);
      this.strayStates.set(ent.id, validated);
      currentStrays.push(validated);
    }

    // Remove entities that were restored to active
    for (const ent of reconciliation.updatedEntities) {
      if (ent.status === 'active' || ent.status === 'alive') {
        this.strayStates.delete(ent.id);
      }
    }

    // Remove purged entities
    for (const ent of reconciliation.purgedEntities) {
      this.strayStates.delete(ent.id);
    }

    return {
      reconciliation,
      strayLores: currentStrays,
    };
  }

  public getStrayLores(): StrayLoreState[] {
    return Array.from(this.strayStates.values());
  }

  public getStrayLore(entityId: string): StrayLoreState | undefined {
    return this.strayStates.get(entityId);
  }

  public markRestored(entityId: string): StrayLoreState | undefined {
    const state = this.strayStates.get(entityId);
    if (!state) return undefined;
    const restored: StrayLoreState = {
      ...state,
      status: 'restored',
    };
    const validated = StrayLoreStateSchema.parse(restored);
    this.strayStates.delete(entityId);
    return validated;
  }

  public markPurged(entityId: string): boolean {
    return this.strayStates.delete(entityId);
  }

  public clear(): void {
    this.strayStates.clear();
  }
}
