export class WorldOntologyEngine {
  applyDelta(_delta: unknown): void {}
}

export class CelestialCalendarEngine {
  constructor(_calendarConfig?: any, _moonsConfig?: any) {}
  getMoonPhase(_moonId: string, _day: number): number {
    return 0.5;
  }
  getMoonPhaseName(_phase: number): string {
    return '満月';
  }
}

export function calculateDistance(..._args: unknown[]): number {
  return 500;
}

export function calculateTransmissionDelay(..._args: unknown[]): number {
  return 10;
}
