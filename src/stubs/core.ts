import type { StateDeltaEvent } from './schema.js';

export class WorldOntologyEngine {
  applyDelta(_delta: StateDeltaEvent): void {}
}

export class CelestialCalendarEngine {
  constructor(public calConfig?: unknown, public moonsConfig?: unknown) {}
  getMoonPhase(_moonId: string, _day: number): number {
    return 0.5;
  }
  getMoonPhaseName(_phase: number): string {
    return '上弦の月';
  }
}

export function calculateDistance(_a: unknown, _b: unknown): number {
  return 100;
}

export function calculateTransmissionDelay(distance: number, speed: number): number {
  return speed <= 0 ? 0 : distance / speed;
}
