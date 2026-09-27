export class WorldOntologyEngine {
  applyDelta(_delta: any): void {}
}

export class CelestialCalendarEngine {
  constructor(_config?: any, _satellites?: any) {}
  getMoonPhase(_id: string, _day: number): number {
    return 0.5;
  }
  getMoonPhaseName(_phase: number): string {
    return '新月';
  }
}

export function calculateDistance(_locA?: any, _locB?: any): number {
  return 500;
}

export function calculateTransmissionDelay(_distance?: number, _method?: string): number {
  return 1;
}
