export type PASCase = 'GA' | 'GA2' | 'WO' | 'NI' | 'TO' | 'DE' | 'KARA' | 'YORI' | 'HE' | 'MADE';

export const JAPANESE_PAS_CASES: PASCase[] = [
  'GA', 'GA2', 'WO', 'NI', 'TO', 'DE', 'KARA', 'YORI', 'HE', 'MADE'
];

export class BiaffinePASHead {
  constructor(options?: { hiddenDim?: number; numCases?: number }) {}

  analyze(text: string): any {
    return [];
  }
}
