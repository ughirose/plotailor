declare module '@schema' {
  export interface StateDeltaEvent {
    id: string;
    type?: string;
    payload?: unknown;
    timestamp?: number;
  }
  export interface SubgraphSlice {
    id: string;
    nodes?: Record<string, unknown> | unknown[];
    edges?: unknown[];
    [key: string]: unknown;
  }
  export interface NarrativeContext {
    id?: string;
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
    constructor(...args: any[]);
    getMoonPhase(...args: any[]): number;
    getMoonPhaseName(...args: any[]): string;
  }
  export function calculateDistance(...args: any[]): number;
  export function calculateTransmissionDelay(...args: any[]): number;
}

declare module '@nano' {
  export class BiaffinePASHead {
    constructor(...args: any[]);
  }
  export const JAPANESE_PAS_CASES: any;
  export type PASCase = any;
}
