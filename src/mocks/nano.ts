export class BiaffinePASHead {
  constructor(public options?: unknown) {}
}

export const JAPANESE_PAS_CASES = [
  'ガ', 'ガ２', 'ヲ', 'ニ', 'ト', 'デ', 'カラ', 'ヨリ', 'ヘ', 'マデ'
];

export type PASCase = string;

export class SyntacticLinterRules {
  static analyze(text: string): Diagnostic[] { return []; }
  static splitSentences(text: string): string[] { return [text]; }
  static calculateSyntacticScore(doc: string): number { return 100; }
}

export type Diagnostic = any;
export type SyntacticLinterOptions = any;

export class ZeroPronounResolver {
  collectCandidatesFromContext(sentence: any): any[] { return []; }
  rankCandidates(candidates: any[]): any[] { return []; }
}
export type AntecedentCandidate = any;
export type ContextSentence = any;

export class SPSCRingBuffer {
    constructor(buffer: SharedArrayBuffer) {}
    push(data: any) {}
    pop(): any { return null; }
    getStats(): RingBufferStats { return { size: 0, head: 0, tail: 0, lost: 0 }; }
}
export interface RingBufferStats {
    size: number;
    head: number;
    tail: number;
    lost: number;
    capacity?: number;
    freeSlots?: number;
    droppedCount?: number;
}
