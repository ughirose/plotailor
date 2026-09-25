export class WorldOntologyEngine {
  applyDelta(_delta: any): void {}
}

export class CelestialCalendarEngine {
  getMoonPhase(): number {
    return 0.5;
  }
  getMoonPhaseName(): string {
    return 'Full Moon';
  }
}

export function calculateDistance(): number {
  return 0;
}

export function calculateTransmissionDelay(): number {
  return 0;
}

export class BiaffinePASHead {}

export const JAPANESE_PAS_CASES = {};

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
