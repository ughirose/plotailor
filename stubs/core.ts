export class WorldOntologyEngine {
  applyDelta(_delta: any): void {}
}

export class CelestialCalendarEngine {
  constructor(_calDef?: any, _moons?: any) {}
  getMoonPhase(_id: string, _t: number): number {
    return 0.5;
  }
  getMoonPhaseName(_phase: number): string {
    return '満月';
  }
}

export function calculateDistance(_a: any, _b: any): number {
  return 0;
}

export function calculateTransmissionDelay(_d: any, _s: any): number {
  return 0;
}
