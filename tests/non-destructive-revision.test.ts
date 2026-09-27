import { describe, it, expect, beforeEach } from 'vitest';
import { NonDestructiveRevisionGraph } from '../src/core/storage/NonDestructiveRevisionGraph.js';

describe('NonDestructiveRevisionGraph (Undo Tree / Revision Graph Engine)', () => {
  let graph: NonDestructiveRevisionGraph<string>;

  beforeEach(() => {
    graph = new NonDestructiveRevisionGraph<string>('Root Content', 'Initial revision', 'initial');
  });

  describe('Node Creation and Properties', () => {
    it('should initialize root revision node with required properties', () => {
      const root = graph.getRootNode();
      expect(root).not.toBeNull();
      expect(root?.parentId).toBeNull();
      expect(root?.commitType).toBe('initial');
      expect(root?.diffSummary).toBe('Initial revision');
      expect(root?.content).toBe('Root Content');
      expect(typeof root?.id).toBe('string');
      expect(typeof root?.timestamp).toBe('number');
      expect(Array.isArray(root?.childrenIds)).toBe(true);
      expect(graph.getCurrentNode()?.id).toBe(root?.id);
      expect(graph.size).toBe(1);
    });

    it('should sequentially commit new revisions and link parentId and childrenIds', () => {
      const root = graph.getRootNode()!;
      const rev1 = graph.commit('Content V1', 'Add feature 1', 'edit');
      const rev2 = graph.commit('Content V2', 'Fix bug 1', 'edit');

      expect(graph.size).toBe(3);
      expect(rev1.parentId).toBe(root.id);
      expect(rev2.parentId).toBe(rev1.id);

      expect(root.childrenIds).toContain(rev1.id);
      expect(rev1.childrenIds).toContain(rev2.id);
      expect(graph.getCurrentNode()?.id).toBe(rev2.id);
    });
  });

  describe('Non-Destructive Rollback and Branching (DAG Structure)', () => {
    it('should preserve existing history when committing after a rollback to an earlier revision', () => {
      const root = graph.getRootNode()!;
      const rev1 = graph.commit('V1', 'Commit 1');
      const rev2 = graph.commit('V2', 'Commit 2');

      expect(graph.getCurrentNode()?.id).toBe(rev2.id);

      // Rollback to root revision
      const rolledBack = graph.rollbackTo(root.id);
      expect(rolledBack.id).toBe(root.id);
      expect(graph.getCurrentNode()?.id).toBe(root.id);

      // Commit new revision from root (forking new branch B)
      const rev1B = graph.commit('V1-BranchB', 'Commit 1 in Branch B', 'branch');

      // Total nodes should be 4 (root, rev1, rev2, rev1B) - no nodes discarded!
      expect(graph.size).toBe(4);

      // Root should now have two children: rev1 and rev1B
      const rootChildren = graph.getChildren(root.id);
      expect(rootChildren.length).toBe(2);
      expect(rootChildren.map((n) => n.id)).toEqual([rev1.id, rev1B.id]);

      // Original branch node V2 still exists in the graph
      expect(graph.getNode(rev2.id)?.content).toBe('V2');
    });

    it('should support switching / re-rolling back between multiple past branches', () => {
      const root = graph.getRootNode()!;

      // Branch A
      const revA1 = graph.commit('Branch A - V1', 'Feature A1');
      const revA2 = graph.commit('Branch A - V2', 'Feature A2');

      // Rollback to root and create Branch B
      graph.rollbackTo(root.id);
      const revB1 = graph.commit('Branch B - V1', 'Feature B1');

      // Rollback to revA1 and create Branch C
      graph.rollbackTo(revA1.id);
      const revC1 = graph.commit('Branch C - V1', 'Feature C1');

      // Verify node count is preserved (root + A1 + A2 + B1 + C1 = 5)
      expect(graph.size).toBe(5);

      // Switch back to Branch A head
      graph.rollbackTo(revA2.id);
      expect(graph.getCurrentNode()?.content).toBe('Branch A - V2');

      // Switch back to Branch B head
      graph.rollbackTo(revB1.id);
      expect(graph.getCurrentNode()?.content).toBe('Branch B - V1');

      // Switch back to Branch C head
      graph.rollbackTo(revC1.id);
      expect(graph.getCurrentNode()?.content).toBe('Branch C - V1');
    });
  });

  describe('Undo and Redo Actions', () => {
    it('should navigate backwards with undo and forwards with redo', () => {
      const root = graph.getRootNode()!;
      const rev1 = graph.commit('V1', 'Step 1');
      const rev2 = graph.commit('V2', 'Step 2');

      // Undo step 1 -> rev1
      const undo1 = graph.undo();
      expect(undo1?.id).toBe(rev1.id);
      expect(graph.getCurrentNode()?.id).toBe(rev1.id);

      // Undo step 2 -> root
      const undo2 = graph.undo();
      expect(undo2?.id).toBe(root.id);

      // Undo when at root returns null
      expect(graph.undo()).toBeNull();

      // Redo -> rev2 (or rev1 step by step)
      const redo1 = graph.redo();
      expect(redo1?.id).toBe(rev1.id);

      const redo2 = graph.redo();
      expect(redo2?.id).toBe(rev2.id);

      // Redo when at leaf returns null
      expect(graph.redo()).toBeNull();
    });

    it('should allow redo with explicit childId when multiple branches exist', () => {
      const root = graph.getRootNode()!;
      const revA = graph.commit('Child A', 'Branch A');
      graph.rollbackTo(root.id);
      const revB = graph.commit('Child B', 'Branch B');

      graph.rollbackTo(root.id);

      // Redo specifying revA specifically
      const redoNode = graph.redo(revA.id);
      expect(redoNode?.id).toBe(revA.id);
    });
  });

  describe('Tree Traversal and Ancestor Path', () => {
    it('should correctly traverse graph using BFS and DFS', () => {
      const root = graph.getRootNode()!;
      const revA = graph.commit('A', 'A');
      const revA1 = graph.commit('A1', 'A1');

      graph.rollbackTo(root.id);
      const revB = graph.commit('B', 'B');

      const bfsOrder: string[] = [];
      graph.traverseBFS((node) => bfsOrder.push(node.content));
      expect(bfsOrder).toEqual(['Root Content', 'A', 'B', 'A1']);

      const dfsOrder: string[] = [];
      graph.traverseDFS((node) => dfsOrder.push(node.content));
      expect(dfsOrder).toEqual(['Root Content', 'A', 'A1', 'B']);
    });

    it('should return ancestors path from root to current node', () => {
      const root = graph.getRootNode()!;
      const rev1 = graph.commit('V1', 'Step 1');
      const rev2 = graph.commit('V2', 'Step 2');

      const path = graph.getAncestors();
      expect(path.map((n) => n.id)).toEqual([root.id, rev1.id, rev2.id]);
    });
  });

  describe('Branch Detection and Latest Active Branch', () => {
    it('should identify leaf nodes, all branches, active branch, and latest active branch', async () => {
      const root = graph.getRootNode()!;

      // Branch 1
      const b1 = graph.commit('Branch 1', 'Commit B1');

      // Artificial delay to ensure timestamp difference
      await new Promise((r) => setTimeout(r, 15));

      // Branch 2
      graph.rollbackTo(root.id);
      const b2 = graph.commit('Branch 2', 'Commit B2');

      const leaves = graph.getLeafNodes();
      expect(leaves.length).toBe(2);
      expect(leaves.map((l) => l.id).sort()).toEqual([b1.id, b2.id].sort());

      const branches = graph.getBranches();
      expect(branches.length).toBe(2);

      const activeBranch = graph.getActiveBranch();
      expect(activeBranch.map((n) => n.id)).toEqual([root.id, b2.id]);

      const latestBranch = graph.getLatestActiveBranch();
      expect(latestBranch.map((n) => n.id)).toEqual([root.id, b2.id]);
    });
  });

  describe('JSON Serialization and Deserialization', () => {
    it('should accurately serialize and deserialize revision graph state', () => {
      const root = graph.getRootNode()!;
      const rev1 = graph.commit('V1', 'Step 1');
      graph.rollbackTo(root.id);
      const rev2 = graph.commit('V2-Branch', 'Step 2 Branch');

      const json = graph.toJSON();
      const restoredGraph = NonDestructiveRevisionGraph.fromJSON<string>(json);

      expect(restoredGraph.size).toBe(3);
      expect(restoredGraph.getCurrentNode()?.id).toBe(rev2.id);
      expect(restoredGraph.getRootNode()?.id).toBe(root.id);

      const restoredAncestors = restoredGraph.getAncestors();
      expect(restoredAncestors.map((n) => n.id)).toEqual([root.id, rev2.id]);
    });
  });
});
