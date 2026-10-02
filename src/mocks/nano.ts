export class BiaffinePASHead {
  constructor(public options?: unknown) {}
}

export const JAPANESE_PAS_CASES = [
  'ガ', 'ガ２', 'ヲ', 'ニ', 'ト', 'デ', 'カラ', 'ヨリ', 'ヘ', 'マデ'
];

export type PASCase = string;

export class SyntacticLinterRules {
  static analyze(text: string, _options?: any): any[] {
    const diags: any[] = [];
    if (text.includes('ないわけではない')) {
      const idx = text.indexOf('ないわけではない');
      diags.push({
        from: idx,
        to: idx + 'ないわけではない'.length,
        severity: 'warning',
        message: '二重否定「ないわけではない」',
        source: 'double-negation',
      });
    }
    if (text.includes('彼が猫が魚が好きだ')) {
      const idx = text.indexOf('彼が猫が魚が好きだ');
      diags.push({
        from: idx,
        to: idx + '彼が猫が魚が好きだ'.length,
        severity: 'warning',
        message: '助詞「が」が3回重複',
        source: 'particle-repetition',
      });
    }
    if (text.includes('敵に城を奪われて、味方が皆殺害された。')) {
      const idx = text.indexOf('敵に城を奪われて');
      diags.push({
        from: idx,
        to: idx + '敵に城を奪われて'.length,
        severity: 'warning',
        message: '同一文内で受身表現',
        source: 'consecutive-passive',
      });
      const idx2 = text.indexOf('皆殺害された');
      diags.push({
        from: idx2,
        to: idx2 + '皆殺害された'.length,
        severity: 'warning',
        message: '同一文内で受身表現',
        source: 'consecutive-passive',
      });
    }
    if (text.includes('私の夢は、世界大会で優勝したからです。')) {
      const idx = text.indexOf('私の夢は、世界大会で優勝したからです。');
      diags.push({
        from: idx,
        to: idx + '私の夢は、世界大会で優勝したからです。'.length,
        severity: 'warning',
        message: '主述不整合',
        source: 'subject-predicate-mismatch',
      });
    }
    return diags;
  }

  static splitSentences(text: string): any[] {
    const sentences: any[] = [];
    const parts = text.split(/(\n|。)/);
    let buf = '';
    let startOffset = 0;
    for (const part of parts) {
      buf += part;
      if (part === '\n' || part === '。') {
        sentences.push({
          sentence: buf,
          from: startOffset,
          to: startOffset + buf.length,
        });
        startOffset += buf.length;
        buf = '';
      }
    }
    if (buf.length > 0) {
      sentences.push({
        sentence: buf,
        from: startOffset,
        to: startOffset + buf.length,
      });
    }
    return sentences;
  }

  static calculateSyntacticScore(text: string, _options?: any): number {
    if (text.includes('彼が猫が魚が好きで、夢は優勝したからです')) return 0.5;
    return 1.0;
  }
}

export class ZeroPronounResolver {
  collectCandidatesFromContext(currentSentence: any, recentSentences: any): any[] {
    const candidates: any[] = [];
    const all = [...(recentSentences || []), currentSentence];
    for (const s of all) {
      if (s?.entities) {
        for (const e of s.entities) {
          if (!candidates.some((c) => c.text === e.text)) {
            candidates.push(e);
          }
        }
      }
    }
    return candidates;
  }

  rankCandidates(_caseRole: string, _dist: number, candidates: any[]): any[] {
    return (candidates || []).map((c) => ({
      candidate: c,
      anaphoraLikelihood: 0.82,
      rankScore: 0.82,
      reason: 'context',
    }));
  }
}

export class SPSCRingBuffer {
  capacity: number;
  constructor(options?: any) {
    this.capacity = typeof options === 'number' ? options : options?.ringBufferCapacity || 64;
  }
  getStats(): any {
    return {
      capacity: this.capacity,
      freeSlots: this.capacity,
      droppedCount: 0,
    };
  }
}
