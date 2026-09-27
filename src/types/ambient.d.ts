declare module '@schema' {
  export interface StateDeltaEvent {
    type: string;
    payload?: unknown;
    timestamp?: number;
    [key: string]: unknown;
  }
  export interface SubgraphSlice {
    id: string;
    rootNodeId?: string;
    depth?: number;
    nodes?: Record<string, unknown>;
    edges?: Array<{ id?: string; source?: string; target?: string; relation?: string; [key: string]: unknown }>;
    version?: number;
    [key: string]: unknown;
  }
  export interface NarrativeContext {
    characterIds?: string[];
    activePlots?: string[];
    locationId?: string;
    [key: string]: unknown;
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
