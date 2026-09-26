import { describe, it, expect, beforeEach } from 'vitest';
import { LoreEntityManager } from '../src/core/lore/LoreEntityManager.js';
import { CausalDagEngine } from '../src/core/causality/CausalDagEngine.js';
import { VirtualFileSystem } from '../src/core/fs/VirtualFileSystem.js';
import { InMemoryAdapter } from '../src/core/fs/adapters/InMemoryAdapter.js';

describe('LoreEntityManager & CausalDagEngine', () => {
  let vfs: VirtualFileSystem;
  let loreManager: LoreEntityManager;

  beforeEach(() => {
    vfs = new VirtualFileSystem(new InMemoryAdapter());
    loreManager = new LoreEntityManager(vfs);
  });

  describe('LoreEntityManager CRUD & VFS Persistence', () => {
    it('initializes with default seed entities', () => {
      const all = loreManager.getEntities();
      expect(all.length).toBeGreaterThanOrEqual(4);

      const characters = loreManager.getEntities('character');
      expect(characters.some((c) => c.name.includes('ヴァレリウス'))).toBe(true);
      expect(characters.some((c) => c.name.includes('セレネ'))).toBe(true);
    });

    it('creates a new lore entity and filters by category', () => {
      const newEntity = loreManager.createEntity({
        name: '星辰刀',
        category: 'item',
        role: '古代の聖遺物',
        status: 'active',
        description: '満月の夜にのみ青白く輝く神聖な刀。',
      });

      expect(newEntity.id).toBeDefined();
      expect(loreManager.getEntity(newEntity.id)).toEqual(newEntity);

      const items = loreManager.getEntities('item');
      expect(items.some((i) => i.name === '星辰刀')).toBe(true);
    });

    it('updates an existing lore entity', () => {
      const char = loreManager.getEntities('character')[0];
      const updated = loreManager.updateEntity(char.id, {
        role: '帝国最高司令官（昇進）',
        status: 'active',
      });

      expect(updated).not.toBeNull();
      expect(updated?.role).toBe('帝国最高司令官（昇進）');
      expect(loreManager.getEntity(char.id)?.role).toBe('帝国最高司令官（昇進）');
    });

    it('deletes an entity and cleans up references in other relations', () => {
      const char = loreManager.getEntities('character')[0];
      const deleted = loreManager.deleteEntity(char.id);
      expect(deleted).toBe(true);
      expect(loreManager.getEntity(char.id)).toBeUndefined();

      // Check other entities do not reference the deleted id
      for (const ent of loreManager.getEntities()) {
        if (ent.relations) {
          expect(ent.relations.some((r) => r.targetId === char.id)).toBe(false);
        }
      }
    });

    it('exports definitions to LoreInspectorDock format', () => {
      const defs = loreManager.toLoreTermDefinitions();
      expect(defs.length).toBe(loreManager.getEntities().length);
      expect(defs[0].canonicalName).toBeDefined();
      expect(defs[0].category).toBeDefined();
    });

    it('saves to and loads from VFS correctly', async () => {
      const projectId = 'proj_test_42';
      loreManager.createEntity({
        name: '黒き水晶',
        category: 'item',
        description: '禁忌の魔法石',
      });

      await loreManager.saveToVFS(projectId);

      // Verify file exists in VFS
      expect(await vfs.exists(`/projects/${projectId}/lore/entities.json`)).toBe(true);

      // Create new manager and load
      const freshManager = new LoreEntityManager(vfs, []);
      expect(freshManager.getEntities().length).toBe(0);

      await freshManager.loadFromVFS(projectId);
      expect(freshManager.getEntities().some((e) => e.name === '黒き水晶')).toBe(true);
    });
  });

  describe('CausalDagEngine & Graph Validation', () => {
    it('populates DAG nodes and edges from lore entities', () => {
      const dag = new CausalDagEngine();
      dag.populateFromLore(loreManager.getEntities());

      const nodes = dag.getNodes();
      const edges = dag.getEdges();

      expect(nodes.length).toBeGreaterThanOrEqual(4);
      expect(edges.length).toBeGreaterThan(0);
    });

    it('detects no cycles in a clean acyclic DAG', () => {
      const dag = new CausalDagEngine();
      dag.addNode({ id: 'a', label: '原因A', category: 'foreshadowing' });
      dag.addNode({ id: 'b', label: '出来事B', category: 'term' });
      dag.addNode({ id: 'c', label: '結果C', category: 'character' });

      dag.addEdge('a', 'b', '契機');
      dag.addEdge('b', 'c', '影響');

      const report = dag.detectCycles();
      expect(report.isAcyclic).toBe(true);
      expect(report.cycleCount).toBe(0);

      const topoOrder = dag.getTopologicalSort();
      expect(topoOrder).toEqual(['a', 'b', 'c']);
    });

    it('detects circular causality loops using Tarjan algorithm', () => {
      const dag = new CausalDagEngine();
      dag.addNode({ id: 'n1', label: 'ノード1', category: 'term' });
      dag.addNode({ id: 'n2', label: 'ノード2', category: 'term' });
      dag.addNode({ id: 'n3', label: 'ノード3', category: 'term' });

      dag.addEdge('n1', 'n2', '1to2');
      dag.addEdge('n2', 'n3', '2to3');
      dag.addEdge('n3', 'n1', '3to1循環'); // Cycle!

      const report = dag.detectCycles();
      expect(report.isAcyclic).toBe(false);
      expect(report.cycleCount).toBeGreaterThanOrEqual(1);

      const topoOrder = dag.getTopologicalSort();
      expect(topoOrder).toBeNull();
    });

    it('renders clean SVG DAG diagram string', () => {
      const dag = new CausalDagEngine();
      dag.populateFromLore(loreManager.getEntities());

      const svg = dag.renderSvgGraph(400, 300);
      expect(svg).toContain('<svg');
      expect(svg).toContain('class="dag-svg-canvas"');
      expect(svg).toContain('marker-end="url(#arrowhead)"');
      expect(svg).toContain('class="dag-node"');
      expect(svg).toContain('class="dag-edge"');
    });
  });
});
