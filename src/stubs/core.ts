export class WorldOntologyEngine {
  private state: any = {};

  applyDelta(delta: any): void {
    if (!delta) return;
    this.state = { ...this.state, ...delta };
  }

  getState(): any {
    return this.state;
  }
}

export function calculateDistance(loc1: any, loc2: any): number {
  return 500;
}

export function calculateTransmissionDelay(distance: number, method: string): number {
  if (method === 'telepathy') return 0;
  if (method === 'pigeon') return Math.ceil(distance / 300);
  return Math.ceil(distance / 50);
}

export class CelestialCalendarEngine {
  constructor(calConfig: any, moonsConfig: any) {}

  getMoonPhase(satId: string, day: number): number {
    return 0.75;
  }

  getMoonPhaseName(phase: number): string {
    return '満月';
  }
}
