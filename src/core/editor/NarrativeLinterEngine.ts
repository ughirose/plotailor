import {
  SyntacticLinterRules,
  type Diagnostic as SyntacticDiagnostic,
  type SyntacticLinterOptions,
} from '@worldcraft/narrative-nano';
import {
  ZeroPronounResolver,
  type AntecedentCandidate,
  type ContextSentence,
} from '@worldcraft/narrative-nano';

export interface SyntacticLinterItem {
  id: string;
  from: number;
  to: number;
  line: number;
  col: number;
  severity: 'error' | 'warning' | 'info';
  ruleType: 'double-negation' | 'particle-repetition' | 'consecutive-passive' | 'subject-predicate-mismatch' | string;
  message: string;
  source: string;
  previewText?: string;
}

export interface ZeroPronounCandidate {
  text: string;
  likelihood: number;
  entityType?: string;
  distance: number;
}

export interface ZeroPronounItem {
  id: string;
  from: number;
  to: number;
  line: number;
  col: number;
  predicateText: string;
  omittedCase: string; // e.g., 'ガ'
  zeroPronounScore: number;
  bestCandidate: ZeroPronounCandidate | null;
  candidates: ZeroPronounCandidate[];
  message: string;
  previewText?: string;
}

export interface NarrativeAnalysisResult {
  syntacticItems: SyntacticLinterItem[];
  zeroPronounItems: ZeroPronounItem[];
  syntacticScore: number; // 0 to 100
  totalWarnings: number;
  analyzedWindow?: { from: number; to: number };
}

export class NarrativeLinterEngine {
  private zpResolver: ZeroPronounResolver;
  private defaultKnownEntities: AntecedentCandidate[] = [
    { id: 'ent-valerius', text: 'ヴァレリウス', entityType: 'character', sentenceDistance: 0, caseRole: 'ガ', salienceScore: 1.5 },
    { id: 'ent-selene', text: 'セレネ', entityType: 'character', sentenceDistance: 0, caseRole: 'ガ', salienceScore: 1.3 },
    { id: 'ent-arthur', text: 'アーサー', entityType: 'character', sentenceDistance: 0, caseRole: 'ガ', salienceScore: 1.2 },
    { id: 'ent-soldier', text: '斥候', entityType: 'character', sentenceDistance: 0, caseRole: 'ガ', salienceScore: 1.0 },
    { id: 'ent-emperor', text: '皇帝', entityType: 'character', sentenceDistance: 0, caseRole: 'ガ', salienceScore: 1.2 },
    { id: 'ent-man', text: '男', entityType: 'character', sentenceDistance: 0, caseRole: 'ガ', salienceScore: 1.1 },
    { id: 'ent-he', text: '彼', entityType: 'character', sentenceDistance: 0, caseRole: 'ガ', salienceScore: 1.0 },
  ];

  constructor(customResolver?: ZeroPronounResolver) {
    this.zpResolver = customResolver ?? new ZeroPronounResolver();
  }

  /**
   * Helper to convert character offset to 1-indexed line and column.
   */
  public static offsetToLineCol(text: string, offset: number): { line: number; col: number } {
    const clamped = Math.max(0, Math.min(offset, text.length));
    const lines = text.slice(0, clamped).split('\n');
    const line = lines.length;
    const col = lines[lines.length - 1].length + 1;
    return { line, col };
  }

  /**
   * Execute full syntactic and zero-pronoun resolution analysis.
   */
  public analyzeDocument(
    text: string,
    options?: {
      entities?: AntecedentCandidate[];
      slidingWindow?: { from: number; to: number };
      linterOptions?: SyntacticLinterOptions;
    }
  ): NarrativeAnalysisResult {
    if (!text || text.trim().length === 0) {
      return {
        syntacticItems: [],
        zeroPronounItems: [],
        syntacticScore: 100,
        totalWarnings: 0,
      };
    }

    const targetText = text;
    const window = options?.slidingWindow;

    // 1. Syntactic Linter Rules analysis
    const rawSyntacticDiags: SyntacticDiagnostic[] = SyntacticLinterRules.analyze(
      targetText,
      options?.linterOptions
    );

    const syntacticItems: SyntacticLinterItem[] = [];
    for (let i = 0; i < rawSyntacticDiags.length; i++) {
      const diag = rawSyntacticDiags[i];

      // If sliding window is specified, only include items intersecting the window
      if (window) {
        if (diag.to < window.from || diag.from > window.to) {
          continue;
        }
      }

      const { line, col } = NarrativeLinterEngine.offsetToLineCol(targetText, diag.from);
      let ruleType = 'syntactic';
      if (diag.source?.includes('double-negation')) ruleType = 'double-negation';
      else if (diag.source?.includes('particle-repetition')) ruleType = 'particle-repetition';
      else if (diag.source?.includes('consecutive-passive')) ruleType = 'consecutive-passive';
      else if (diag.source?.includes('subject-predicate-mismatch')) ruleType = 'subject-predicate-mismatch';

      // Deduplicate particle-repetition diagnostics on the same line for IDE issue list aggregation
      if (ruleType === 'particle-repetition') {
        const alreadyExists = syntacticItems.some(
          (item) => item.ruleType === 'particle-repetition' && item.line === line && item.message === diag.message
        );
        if (alreadyExists) {
          continue;
        }
      }

      const previewText = targetText.slice(diag.from, diag.to);

      syntacticItems.push({
        id: `syn-${i}-${diag.from}`,
        from: diag.from,
        to: diag.to,
        line,
        col,
        severity: diag.severity === 'error' ? 'error' : 'warning',
        ruleType,
        message: diag.message,
        source: diag.source ?? 'narrative-nano',
        previewText,
      });
    }

    // 2. Zero Pronoun Resolution analysis
    const zeroPronounItems = this.detectZeroPronouns(targetText, options?.entities, window);

    // 3. Overall syntactic score computation
    const sentences = SyntacticLinterRules.splitSentences(targetText);
    let totalScore = 0;
    let countedSentences = 0;

    for (const sent of sentences) {
      if (!sent.sentence.trim()) continue;
      const sScore = SyntacticLinterRules.calculateSyntacticScore(sent.sentence, options?.linterOptions);
      totalScore += sScore;
      countedSentences++;
    }

    let avgScore = countedSentences > 0 ? (totalScore / countedSentences) * 100 : 100;
    // Deduct for unresolved zero pronouns
    if (zeroPronounItems.length > 0) {
      avgScore = Math.max(10, avgScore - zeroPronounItems.length * 5);
    }
    const finalScore = Math.round(Math.min(100, Math.max(0, avgScore)));

    return {
      syntacticItems,
      zeroPronounItems,
      syntacticScore: finalScore,
      totalWarnings: syntacticItems.length + zeroPronounItems.length,
      analyzedWindow: window,
    };
  }

  /**
   * Identifies sentences with missing subject ('ガ'格) and resolves antecedent candidates using ZeroPronounResolver.
   */
  private detectZeroPronouns(
    text: string,
    knownEntities?: AntecedentCandidate[],
    window?: { from: number; to: number }
  ): ZeroPronounItem[] {
    const rawSentences = SyntacticLinterRules.splitSentences(text);
    const activeEntities = knownEntities && knownEntities.length > 0 ? knownEntities : this.defaultKnownEntities;

    const contextSentences: ContextSentence[] = [];
    const results: ZeroPronounItem[] = [];

    // First pass: extract context sentences and explicitly present entities
    for (let sIdx = 0; sIdx < rawSentences.length; sIdx++) {
      const s = rawSentences[sIdx];
      const sText = s.sentence;

      const foundEntitiesInSentence: AntecedentCandidate[] = [];

      for (const ent of activeEntities) {
        if (sText.includes(ent.text)) {
          // Check role marker in sentence (e.g. ヴァレリウスは, ヴァレリウスが)
          let caseRole = ent.caseRole ?? 'ガ';
          if (sText.includes(`${ent.text}は`)) caseRole = 'ハ';
          else if (sText.includes(`${ent.text}が`)) caseRole = 'ガ';
          else if (sText.includes(`${ent.text}を`)) caseRole = 'ヲ';
          else if (sText.includes(`${ent.text}に`)) caseRole = 'ニ';

          foundEntitiesInSentence.push({
            ...ent,
            caseRole,
            sentenceDistance: 0,
          });
        }
      }

      // Also detect common topic nouns as candidate entities (男, 彼, 彼女, 兵)
      const genericNounMatches = sText.match(/(?:[男彼彼女兵将軍][はが])/g);
      if (genericNounMatches) {
        for (const m of genericNounMatches) {
          const nounText = m.slice(0, -1);
          if (!foundEntitiesInSentence.some((e) => e.text === nounText)) {
            foundEntitiesInSentence.push({
              id: `gen-${sIdx}-${nounText}`,
              text: nounText,
              entityType: 'character',
              sentenceDistance: 0,
              caseRole: m.endsWith('は') ? 'ハ' : 'ガ',
              salienceScore: 1.0,
            });
          }
        }
      }

      contextSentences.push({
        sentenceId: `s-${sIdx}`,
        text: sText,
        index: sIdx,
        entities: foundEntitiesInSentence,
      });
    }

    // Second pass: detect sentences with action predicates lacking an explicit subject
    // Typical action predicate endings in Japanese fiction
    const actionPredicateRegex =
      /([^。、\n]{1,20}?(?:翻した|見据えた|命じた|歩き出した|立ち上がった|走った|睨みつけた|振り返った|呟いた|叫んだ|抜いた|構えた|息を呑んだ|頷いた|微笑んだ|見上げた|告げた|手にした|抱きしめた|口を開いた))[。！!\n]?$/;

    for (let sIdx = 0; sIdx < rawSentences.length; sIdx++) {
      const s = rawSentences[sIdx];
      const sText = s.sentence.trim();

      // Check if sentence has an explicit subject marker 'は' or 'が'
      const hasSubject = /(?:[^\s。、]{1,15})(?:は|が)/.test(sText);
      const isQuotedDialogue = /^[「『（]/.test(sText) && /[」』）]$/.test(sText);

      // If it's a narrative sentence lacking a subject and ending in an action predicate
      if (!hasSubject && !isQuotedDialogue) {
        const predMatch = sText.match(actionPredicateRegex);
        if (predMatch) {
          const predicateText = predMatch[1];
          const predLocalIndex = s.sentence.indexOf(predicateText);
          const from = s.from + (predLocalIndex >= 0 ? predLocalIndex : 0);
          const to = from + predicateText.length;

          // Apply sliding window filtering if given
          if (window) {
            if (to < window.from || from > window.to) {
              continue;
            }
          }

          const currentSentence = contextSentences[sIdx];
          const recentSentences = contextSentences.slice(Math.max(0, sIdx - 3), sIdx);

          // Collect antecedent candidates from preceding context
          const candidates = this.zpResolver.collectCandidatesFromContext(
            currentSentence,
            recentSentences
          );

          // If no candidates found from text context, use active entities as baseline
          const fallbackCandidates = candidates.length > 0 ? candidates : activeEntities;
          const ranked = this.zpResolver.rankCandidates('ガ', 0, fallbackCandidates);

          const best = ranked.length > 0 ? ranked[0] : null;
          const { line, col } = NarrativeLinterEngine.offsetToLineCol(text, from);

          const candidateList: ZeroPronounCandidate[] = ranked.slice(0, 3).map((r) => ({
            text: r.candidate.text,
            likelihood: Math.round(r.anaphoraLikelihood * 100),
            entityType: r.candidate.entityType,
            distance: r.candidate.sentenceDistance,
          }));

          const bestCand = best
            ? {
                text: best.candidate.text,
                likelihood: Math.round(best.anaphoraLikelihood * 100),
                entityType: best.candidate.entityType,
                distance: best.candidate.sentenceDistance,
              }
            : null;

          const candidateMsg = bestCand
            ? `推定主語: 「${bestCand.text}」（適合度: ${bestCand.likelihood}%）`
            : '文脈からの主語推定が必要です';

          results.push({
            id: `zp-${sIdx}-${from}`,
            from,
            to,
            line,
            col,
            predicateText,
            omittedCase: 'ガ',
            zeroPronounScore: best ? best.anaphoraLikelihood : 0.8,
            bestCandidate: bestCand,
            candidates: candidateList,
            message: `主語（ガ格）抜け検知: 述語「${predicateText}」/ ${candidateMsg}`,
            previewText: predicateText,
          });
        }
      }
    }

    return results;
  }
}
