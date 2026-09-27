declare module '@schema' {
  export interface StateDeltaEvent {
    id?: string;
    type?: string;
    payload?: unknown;
    timestamp?: number;
    [key: string]: unknown;
  }
  export interface SubgraphSlice {
    id: string;
    rootNodeId?: string;
    depth?: number;
    nodes?: Record<string, unknown> | unknown[];
    edges?: unknown[];
    version?: number;
    [key: string]: unknown;
  }
  export interface NarrativeContext {
    id?: string;
    sliceId?: string;
    characterIds?: string[];
    activePlots?: string[];
    locationId?: string;
    [key: string]: unknown;
  }
}

declare module '@core' {
  export class WorldOntologyEngine {
    applyDelta(delta: unknown): void;
    [key: string]: unknown;
  }
  export class CelestialCalendarEngine {
    constructor(calendarConfig?: any, moonsConfig?: any);
    getMoonPhase(moonId: string, day: number): number;
    getMoonPhaseName(phase: number): string;
    [key: string]: unknown;
  }
  export function calculateDistance(...args: unknown[]): number;
  export function calculateTransmissionDelay(...args: unknown[]): number;
}

declare module '@nano' {
  export type PASCase = string;
  export const JAPANESE_PAS_CASES: readonly string[];
  export class BiaffinePASHead {
    constructor(options?: unknown);
    [key: string]: unknown;
  }
}
