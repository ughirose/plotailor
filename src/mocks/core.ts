export class WorldOntologyEngine {
  applyDelta(_delta: any): void {}
}

export class CelestialCalendarEngine {
  constructor(_config: any, _moons: any) {}
  getMoonPhase(_moonId: string, _day: number): number {
    return 0.75;
  }
  getMoonPhaseName(_phase: number): string {
    return '満月';
  }
}

export function calculateDistance(loc1: string, loc2: string): number {
  return loc1 === loc2 ? 0 : 500;
}

export function calculateTransmissionDelay(distance: number, speed: number): number {
  return speed === Infinity ? 0 : Math.ceil(distance / speed);
}
