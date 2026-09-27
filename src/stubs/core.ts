export class WorldOntologyEngine {
  applyDelta(delta: any): void {}
}

export class CelestialCalendarEngine {
  constructor(config: any, satellites?: any) {}
  getMoonPhase(satId: string, day: number): number { return 0.5; }
  getMoonPhaseName(phase: number): string { return '満月'; }
}

export function calculateDistance(a: any, b: any): number { return 0; }
export function calculateTransmissionDelay(dist: number, speed: number): number { return 0; }
