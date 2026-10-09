declare module '@schema' {
  export type DeltaOperation = 'create' | 'update' | 'delete' | 'patch';

  export interface StateDeltaEvent<T = unknown> {
    id: string;
    timestamp: number;
    entityId: string;
    operation: DeltaOperation;
    path?: string[];
    previousValue?: T;
    newValue?: T;
    metadata?: Record<string, unknown>;
  }

  export interface GraphEdge<TEdge = unknown> {
    id: string;
    source: string;
    target: string;
    relation: string;
    data?: TEdge;
  }

  export interface SubgraphSlice<TNode = unknown, TEdge = unknown> {
    id: string;
    rootNodeId: string;
    depth: number;
    nodes: Record<string, TNode>;
    edges: GraphEdge<TEdge>[];
    version: number;
    metadata?: Record<string, unknown>;
  }

  export interface NarrativeContext {
    characterIds: string[];
    locationId?: string;
    timelinePoint?: number;
    activePlots: string[];
  }
}


declare module '@nano' {
  export class BiaffinePASHead {
    constructor(options?: any);
  }
  export const JAPANESE_PAS_CASES: string[];
  export type PASCase = string;
}
