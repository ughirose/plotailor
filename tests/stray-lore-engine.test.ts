import { describe, it, expect } from 'vitest';
import { StrayLoreEngine } from '../src/core/lore/StrayLoreEngine.js';
import type { LoreEntity } from '../src/core/lore/LoreEntityManager.js';

describe('Phase 3: StrayLoreEngine Automatic Evacuation & Lifecycle', () => {
  const dummyEntities: LoreEntity[] = [
    {
      id: 'lore-sword',
      name: '聖剣エクスカリバー',
      category: 'item',
      status: 'active',
      description: '伝説の聖剣。光り輝く刀身を持つ。',
      role: '主役級武器',
      aliases: ['カリバーン'],
      relations: [{ targetId: 'lore-hero', label: '所持' }],
    },
    {
      id: 'lore-token',
      name: '通行証',
      category: 'item',
      status: 'active',
      description: '', // manual effort is low (score < 4.0)
    },
  ];

  it('keeps entities active when their canonical names or aliases appear in text', () => {
    const engine = new StrayLoreEngine();
    const text = 'アーサーは聖剣エクスカリバーを握りしめた。通行証を見せて門を通過した。';

    const { reconciliation, strayLores } = engine.scanAndReconcile(text, dummyEntities);

    expect(reconciliation.updatedEntities.length).toBe(2);
    expect(strayLores.length).toBe(0);
    expect(engine.getStrayLores().length).toBe(0);
  });

  it('automatically detects orphaned entities and classifies high-score items to shelved upon commit', () => {
    const engine = new StrayLoreEngine();
    // Text where both entities are absent
    const text = '兵士たちは野営地で眠りについた。';

    // 1. Uncommitted state -> both tracked as shelved in strayStates
    const step1 = engine.scanAndReconcile(text, dummyEntities, { isCommitted: false });
    expect(step1.strayLores.length).toBe(2);
    expect(step1.strayLores.every(s => s.status === 'shelved')).toBe(true);

    // 2. Committed state -> high-effort (sword) remains shelved, low-effort (token) purged
    const step2 = engine.scanAndReconcile(text, step1.reconciliation.updatedEntities, { isCommitted: true });
    expect(step2.strayLores.length).toBe(1);
    expect(step2.strayLores[0].entityId).toBe('lore-sword');
    expect(step2.strayLores[0].status).toBe('shelved');
    expect(step2.strayLores[0].manualScore).toBeGreaterThanOrEqual(4.0);
    expect(step2.strayLores[0].canonicalName).toBe('聖剣エクスカリバー');
    expect(step2.reconciliation.purgedEntities.some(e => e.id === 'lore-token')).toBe(true);
  });

  it('supports restoring and purging stray lores cleanly', () => {
    const engine = new StrayLoreEngine();
    const text = '静寂の森。';
    const res = engine.scanAndReconcile(text, dummyEntities, { isCommitted: true });

    const swordStray = engine.getStrayLore('lore-sword');
    expect(swordStray).toBeDefined();

    // Mark restored
    const restored = engine.markRestored('lore-sword');
    expect(restored?.status).toBe('restored');
    expect(engine.getStrayLore('lore-sword')).toBeUndefined();

    // Re-evacuate and purge
    engine.scanAndReconcile(text, dummyEntities, { isCommitted: true });
    expect(engine.getStrayLore('lore-sword')).toBeDefined();
    const purged = engine.markPurged('lore-sword');
    expect(purged).toBe(true);
    expect(engine.getStrayLore('lore-sword')).toBeUndefined();
  });
});
