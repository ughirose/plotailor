export class WorldOntologyEngine {
  applyDelta(_delta: unknown): void {}
}

export class CelestialCalendarEngine {
  constructor(public config: unknown, public moons: unknown[]) {}
  getMoonPhase(_id: string, _t: number): number {
    return 0.5;
  }
  getMoonPhaseName(_phase: number): string {
    return '上弦の月';
  }
}

export function calculateDistance(locA: string, locB: string): number {
  return locA === locB ? 0 : 500;
}

export function calculateTransmissionDelay(distance: number, speed: number): number {
  return speed === Infinity ? 0 : Math.ceil(distance / speed);
}
