/**
 * DagVirtualViewportEngine.ts - High-performance Viewport Culling & Virtual Scrolling for Causal DAGs
 *
 * Efficiently computes layout coordinates for 100k+ word manuscripts with hundreds of lore/causal nodes,
 * rendering only nodes and edges that intersect the active visible viewport (+ overscan margin).
 */

import { DagNode, DagEdge } from './CausalDagEngine.js';

export interface ViewportRect {
  scrollTop: number;
  scrollLeft: number;
  viewportWidth: number;
  viewportHeight: number;
  overscan?: number;
}

export interface NodeLayout {
  node: DagNode;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EdgeLayout {
  edge: DagEdge;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  midY: number;
  pathD: string;
}

export interface VirtualLayoutMetrics {
  totalWidth: number;
  totalHeight: number;
  totalNodeCount: number;
  totalEdgeCount: number;
  visibleNodes: NodeLayout[];
  visibleEdges: EdgeLayout[];
}

export class DagVirtualViewportEngine {
  private nodeMap: Map<string, DagNode> = new Map();
  private edges: DagEdge[] = [];

  // Cached layout coordinates
  private nodeLayouts: Map<string, NodeLayout> = new Map();
  private edgeLayouts: EdgeLayout[] = [];
  private cachedTotalWidth = 0;
  private cachedTotalHeight = 0;

  // Layout parameters
  private nodeW = 110;
  private nodeH = 48;
  private paddingX = 24;
  private paddingY = 28;
  private minLayerHeight = 75;

  public setGraph(nodes: DagNode[], edges: DagEdge[]): void {
    this.nodeMap.clear();
    for (const n of nodes) {
      this.nodeMap.set(n.id, n);
    }
    this.edges = [...edges];
    this.invalidateLayout();
  }

  public invalidateLayout(): void {
    this.nodeLayouts.clear();
    this.edgeLayouts = [];
    this.cachedTotalWidth = 0;
    this.cachedTotalHeight = 0;
  }

  /**
   * Computes Sugiyama-style topological layers and 2D bounding boxes for all nodes.
   */
  public computeFullLayout(canvasWidth: number = 400): { totalWidth: number; totalHeight: number } {
    const nodeList = Array.from(this.nodeMap.values());
    if (nodeList.length === 0) {
      this.cachedTotalWidth = canvasWidth;
      this.cachedTotalHeight = 300;
      return { totalWidth: this.cachedTotalWidth, totalHeight: this.cachedTotalHeight };
    }

    const inDegree: Map<string, number> = new Map();
    const adj: Map<string, string[]> = new Map();

    nodeList.forEach((n) => {
      inDegree.set(n.id, 0);
      adj.set(n.id, []);
    });

    this.edges.forEach((e) => {
      if (inDegree.has(e.toId)) {
        inDegree.set(e.toId, (inDegree.get(e.toId) || 0) + 1);
      }
      if (adj.has(e.fromId)) {
        adj.get(e.fromId)!.push(e.toId);
      }
    });

    const roots = nodeList.filter((n) => (inDegree.get(n.id) || 0) === 0);
    const layerMap: Map<string, number> = new Map();

    const assignLayer = (nodeId: string, currentLayer: number) => {
      const existing = layerMap.get(nodeId);
      if (existing === undefined || currentLayer > existing) {
        layerMap.set(nodeId, currentLayer);
        const children = adj.get(nodeId) || [];
        for (const childId of children) {
          assignLayer(childId, currentLayer + 1);
        }
      }
    };

    roots.forEach((r) => assignLayer(r.id, 0));
    nodeList.forEach((n, idx) => {
      if (!layerMap.has(n.id)) {
        layerMap.set(n.id, idx % 4);
      }
    });

    const maxLayer = Math.max(...Array.from(layerMap.values()), 0);
    const layers: DagNode[][] = Array.from({ length: maxLayer + 1 }, () => []);
    for (const n of nodeList) {
      const l = layerMap.get(n.id) || 0;
      layers[l].push(n);
    }

    // Determine max width needed for dense layers
    let maxNodesInLayer = 1;
    layers.forEach((l) => {
      if (l.length > maxNodesInLayer) maxNodesInLayer = l.length;
    });

    const calculatedWidth = Math.max(canvasWidth, maxNodesInLayer * (this.nodeW + 20) + this.paddingX * 2);
    const layerHeight = Math.max(this.minLayerHeight, 80);

    this.nodeLayouts.clear();

    layers.forEach((layerNodes, lIdx) => {
      const y = this.paddingY + lIdx * layerHeight;
      const count = layerNodes.length;
      const stepX = (calculatedWidth - this.paddingX * 2) / (count + 1);

      layerNodes.forEach((node, nIdx) => {
        const x = this.paddingX + stepX * (nIdx + 1) - this.nodeW / 2;
        this.nodeLayouts.set(node.id, {
          node,
          x,
          y,
          w: this.nodeW,
          h: this.nodeH,
        });
      });
    });

    // Compute edge trajectories
    this.edgeLayouts = [];
    for (const edge of this.edges) {
      const src = this.nodeLayouts.get(edge.fromId);
      const dst = this.nodeLayouts.get(edge.toId);
      if (!src || !dst) continue;

      const x1 = src.x + src.w / 2;
      const y1 = src.y + src.h;
      const x2 = dst.x + dst.w / 2;
      const y2 = dst.y;
      const midY = (y1 + y2) / 2;
      const pathD = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

      this.edgeLayouts.push({
        edge,
        x1,
        y1,
        x2,
        y2,
        midY,
        pathD,
      });
    }

    this.cachedTotalWidth = calculatedWidth;
    this.cachedTotalHeight = Math.max(300, (maxLayer + 1) * layerHeight + this.paddingY * 2);

    return { totalWidth: this.cachedTotalWidth, totalHeight: this.cachedTotalHeight };
  }

  /**
   * Culls nodes and edges outside the visible viewport window with overscan boundary buffer.
   */
  public getVisibleMetrics(viewport: ViewportRect): VirtualLayoutMetrics {
    if (this.nodeLayouts.size === 0) {
      this.computeFullLayout(viewport.viewportWidth);
    }

    const overscan = viewport.overscan ?? 80;
    const minX = viewport.scrollLeft - overscan;
    const maxX = viewport.scrollLeft + viewport.viewportWidth + overscan;
    const minY = viewport.scrollTop - overscan;
    const maxY = viewport.scrollTop + viewport.viewportHeight + overscan;

    const visibleNodeSet = new Set<string>();
    const visibleNodes: NodeLayout[] = [];

    // Bounding-box intersection check
    for (const [id, nl] of this.nodeLayouts.entries()) {
      const nodeRight = nl.x + nl.w;
      const nodeBottom = nl.y + nl.h;

      if (nodeRight >= minX && nl.x <= maxX && nodeBottom >= minY && nl.y <= maxY) {
        visibleNodes.push(nl);
        visibleNodeSet.add(id);
      }
    }

    // Include edges where either source or target node is visible, or line segment crosses view
    const visibleEdges: EdgeLayout[] = [];
    for (const el of this.edgeLayouts) {
      if (visibleNodeSet.has(el.edge.fromId) || visibleNodeSet.has(el.edge.toId)) {
        visibleEdges.push(el);
      } else {
        // Check if edge spans across the vertical viewport window
        const edgeMinY = Math.min(el.y1, el.y2);
        const edgeMaxY = Math.max(el.y1, el.y2);
        const edgeMinX = Math.min(el.x1, el.x2);
        const edgeMaxX = Math.max(el.x1, el.x2);

        if (edgeMaxY >= minY && edgeMinY <= maxY && edgeMaxX >= minX && edgeMinX <= maxX) {
          visibleEdges.push(el);
        }
      }
    }

    return {
      totalWidth: this.cachedTotalWidth,
      totalHeight: this.cachedTotalHeight,
      totalNodeCount: this.nodeMap.size,
      totalEdgeCount: this.edges.length,
      visibleNodes,
      visibleEdges,
    };
  }

  /**
   * Generates lightweight virtualized SVG slice representing only visible items.
   */
  public renderVirtualizedSvg(viewport: ViewportRect): string {
    const metrics = this.getVisibleMetrics(viewport);

    const getColors = (cat: string) => {
      switch (cat) {
        case 'character':
          return { border: '#388bfd', bg: 'rgba(56, 139, 253, 0.15)', text: '#58a6ff' };
        case 'foreshadowing':
          return { border: '#a371f7', bg: 'rgba(163, 113, 247, 0.15)', text: '#bc8cff' };
        case 'term':
          return { border: '#cfa85c', bg: 'rgba(207, 168, 92, 0.15)', text: '#e3b341' };
        case 'location':
          return { border: '#3fb950', bg: 'rgba(63, 185, 80, 0.15)', text: '#56d364' };
        default:
          return { border: '#8b949e', bg: 'rgba(139, 148, 158, 0.15)', text: '#c9d1d9' };
      }
    };

    let edgesSvg = '';
    for (const el of metrics.visibleEdges) {
      edgesSvg += `
        <g class="dag-edge" data-from="${el.edge.fromId}" data-to="${el.edge.toId}">
          <path d="${el.pathD}" fill="none" stroke="rgba(207, 168, 92, 0.55)" stroke-width="1.8" marker-end="url(#arrowhead)" />
          ${el.edge.label ? `
            <rect x="${(el.x1 + el.x2) / 2 - 24}" y="${el.midY - 8}" width="48" height="14" rx="3" fill="#161b22" stroke="rgba(207,168,92,0.3)" />
            <text x="${(el.x1 + el.x2) / 2}" y="${el.midY + 3}" text-anchor="middle" font-size="9" fill="#cfa85c" font-family="sans-serif">${el.edge.label}</text>
          ` : ''}
        </g>
      `;
    }

    let nodesSvg = '';
    for (const nl of metrics.visibleNodes) {
      const col = getColors(nl.node.category);
      nodesSvg += `
        <g class="dag-node" data-node-id="${nl.node.id}" style="cursor: pointer;" transform="translate(${nl.x}, ${nl.y})">
          <rect width="${nl.w}" height="${nl.h}" rx="6" fill="${col.bg}" stroke="${col.border}" stroke-width="1.4" />
          <text x="8" y="16" font-size="10" font-weight="bold" fill="${col.text}" font-family="sans-serif">${nl.node.label.slice(0, 8)}</text>
          <text x="8" y="32" font-size="8.5" fill="#8b949e" font-family="sans-serif">${(nl.node.role || nl.node.category).slice(0, 10)}</text>
        </g>
      `;
    }

    return `
      <svg class="dag-svg-canvas virtualized" viewBox="0 0 ${metrics.totalWidth} ${metrics.totalHeight}" width="${metrics.totalWidth}px" height="${metrics.totalHeight}px" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <marker id="arrowhead" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <polygon points="0 0, 7 3.5, 0 7" fill="#cfa85c" />
          </marker>
        </defs>
        ${edgesSvg}
        ${nodesSvg}
      </svg>
    `;
  }
}
