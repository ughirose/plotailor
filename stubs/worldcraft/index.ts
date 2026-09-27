export class WorldOntologyEngine {
  applyDelta(_delta?: any): void {}
}

export class CelestialCalendarEngine {
  constructor(_spec?: any, _satellites?: any) {}
  getMoonPhase(_satId: string, _t: number): number {
    return 0.5;
  }
  getMoonPhaseName(_phase: number): string {
    return '満月';
  }
}

export function calculateDistance(_a: any, _b: any): number {
  return 100;
}

export function calculateTransmissionDelay(distance: number, speed: number = 50): number {
  return distance / speed;
}
