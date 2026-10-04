export class WorldOntologyEngine {
  applyDelta(_delta: unknown): void {}
}

export class CelestialCalendarEngine {
  constructor(_config: unknown, _satellites: unknown) {}
  getMoonPhase(_id: string, _t: number): number {
    return 0.5;
  }
  getMoonPhaseName(_phase: number): string {
    return '月相';
  }
}

export function calculateDistance(_a: unknown, _b: unknown): number {
  return 0;
}

export function calculateTransmissionDelay(_dist: number): number {
  return 0;
}
