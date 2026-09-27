export class WorldOntologyEngine {
  applyDelta(_delta: any): void {}
}

export function calculateDistance(_a?: any, _b?: any): number {
  return 0;
}

export function calculateTransmissionDelay(_a?: any, _b?: any): number {
  return 0;
}

export class CelestialCalendarEngine {
  constructor(_config?: any, _satellites?: any) {}

  getCurrentTime(): number {
    return Date.now();
  }

  getMoonPhase(_satelliteId: string, _time: number): number {
    return 0.75;
  }

  getMoonPhaseName(_phase: number): string {
    return '満月';
  }
}
