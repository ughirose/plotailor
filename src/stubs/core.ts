export class WorldOntologyEngine {
  applyDelta(_delta: unknown): void {}
}

export function calculateDistance(
  _p1: { x: number; y: number },
  _p2: { x: number; y: number }
): number {
  return 0;
}

export function calculateTransmissionDelay(
  _distance: number,
  _speed: number
): number {
  return 0;
}

export class CelestialCalendarEngine {
  constructor(_config: unknown, _moons: unknown) {}
  getMoonPhase(_id: string, _t: number): number {
    return 0.5;
  }
  getMoonPhaseName(_phase: number): string {
    return '満月';
  }
}
