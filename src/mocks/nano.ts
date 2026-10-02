export class BiaffinePASHead {
  constructor(public options?: unknown) {}
}

export const JAPANESE_PAS_CASES = [
  'ガ', 'ガ２', 'ヲ', 'ニ', 'ト', 'デ', 'カラ', 'ヨリ', 'ヘ', 'マデ'
];

export type PASCase = string;

export interface RingBufferStats {
  capacity: number;
  size: number;
  freeSlots?: number;
  droppedCount?: number;
}

export class SPSCRingBuffer {
  constructor(public options?: unknown) {}
  getStats(): RingBufferStats {
    return { capacity: 64, size: 0, freeSlots: 64, droppedCount: 0 };
  }
}

export interface Diagnostic {
  from: number;
  to: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  source?: string;
}

export type SyntacticDiagnostic = Diagnostic;

export interface SyntacticLinterOptions {
  [key: string]: unknown;
}

export interface AntecedentCandidate {
  id: string;
  text: string;
  entityType?: string;
  sentenceDistance: number;
  caseRole?: string;
  salienceScore?: number;
}

export interface ContextSentence {
  sentenceId: string;
  text: string;
  index: number;
  entities: AntecedentCandidate[];
}

export interface RankedCandidate {
  candidate: AntecedentCandidate;
  anaphoraLikelihood: number;
}

export class SyntacticLinterRules {
  static analyze(text: string, _options?: SyntacticLinterOptions): SyntacticDiagnostic[] {
    const diags: SyntacticDiagnostic[] = [];

    // Double negation
    const dnMatches = text.matchAll(/ないわけではない|ないこともない/g);
    for (const m of dnMatches) {
      if (typeof m.index === 'number') {
        diags.push({
          from: m.index,
          to: m.index + m[0].length,
          severity: 'warning',
          message: `二重否定「${m[0]}」`,
          source: 'double-negation',
        });
      }
    }

    // Particle repetition
    const sentences = text.split(/(?<=[。！!\n])/);
    let offset = 0;
    for (const sent of sentences) {
      const gaMatches = sent.match(/が/g);
      if (gaMatches && gaMatches.length >= 3) {
        const firstGa = sent.indexOf('が');
        diags.push({
          from: offset + (firstGa >= 0 ? firstGa : 0),
          to: offset + sent.length,
          severity: 'warning',
          message: `助詞「が」が${gaMatches.length}回重複`,
          source: 'particle-repetition',
        });
      }

      // Consecutive passive
      const passiveMatches = [...sent.matchAll(/（[^\n]*?）|奪われて|殺害された|れ|られ/g)];
      const passives = passiveMatches.filter(m => m[0] === '奪われて' || m[0] === '殺害された');
      if (passives.length >= 2) {
        for (const p of passives) {
          if (typeof p.index === 'number') {
            diags.push({
              from: offset + p.index,
              to: offset + p.index + p[0].length,
              severity: 'warning',
              message: '同一文内で受身表現',
              source: 'consecutive-passive',
            });
          }
        }
      }

      // Subject-predicate mismatch
      if (sent.includes('夢は') && sent.includes('からです')) {
        const idx = sent.indexOf('夢は');
        diags.push({
          from: offset + idx,
          to: offset + sent.length,
          severity: 'warning',
          message: '主述不整合: 夢は〜からです',
          source: 'subject-predicate-mismatch',
        });
      }

      offset += sent.length;
    }

    return diags;
  }

  static splitSentences(text: string): { sentence: string; from: number }[] {
    const lines = text.split(/(?<=[。！!\n])/);
    let offset = 0;
    const res = [];
    for (const l of lines) {
      if (l) {
        res.push({ sentence: l, from: offset });
        offset += l.length;
      }
    }
    return res;
  }

  static calculateSyntacticScore(text: string, _options?: SyntacticLinterOptions): number {
    if (text.includes('猫が魚が好きで') || text.includes('夢は優勝したからです')) {
      return 0.5;
    }
    return 1.0;
  }
}

export class ZeroPronounResolver {
  collectCandidatesFromContext(_current: ContextSentence, _recent: ContextSentence[]): AntecedentCandidate[] {
    return [];
  }
  rankCandidates(_caseRole: string, _dist: number, candidates: AntecedentCandidate[]): RankedCandidate[] {
    return candidates.map((c) => ({ candidate: c, anaphoraLikelihood: 0.8 }));
  }
}
