import { describe, it, expect, beforeEach } from 'vitest';
import { CausalDagEngine, DagNode, DagEdge } from '../src/core/causality/CausalDagEngine.js';
import { DagVirtualViewportEngine } from '../src/core/causality/DagVirtualViewportEngine.js';

describe('DAG Virtual Scrolling & Viewport Culling Engine', () => {
  let engine: DagVirtualViewportEngine;
  let dag: CausalDagEngine;

  beforeEach(() => {
    engine = new DagVirtualViewportEngine();
    dag = new CausalDagEngine();
  });

  it('should compute full layout coordinates for graph nodes and edges', () => {
    const nodes: DagNode[] = [
      { id: 'n1', label: '勇者ヴァレリウス', category: 'character' },
      { id: 'n2', label: '古代聖剣', category: 'term' },
      { id: 'n3', label: '聖都陥落の予言', category: 'foreshadowing' },
    ];
    const edges: DagEdge[] = [
      { fromId: 'n1', toId: 'n2', label: '所持' },
      { fromId: 'n2', toId: 'n3', label: '成就' },
    ];

    engine.setGraph(nodes, edges);
    const layout = engine.computeFullLayout(400);

    expect(layout.totalWidth).toBeGreaterThanOrEqual(400);
    expect(layout.totalHeight).toBeGreaterThan(150);
  });

  it('should cull nodes completely outside the viewport window', () => {
    // Generate a multi-layer graph with 30 nodes
    const nodes: DagNode[] = [];
    const edges: DagEdge[] = [];
    for (let i = 0; i < 30; i++) {
      nodes.push({
        id: `node-${i}`,
        label: `設定項目${i}`,
        category: i % 2 === 0 ? 'character' : 'term',
      });
      if (i > 0) {
        edges.push({
          fromId: `node-${i - 1}`,
          toId: `node-${i}`,
          label: '因果',
        });
      }
    }

    engine.setGraph(nodes, edges);
    engine.computeFullLayout(400);

    // Viewport limited to the top 200px
    const metricsTop = engine.getVisibleMetrics({
      scrollTop: 0,
      scrollLeft: 0,
      viewportWidth: 400,
      viewportHeight: 200,
      overscan: 20,
    });

    // Viewport limited to the bottom
    const metricsBottom = engine.getVisibleMetrics({
      scrollTop: 2000,
      scrollLeft: 0,
      viewportWidth: 400,
      viewportHeight: 200,
      overscan: 20,
    });

    expect(metricsTop.visibleNodes.length).toBeLessThan(nodes.length);
    expect(metricsTop.visibleNodes.length).toBeGreaterThan(0);
    expect(metricsTop.totalNodeCount).toBe(30);

    // Visible nodes at top and bottom should be disjoint
    const topIds = new Set(metricsTop.visibleNodes.map((n) => n.node.id));
    const bottomIds = new Set(metricsBottom.visibleNodes.map((n) => n.node.id));
    for (const bId of bottomIds) {
      expect(topIds.has(bId)).toBe(false);
    }
  });

  it('should respect overscan margin to preload nearby nodes before scroll entry', () => {
    const nodes: DagNode[] = [
      { id: 'n1', label: 'ノード1', category: 'character' },
      { id: 'n2', label: 'ノード2', category: 'character' },
      { id: 'n3', label: 'ノード3', category: 'character' },
      { id: 'n4', label: 'ノード4', category: 'character' },
    ];
    engine.setGraph(nodes, []);
    engine.computeFullLayout(400);

    const withZeroOverscan = engine.getVisibleMetrics({
      scrollTop: 0,
      scrollLeft: 0,
      viewportWidth: 400,
      viewportHeight: 50,
      overscan: 0,
    });

    const withLargeOverscan = engine.getVisibleMetrics({
      scrollTop: 0,
      scrollLeft: 0,
      viewportWidth: 400,
      viewportHeight: 50,
      overscan: 300,
    });

    expect(withLargeOverscan.visibleNodes.length).toBeGreaterThanOrEqual(withZeroOverscan.visibleNodes.length);
  });

  it('should produce lightweight virtual SVG markup via CausalDagEngine integration', () => {
    for (let i = 0; i < 20; i++) {
      dag.addNode({ id: `item-${i}`, label: `キャラ${i}`, category: 'character' });
      if (i > 0) {
        dag.addEdge(`item-${i - 1}`, `item-${i}`, '関係');
      }
    }

    const svg = dag.renderVirtualizedSvgGraph({
      scrollTop: 0,
      scrollLeft: 0,
      viewportWidth: 340,
      viewportHeight: 280,
      overscan: 50,
    });

    expect(svg).toContain('<svg class="dag-svg-canvas virtualized"');
    expect(svg).toContain('data-node-id="item-0"');
    expect(svg).toContain('marker id="arrowhead"');
  });

  it('should handle large-scale graph (300 nodes) culling in under 15ms', () => {
    const nodes: DagNode[] = [];
    const edges: DagEdge[] = [];
    for (let i = 0; i < 300; i++) {
      nodes.push({ id: `n-${i}`, label: `ノード${i}`, category: 'term' });
      if (i > 0 && i % 3 === 0) {
        edges.push({ fromId: `n-${i - 3}`, toId: `n-${i}`, label: '因果' });
      }
    }

    engine.setGraph(nodes, edges);
    const start = performance.now();
    const metrics = engine.getVisibleMetrics({
      scrollTop: 500,
      scrollLeft: 0,
      viewportWidth: 400,
      viewportHeight: 300,
      overscan: 50,
    });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(15);
    expect(metrics.visibleNodes.length).toBeLessThan(nodes.length);
  });
});
