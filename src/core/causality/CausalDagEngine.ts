import type { LoreEntity } from '../lore/LoreEntityManager.js';
import { DagVirtualViewportEngine, ViewportRect, VirtualLayoutMetrics } from './DagVirtualViewportEngine.js';

export interface DagNode {
  id: string;
  label: string;
  category: string;
  role?: string;
  description?: string;
}

export interface DagEdge {
  fromId: string;
  toId: string;
  label: string;
}

export interface DagCycleReport {
  isAcyclic: boolean;
  cycles: string[][];
  cycleCount: number;
}

export class CausalDagEngine {
  private nodes: Map<string, DagNode> = new Map();
  private edges: DagEdge[] = [];

  public addNode(node: DagNode): void {
    this.nodes.set(node.id, { ...node });
  }

  public addEdge(fromId: string, toId: string, label = ''): void {
    if (!this.nodes.has(fromId) || !this.nodes.has(toId)) {
      return;
    }
    // Avoid exact duplicate edges
    if (!this.edges.some((e) => e.fromId === fromId && e.toId === toId && e.label === label)) {
      this.edges.push({ fromId, toId, label });
    }
  }

  public getNodes(): DagNode[] {
    return Array.from(this.nodes.values());
  }

  public getEdges(): DagEdge[] {
    return [...this.edges];
  }

  public clear(): void {
    this.nodes.clear();
    this.edges = [];
  }

  public populateFromLore(entities: LoreEntity[]): void {
    this.clear();
    for (const ent of entities) {
      this.addNode({
        id: ent.id,
        label: ent.name,
        category: ent.category,
        role: ent.role,
        description: ent.description,
      });
    }

    for (const ent of entities) {
      if (ent.relations) {
        for (const rel of ent.relations) {
          if (this.nodes.has(rel.targetId)) {
            this.addEdge(ent.id, rel.targetId, rel.label);
          }
        }
      }
    }
  }

  /**
   * Tarjan's Strongly Connected Components algorithm for loop/cycle detection.
   */
  public detectCycles(): DagCycleReport {
    let index = 0;
    const indices: Map<string, number> = new Map();
    const lowlink: Map<string, number> = new Map();
    const onStack: Map<string, boolean> = new Map();
    const stack: string[] = [];
    const sccs: string[][] = [];

    const strongConnect = (v: string) => {
      indices.set(v, index);
      lowlink.set(v, index);
      index++;
      stack.push(v);
      onStack.set(v, true);

      const neighbors = this.edges.filter((e) => e.fromId === v).map((e) => e.toId);
      for (const w of neighbors) {
        if (!indices.has(w)) {
          strongConnect(w);
          lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
        } else if (onStack.get(w)) {
          lowlink.set(v, Math.min(lowlink.get(v)!, indices.get(w)!));
        }
      }

      if (lowlink.get(v) === indices.get(v)) {
        const scc: string[] = [];
        let w = '';
        do {
          w = stack.pop()!;
          onStack.set(w, false);
          scc.push(w);
        } while (w !== v);

        // A cycle is an SCC with more than 1 node, or a self-loop
        if (scc.length > 1 || this.edges.some((e) => e.fromId === v && e.toId === v)) {
          sccs.push(scc);
        }
      }
    };

    for (const nodeId of this.nodes.keys()) {
      if (!indices.has(nodeId)) {
        strongConnect(nodeId);
      }
    }

    return {
      isAcyclic: sccs.length === 0,
      cycles: sccs,
      cycleCount: sccs.length,
    };
  }

  /**
   * Topological sorting using Kahn's algorithm. Returns null if graph has cycles.
   */
  public getTopologicalSort(): string[] | null {
    const inDegree: Map<string, number> = new Map();
    for (const nodeId of this.nodes.keys()) {
      inDegree.set(nodeId, 0);
    }
    for (const edge of this.edges) {
      inDegree.set(edge.toId, (inDegree.get(edge.toId) || 0) + 1);
    }

    const queue: string[] = [];
    for (const [nodeId, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(nodeId);
    }

    const order: string[] = [];
    while (queue.length > 0) {
      const u = queue.shift()!;
      order.push(u);

      for (const edge of this.edges.filter((e) => e.fromId === u)) {
        const nextDeg = (inDegree.get(edge.toId) || 0) - 1;
        inDegree.set(edge.toId, nextDeg);
        if (nextDeg === 0) {
          queue.push(edge.toId);
        }
      }
    }

    if (order.length !== this.nodes.size) {
      return null; // Cycle detected
    }
    return order;
  }

  /**
   * Render an interactive, self-contained SVG DAG diagram
   */
  public renderSvgGraph(width = 360, height = 340): string {
    const nodeList = this.getNodes();
    if (nodeList.length === 0) {
      return `<div style="text-align: center; color: var(--color-text-dim); padding: 24px; font-size: 12px;">設定ノードが登録されていません</div>`;
    }

    // Assign layers for stratified layout
    const inDegree: Map<string, number> = new Map();
    for (const n of nodeList) inDegree.set(n.id, 0);
    for (const e of this.edges) inDegree.set(e.toId, (inDegree.get(e.toId) || 0) + 1);

    const layerMap: Map<string, number> = new Map();
    const visited: Set<string> = new Set();

    // Roots
    const roots = nodeList.filter((n) => (inDegree.get(n.id) || 0) === 0);
    if (roots.length === 0 && nodeList.length > 0) {
      roots.push(nodeList[0]);
    }

    const assignLayer = (nodeId: string, currentLayer: number) => {
      const current = layerMap.get(nodeId) || 0;
      layerMap.set(nodeId, Math.max(current, currentLayer));
      for (const edge of this.edges.filter((e) => e.fromId === nodeId)) {
        if (!visited.has(edge.toId + ':' + currentLayer)) {
          visited.add(edge.toId + ':' + currentLayer);
          assignLayer(edge.toId, currentLayer + 1);
        }
      }
    };

    roots.forEach((r) => assignLayer(r.id, 0));
    // Assign any unvisited nodes
    nodeList.forEach((n, idx) => {
      if (!layerMap.has(n.id)) layerMap.set(n.id, idx % 3);
    });

    const maxLayer = Math.max(...Array.from(layerMap.values()), 0);
    const layers: DagNode[][] = Array.from({ length: maxLayer + 1 }, () => []);
    for (const n of nodeList) {
      const l = layerMap.get(n.id) || 0;
      layers[l].push(n);
    }

    // Calculate node coordinates (X, Y)
    const nodeCoords: Map<string, { x: number; y: number; w: number; h: number }> = new Map();
    const nodeW = 100;
    const nodeH = 46;
    const paddingX = 20;
    const paddingY = 24;
    const usableW = Math.max(width - paddingX * 2, 280);
    const layerHeight = Math.max((height - paddingY * 2 - nodeH) / Math.max(maxLayer, 1), 70);

    layers.forEach((layerNodes, lIdx) => {
      const y = paddingY + lIdx * layerHeight;
      const count = layerNodes.length;
      const stepX = usableW / (count + 1);
      layerNodes.forEach((node, nIdx) => {
        const x = paddingX + stepX * (nIdx + 1) - nodeW / 2;
        nodeCoords.set(node.id, { x, y, w: nodeW, h: nodeH });
      });
    });

    // Theme colors per category
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

    // Render edges
    let edgesSvg = '';
    for (const edge of this.edges) {
      const src = nodeCoords.get(edge.fromId);
      const dst = nodeCoords.get(edge.toId);
      if (!src || !dst) continue;

      const x1 = src.x + src.w / 2;
      const y1 = src.y + src.h;
      const x2 = dst.x + dst.w / 2;
      const y2 = dst.y;

      const midY = (y1 + y2) / 2;
      const pathD = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

      edgesSvg += `
        <g class="dag-edge" data-from="${edge.fromId}" data-to="${edge.toId}">
          <path d="${pathD}" fill="none" stroke="rgba(207, 168, 92, 0.55)" stroke-width="1.8" marker-end="url(#arrowhead)" />
          ${edge.label ? `
            <rect x="${(x1 + x2) / 2 - 24}" y="${midY - 8}" width="48" height="14" rx="3" fill="#161b22" stroke="rgba(207,168,92,0.3)" />
            <text x="${(x1 + x2) / 2}" y="${midY + 3}" text-anchor="middle" font-size="9" fill="#cfa85c" font-family="sans-serif">${edge.label}</text>
          ` : ''}
        </g>
      `;
    }

    // Render nodes
    let nodesSvg = '';
    for (const node of nodeList) {
      const coord = nodeCoords.get(node.id);
      if (!coord) continue;
      const col = getColors(node.category);

      nodesSvg += `
        <g class="dag-node" data-node-id="${node.id}" style="cursor: pointer;" transform="translate(${coord.x}, ${coord.y})">
          <rect width="${coord.w}" height="${coord.h}" rx="6" fill="${col.bg}" stroke="${col.border}" stroke-width="1.4" />
          <text x="8" y="16" font-size="10" font-weight="bold" fill="${col.text}" font-family="sans-serif">${node.label.slice(0, 7)}</text>
          <text x="8" y="32" font-size="8.5" fill="#8b949e" font-family="sans-serif">${(node.role || node.category).slice(0, 9)}</text>
        </g>
      `;
    }

    const svgHeight = Math.max(height, (maxLayer + 1) * layerHeight + paddingY * 2);

    return `
      <svg class="dag-svg-canvas" viewBox="0 0 ${width} ${svgHeight}" width="100%" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">
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

  public getVirtualViewportEngine(): DagVirtualViewportEngine {
    const engine = new DagVirtualViewportEngine();
    engine.setGraph(this.getNodes(), this.getEdges());
    return engine;
  }

  public renderVirtualizedSvgGraph(viewport: ViewportRect): string {
    const engine = this.getVirtualViewportEngine();
    return engine.renderVirtualizedSvg(viewport);
  }

  public getVirtualLayoutMetrics(viewport: ViewportRect): VirtualLayoutMetrics {
    const engine = this.getVirtualViewportEngine();
    return engine.getVisibleMetrics(viewport);
  }
}
