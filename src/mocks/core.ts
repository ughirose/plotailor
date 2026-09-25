export class WorldOntologyEngine {
  applyDelta(_delta: any): void {}
}

export class CelestialCalendarEngine {
  constructor(_config?: any, _satellites?: any) {}
  getMoonPhase(_satelliteId: string, _timeScalar: number): number {
    return 0.5;
  }
  getMoonPhaseName(_phase: number): string {
    return '満月';
  }
}

export function calculateDistance(..._args: any[]): number {
  return 0;
}

export function calculateTransmissionDelay(..._args: any[]): number {
  return 0;
}
