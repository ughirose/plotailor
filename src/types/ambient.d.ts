declare module '@schema' {
  export interface StateDeltaEvent {
    [key: string]: any;
  }
  export interface SubgraphSlice {
    id: string;
    [key: string]: any;
  }
  export interface NarrativeContext {
    [key: string]: any;
  }
}

declare module '@core' {
  export class WorldOntologyEngine {
    applyDelta(delta: any): void;
  }
  export class CelestialCalendarEngine {
    constructor(...args: any[]);
    getMoonPhase(satelliteId: string, timeScalar: number): number;
    getMoonPhaseName(phase: number): string;
  }
  export function calculateDistance(...args: any[]): any;
  export function calculateTransmissionDelay(...args: any[]): any;
}

declare module '@nano' {
  export type PASCase = string;
  export const JAPANESE_PAS_CASES: PASCase[];
  export class BiaffinePASHead {
    constructor(options?: any);
    analyze?(text: string): any;
  }
}
