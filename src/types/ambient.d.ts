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

declare module '@core' {
  export class WorldOntologyEngine {
    applyDelta(delta: any): void;
  }
  export class CelestialCalendarEngine {
    constructor(config: any, satellites?: any);
    getMoonPhase(satId: string, day: number): number;
    getMoonPhaseName(phase: number): string;
  }
  export function calculateDistance(a: any, b: any): number;
  export function calculateTransmissionDelay(dist: number, speed: number): number;
}

declare module '@nano' {
  export class BiaffinePASHead {
    constructor(options?: any);
  }
  export const JAPANESE_PAS_CASES: string[];
  export type PASCase = string;
}
