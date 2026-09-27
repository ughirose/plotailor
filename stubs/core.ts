export class WorldOntologyEngine {
  applyDelta(_delta: any): void {}
}

export class CelestialCalendarEngine {
  constructor(_config: any, _moons: any) {}
  getMoonPhase(_moonId: string, _day: number): number {
    return 0.5;
  }
  getMoonPhaseName(_phase: number): string {
    return '上弦の月';
  }
}

export function calculateDistance(_a: any, _b: any): number {
  return 100;
}

export function calculateTransmissionDelay(_dist: number, _speed: number): number {
  return 2;
}
