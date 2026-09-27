export class WorldOntologyEngine {
  applyDelta(_delta: any): void {}
}

export class CelestialCalendarEngine {
  constructor(_config?: any, _satellites?: any) {}
  getMoonPhase(_satId: string, _t: number): number {
    return 0.5;
  }
  getMoonPhaseName(_phase: number): string {
    return '上弦の月';
  }
}

export function calculateDistance(_loc1: string, _loc2: string): number {
  return 500;
}

export function calculateTransmissionDelay(_dist: number, _speed: number): number {
  return 10;
}
