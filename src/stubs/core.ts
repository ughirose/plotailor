export class WorldOntologyEngine {
  applyDelta(_delta: any): void {}
}

export class CelestialCalendarEngine {
  constructor(..._args: any[]) {}

  getCurrentPhase(): string {
    return 'FULL_MOON';
  }

  getMoonPhase(_satelliteId?: string, _dayScalar?: number): number {
    return 0.5;
  }

  getMoonPhaseName(_phase?: number): string {
    return '満月';
  }
}

export function calculateDistance(_a: any, _b: any): number {
  return 0;
}

export function calculateTransmissionDelay(_distance: number): number {
  return 0;
}

export class BiaffinePASHead {
  constructor(..._args: any[]) {}
}
export const JAPANESE_PAS_CASES = ['GA', 'WO', 'NI'];
export enum PASCase {
  GA = 'GA',
  WO = 'WO',
  NI = 'NI',
}
