declare module '@schema' {
  export interface StateDeltaEvent {
    id?: string;
    type?: string;
    [key: string]: unknown;
  }
  export interface SubgraphSlice {
    id: string;
    rootNodeId?: string;
    depth?: number;
    nodes?: Record<string, unknown> | unknown[];
    edges?: Array<{ id?: string; source?: string; target?: string; relation?: string }>;
    version?: number;
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
    applyDelta(delta: import('@schema').StateDeltaEvent): void;
  }
  export class CelestialCalendarEngine {
    constructor(calendarConfig: unknown, moonsConfig: unknown);
    getMoonPhase(moonId: string, day: number): number;
    getMoonPhaseName(phase: number): string;
  }
  export function calculateDistance(a: unknown, b: unknown): number;
  export function calculateTransmissionDelay(distance: number, speed: number): number;
}

declare module '@nano' {
  export type PASCase = string;
  export const JAPANESE_PAS_CASES: string[];
  export class BiaffinePASHead {
    constructor(config?: { hiddenDim?: number; numCases?: number });
  }
}
