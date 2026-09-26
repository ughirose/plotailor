export class WorldOntologyEngine {
  applyDelta(_delta: any): void {}
}

export function calculateDistance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  const dx = (p2?.x ?? 0) - (p1?.x ?? 0);
  const dy = (p2?.y ?? 0) - (p1?.y ?? 0);
  return Math.sqrt(dx * dx + dy * dy);
}

export function calculateTransmissionDelay(distanceKm: number, speedKmPerDay: number): number {
  if (speedKmPerDay === Infinity || speedKmPerDay <= 0) return 0;
  return Math.ceil(distanceKm / speedKmPerDay);
}

export class CelestialCalendarEngine {
  constructor(_cal: any, _satellites: any) {}
  getMoonPhase(_satId: string, _day: number): number {
    return 0.5;
  }
  getMoonPhaseName(_phase: number): string {
    return '満月';
  }
}
