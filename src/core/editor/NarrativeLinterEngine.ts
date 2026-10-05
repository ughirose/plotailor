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
import { DemonstrativeOveruseDetector } from './DemonstrativeOveruseDetector.js';
import { PassiveVoiceDetector } from './PassiveVoiceDetector.js';
import { SensoryLexiconScorer, type SensoryAnalysisResult } from './SensoryLexiconScorer.js';
import { ParticleRepetitionLinterEngine } from './ParticleRepetitionLinter.js';
import { KanjiHirakuDictionaryEngine } from './KanjiHirakuDictionary.js';
import { EllipsisDashLinterEngine } from './EllipsisDashLinter.js';
import { BracketPairChecker } from './BracketPairChecker.js';
import { QwertyTypoDetector } from './QwertyTypoDetector.js';
import { PrhRuleEngine } from './PrhRuleEngine.js';

export interface SyntacticLinterItem {
  id: string;
  from: number;
  to: number;
  line: number;
  col: number;
  severity: 'error' | 'warning' | 'info';
  tier?: 1 | 2 | 3;
  ruleType: 'double-negation' | 'particle-repetition' | 'consecutive-passive' | 'subject-predicate-mismatch' | 'ellipsis-dash' | 'bracket-pair' | 'qwerty-typo' | string;
  message: string;
  source: string;
  previewText?: string;
  replacementText?: string;
  snippet?: string;
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
  snippet?: string;
}

export interface PovDiagnosticItem {
  id: string;
  from: number;
  to: number;
  line: number;
  col: number;
  epistemicScore: number;
  message: string;
  snippet?: string;
}

export interface EventActionItem {
  id: string;
  from: number;
  to: number;
  actionType: 'None' | 'Acquire' | 'Drop' | 'Move' | 'Speak' | 'StateChange';
  actionId: number;
  text: string;
}

export interface EntitySpanItem {
  id: string;
  from: number;
  to: number;
  text: string;
  type: string;
}

export interface ConnectiveRelationItem {
  id: string;
  from: number;
  to: number;
  relationType: 'None' | 'Causal' | 'Adversative' | 'Temporal' | 'Additive';
  relationId: number;
  text: string;
}

export interface ModelMultiTaskOutputs {
  modality?: Float32Array | number[]; // [seqLen, 2]
  offset?: Float32Array | number[];   // [seqLen, 65]
  label?: Float32Array | number[];    // [seqLen, 8]
  case?: Float32Array | number[];     // [seqLen, 10]
  epistemic?: Float32Array | number[];// [seqLen, 1]
  event_action?: Float32Array | number[]; // [seqLen, 6]
  entity?: Float32Array | number[];   // [seqLen, 4]
  connective?: Float32Array | number[]; // [seqLen, 5]
  seqLen: number;
  text: string;
  offsetStart?: number;
}

export interface NarrativeAnalysisResult {
  syntacticItems: SyntacticLinterItem[];
  zeroPronounItems: ZeroPronounItem[];
  syntacticScore: number; // 0 to 100
  totalWarnings: number;
  analyzedWindow?: { from: number; to: number };
  sensoryAnalysis?: SensoryAnalysisResult;
  povItems?: PovDiagnosticItem[];
  eventActionItems?: EventActionItem[];
  entitySpanItems?: EntitySpanItem[];
  connectiveItems?: ConnectiveRelationItem[];
}

export class NarrativeLinterEngine {
  private zpResolver: ZeroPronounResolver;
  private demonstrativeDetector = new DemonstrativeOveruseDetector();
  private passiveDetector = new PassiveVoiceDetector();
  private sensoryScorer = new SensoryLexiconScorer();
  private particleRepetitionEngine = new ParticleRepetitionLinterEngine();
  private hirakuEngine = new KanjiHirakuDictionaryEngine();
  private ellipsisLinter = new EllipsisDashLinterEngine();
  private bracketChecker = new BracketPairChecker();
  private typoDetector = new QwertyTypoDetector();
  private prhEngine = new PrhRuleEngine();
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

  public getParticleRepetitionEngine(): ParticleRepetitionLinterEngine {
    return this.particleRepetitionEngine;
  }

  public getHirakuEngine(): KanjiHirakuDictionaryEngine {
    return this.hirakuEngine;
  }

  public getEllipsisLinter(): EllipsisDashLinterEngine {
    return this.ellipsisLinter;
  }

  public getBracketChecker(): BracketPairChecker {
    return this.bracketChecker;
  }

  public getTypoDetector(): QwertyTypoDetector {
    return this.typoDetector;
  }

  public getPrhEngine(): PrhRuleEngine {
    return this.prhEngine;
  }

  private currentCadenceStatus?: import('./QwertyTypoDetector.js').CadenceStatusKind;

  public setCadenceStatus(status?: import('./QwertyTypoDetector.js').CadenceStatusKind): void {
    this.currentCadenceStatus = status;
  }

  public getCadenceStatus(): import('./QwertyTypoDetector.js').CadenceStatusKind | undefined {
    return this.currentCadenceStatus;
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
   * Extracts a contextual sentence or surrounding snippet for diagnostics display.
   */
  public static extractContextSnippet(text: string, from: number, to: number, maxRadius = 32): string {
    if (!text) return '';
    // Look backwards for sentence start or newline
    let start = Math.max(0, from - maxRadius);
    const prevNewline = text.lastIndexOf('\n', from);
    if (prevNewline !== -1 && prevNewline >= start) {
      start = prevNewline + 1;
    } else {
      const prevSentenceEnd = Math.max(
        text.lastIndexOf('。', from),
        text.lastIndexOf('！', from),
        text.lastIndexOf('？', from)
      );
      if (prevSentenceEnd !== -1 && prevSentenceEnd >= start) {
        start = prevSentenceEnd + 1;
      }
    }

    // Look forwards for sentence end or newline
    let end = Math.min(text.length, to + maxRadius);
    const nextNewline = text.indexOf('\n', to);
    if (nextNewline !== -1 && nextNewline < end) {
      end = nextNewline;
    } else {
      const periods = ['。', '！', '？']
        .map((p) => text.indexOf(p, to))
        .filter((idx) => idx !== -1);
      if (periods.length > 0) {
        const nextPeriod = Math.min(...periods);
        if (nextPeriod + 1 <= end) {
          end = nextPeriod + 1;
        }
      }
    }

    let snippet = text.slice(start, end).trim();
    if (start > 0 && !text.slice(0, start).endsWith('\n') && !text.slice(0, start).endsWith('。')) {
      snippet = '…' + snippet;
    }
    if (end < text.length && !text.slice(end).startsWith('\n') && !text.slice(0, end).endsWith('。')) {
      snippet = snippet + '…';
    }
    return snippet;
  }

  /**
   * Masks Aozora Bunko and Markdown markup (preserving exact character offsets)
   * so syntactic analyzers (particles, zero-pronouns, style linter) process pure literary text.
   */
  public static maskMarkupForSyntax(text: string): string {
    let masked = text;

    // 1. Bouten 4-angle: <<<<word>>>> or ＜＜＜＜word＞＞＞＞ -> replace delimiter symbols with spaces
    masked = masked.replace(/(<{4,}|＜{4,})([^\n<>《》＜＞]+?)(>{4,}|＞{4,})/g, (_m, open, content, close) => {
      return ' '.repeat(open.length) + content + ' '.repeat(close.length);
    });

    // 2. Bouten double bracket: 《《word》》 -> replace 《《 and 》》 with spaces
    masked = masked.replace(/《《([^》\n]+?)》》/g, (_m, content) => {
      return '  ' + content + '  ';
    });

    // 3. Bouten tag: ［＃「...」に傍点］ and ［＃傍点］...［＃傍点終わり］
    masked = masked.replace(/[［\[]＃「[^」\n]+?」に傍点[］\]]/g, (match) => {
      return ' '.repeat(match.length);
    });
    masked = masked.replace(/([［\[]＃傍点[］\]])([^\n［］\[\]]+?)([［\[]＃傍点終わり[］\]])/g, (_m, open, content, close) => {
      return ' '.repeat(open.length) + content + ' '.repeat(close.length);
    });

    // 4. Markdown bold: **word** -> replace ** with spaces
    masked = masked.replace(/(\*\*)([^*\n]+?)(\*\*)/g, (_m, open, content, close) => {
      return ' '.repeat(open.length) + content + ' '.repeat(close.length);
    });

    // 5. Explicit ruby: ｜親文字《るび》, |親文字<<るび>>
    masked = masked.replace(/([｜|])([^\n｜|《》<>＜＞]+?)(?:《|<<|＜＜)([^\n《》<>＜＞]+?)(?:》|>>|＞＞)/g, (match, pipe, base) => {
      return ' '.repeat(pipe.length) + base + ' '.repeat(match.length - pipe.length - base.length);
    });

    // 6. Implicit ruby: 語句《るび》, 語句<<るび>>
    masked = masked.replace(/([一-龠々〆ヵヶ\u3400-\u4dbf\uf900-\ufaff\u30a0-\u30ffA-Za-z0-9]+)(?:《|<<|＜＜)([^\n《》<>＜＞]+?)(?:》|>>|＞＞)/g, (match, base) => {
      return base + ' '.repeat(match.length - base.length);
    });

    return masked;
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

    // Mask Aozora Bunko and Markdown markup (preserving character length/offsets)
    // so syntactical analysis (particles, clauses, zero-pronouns) is not polluted by markup delimiters.
    const syntaxCleanText = NarrativeLinterEngine.maskMarkupForSyntax(targetText);

    // 1. Syntactic Linter Rules analysis
    const rawSyntacticDiags: SyntacticDiagnostic[] = SyntacticLinterRules.analyze(
      syntaxCleanText,
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
      const snippet = NarrativeLinterEngine.extractContextSnippet(targetText, diag.from, diag.to);

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
        snippet,
      });
    }

    // 1.5 Additional Literary Quality checks: consecutive punctuation and character repetition
    const punctRegex = /([、。，．]){2,}/g;
    let punctMatch: RegExpExecArray | null;
    while ((punctMatch = punctRegex.exec(targetText)) !== null) {
      const from = punctMatch.index;
      const to = from + punctMatch[0].length;
      if (window && (to < window.from || from > window.to)) continue;
      const { line, col } = NarrativeLinterEngine.offsetToLineCol(targetText, from);
      syntacticItems.push({
        id: `syn-punct-${from}`,
        from,
        to,
        line,
        col,
        severity: 'error',
        ruleType: 'consecutive-punctuation',
        message: `句読点の連続「${punctMatch[0]}」は読者のリズムを阻害します。`,
        source: 'narrative-linter',
        previewText: punctMatch[0],
        snippet: NarrativeLinterEngine.extractContextSnippet(targetText, from, to),
      });
    }

    // Char repetition: target natural language characters (hiragana, katakana, han, letter)
    // while strictly excluding punctuation, typographical leaders (... / --), and markup symbols (<, >, *, etc.)
    const charRepeatRegex = /([\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\p{Letter}])\1{3,}/gu;
    let charMatch: RegExpExecArray | null;
    while ((charMatch = charRepeatRegex.exec(syntaxCleanText)) !== null) {
      const from = charMatch.index;
      const to = from + charMatch[0].length;
      if (window && (to < window.from || from > window.to)) continue;
      const { line, col } = NarrativeLinterEngine.offsetToLineCol(targetText, from);
      syntacticItems.push({
        id: `syn-repeat-${from}`,
        from,
        to,
        line,
        col,
        severity: 'error',
        ruleType: 'char-repetition',
        message: `同一文字の連続「${charMatch[0].slice(0, 8)}」が検出されました。推敲または脱字・連打を確認してください。`,
        source: 'narrative-linter',
        previewText: charMatch[0],
        snippet: NarrativeLinterEngine.extractContextSnippet(targetText, from, to),
      });
    }

    // 1.6 Demonstrative overuse analysis (こそあど言葉過多)
    try {
      const demoDiags = this.demonstrativeDetector.detect(syntaxCleanText);
      for (const d of demoDiags) {
        if (window && (d.to < window.from || d.from > window.to)) continue;
        const { line, col } = NarrativeLinterEngine.offsetToLineCol(targetText, d.from);
        syntacticItems.push({
          id: `syn-demo-${d.from}`,
          from: d.from,
          to: d.to,
          line,
          col,
          severity: d.severity,
          ruleType: 'demonstrative-overuse',
          message: d.message,
          source: 'demonstrative-detector',
          previewText: d.demonstrative,
          snippet: NarrativeLinterEngine.extractContextSnippet(targetText, d.from, d.to),
        });
      }
    } catch {}

    // 1.7 Passive voice overuse analysis (受動態・使役受動態過多)
    try {
      const passiveDiags = this.passiveDetector.detect(syntaxCleanText);
      for (const p of passiveDiags) {
        if (window && (p.to < window.from || p.from > window.to)) continue;
        const { line, col } = NarrativeLinterEngine.offsetToLineCol(targetText, p.from);
        syntacticItems.push({
          id: `syn-passive-${p.from}`,
          from: p.from,
          to: p.to,
          line,
          col,
          severity: p.severity,
          ruleType: 'passive-voice',
          message: p.message,
          source: 'passive-detector',
          previewText: p.matches[0]?.text,
          snippet: NarrativeLinterEngine.extractContextSnippet(targetText, p.from, p.to),
        });
      }
    } catch {}

    // 1.8 Particle repetition analysis (助詞重複・連続検知)
    try {
      const particleDiags = this.particleRepetitionEngine.lint(syntaxCleanText);
      for (const p of particleDiags) {
        if (window && (p.to < window.from || p.from > window.to)) continue;
        const { line, col } = NarrativeLinterEngine.offsetToLineCol(targetText, p.from);
        const alreadyExists = syntacticItems.some(
          (item) => item.ruleType === 'particle-repetition' && item.line === line && item.previewText === p.particle
        );
        if (!alreadyExists) {
          syntacticItems.push({
            id: `syn-particle-${p.from}`,
            from: p.from,
            to: p.to,
            line,
            col,
            severity: p.severity,
            ruleType: 'particle-repetition',
            message: p.message,
            source: 'particle-repetition-detector',
            previewText: p.particle,
            snippet: NarrativeLinterEngine.extractContextSnippet(targetText, p.from, p.to),
          });
        }
      }
    } catch {}

    // 1.9 Kanji Hiraku / Orthography analysis (ひらくべき漢字・表記揺れ候補検知)
    try {
      const hirakuDiags = this.hirakuEngine.lint(syntaxCleanText);
      for (const h of hirakuDiags) {
        if (window && (h.to < window.from || h.from > window.to)) continue;
        const { line, col } = NarrativeLinterEngine.offsetToLineCol(targetText, h.from);
        syntacticItems.push({
          id: `syn-hiraku-${h.from}`,
          from: h.from,
          to: h.to,
          line,
          col,
          severity: h.severity,
          tier: 1,
          ruleType: 'kanji-hiraku',
          message: h.message,
          source: 'kanji-hiraku-dictionary',
          previewText: h.kanji,
          replacementText: h.hiragana,
          snippet: NarrativeLinterEngine.extractContextSnippet(targetText, h.from, h.to),
        });
      }
    } catch {}

    // 1.11 Tier 1: Ellipsis & Dash even-parity rule (三点リーダー・ダッシュ偶数対)
    try {
      const ellipsisDiags = this.ellipsisLinter.lint(targetText);
      for (const ed of ellipsisDiags) {
        if (window && (ed.to < window.from || ed.from > window.to)) continue;
        const { line, col } = NarrativeLinterEngine.offsetToLineCol(targetText, ed.from);
        syntacticItems.push({
          id: `syn-ellipsis-${ed.from}`,
          from: ed.from,
          to: ed.to,
          line,
          col,
          severity: ed.severity,
          tier: 1,
          ruleType: 'ellipsis-dash',
          message: ed.message,
          source: 'ellipsis-dash-linter',
          previewText: ed.found,
          replacementText: ed.replacement,
          snippet: NarrativeLinterEngine.extractContextSnippet(targetText, ed.from, ed.to),
        });
      }
    } catch {}

    // 1.12 Tier 1: Bracket Pair Consistency (括弧整合性チェック)
    try {
      const bracketDiags = this.bracketChecker.check(targetText);
      for (const b of bracketDiags) {
        if (window && (b.to < window.from || b.from > window.to)) continue;
        syntacticItems.push({
          id: `syn-bracket-${b.from}`,
          from: b.from,
          to: b.to,
          line: b.line,
          col: b.column,
          severity: b.severity,
          tier: 1,
          ruleType: 'bracket-pair',
          message: b.message,
          source: 'bracket-pair-checker',
          previewText: b.bracket,
          replacementText: b.expectedBracket,
          snippet: NarrativeLinterEngine.extractContextSnippet(targetText, b.from, b.to),
        });
      }
    } catch {}

    // 1.13 Tier 1: QWERTY Typo & Phonological Transposition (和文タイピング誤入力検知)
    try {
      const typos = this.typoDetector.detectTyposInText(targetText, this.currentCadenceStatus);
      for (const typo of typos) {
        const from = targetText.indexOf(typo.original);
        if (from !== -1) {
          const to = from + typo.original.length;
          if (window && (to < window.from || from > window.to)) continue;
          const { line, col } = NarrativeLinterEngine.offsetToLineCol(targetText, from);
          const msg = typo.isTransposition
            ? `音韻反転タイポ「${typo.original}」を検出しました。`
            : `誤打鍵タイポ「${typo.original}」を検出しました。`;
          syntacticItems.push({
            id: `syn-typo-${from}`,
            from,
            to,
            line,
            col,
            severity: 'warning',
            tier: 1,
            ruleType: 'qwerty-typo',
            message: `${msg}（推奨: 「${typo.candidate}」）`,
            source: 'qwerty-typo-detector',
            previewText: typo.original,
            replacementText: typo.candidate,
            snippet: NarrativeLinterEngine.extractContextSnippet(targetText, from, to),
          });
        }
      }
    } catch {}

    // 1.14 Tier 1: PRH Proofreading Rule Violations (PRH表記揺れ・用字用語ルール)
    try {
      const prhMatches = this.prhEngine.scan(targetText);
      for (const match of prhMatches) {
        if (window && (match.to < window.from || match.from > window.to)) continue;
        const { line, col } = NarrativeLinterEngine.offsetToLineCol(targetText, match.from);
        syntacticItems.push({
          id: `syn-prh-${match.ruleId}-${match.from}`,
          from: match.from,
          to: match.to,
          line,
          col,
          severity: match.action === 'replace' ? 'error' : 'warning',
          tier: 1,
          ruleType: 'prh-rule',
          message: match.description
            ? `表記ゆれ検知（用字用語ルール違反）: 「${match.matchedText}」→「${match.expected}」（${match.description}）`
            : `表記ゆれ検知（用字用語ルール違反）: 「${match.matchedText}」→「${match.expected}」`,
          source: 'prh-rule-engine',
          previewText: match.matchedText,
          replacementText: match.expected,
          snippet: NarrativeLinterEngine.extractContextSnippet(targetText, match.from, match.to),
        });
      }
    } catch {}


    // 1.10 Sensory lexicon score analysis (五感描写スコアリング)
    let sensoryAnalysis: SensoryAnalysisResult | undefined;
    try {
      sensoryAnalysis = this.sensoryScorer.analyze(syntaxCleanText);
    } catch {}

    // 2. Zero Pronoun Resolution analysis on clean text
    const zeroPronounItems = this.detectZeroPronouns(syntaxCleanText, options?.entities, window);

    // 3. Overall syntactic score computation on clean text
    const sentences = SyntacticLinterRules.splitSentences(syntaxCleanText);
    let totalScore = 0;
    let countedSentences = 0;

    for (const sent of sentences) {
      if (!sent.sentence.trim()) continue;
      const sScore = SyntacticLinterRules.calculateSyntacticScore(sent.sentence, options?.linterOptions);
      totalScore += sScore;
      countedSentences++;
    }

    let avgScore = countedSentences > 0 ? (totalScore / countedSentences) * 100 : 100;
    // Deduct directly for any detected syntactic issues (particle repetitions, double negations, passive, etc.)
    if (syntacticItems.length > 0) {
      avgScore = Math.max(0, avgScore - syntacticItems.length * 8);
    }
    // Deduct for unresolved zero pronouns
    if (zeroPronounItems.length > 0) {
      avgScore = Math.max(0, avgScore - zeroPronounItems.length * 5);
    }
    const finalScore = Math.round(Math.min(100, Math.max(0, avgScore)));

    return {
      syntacticItems,
      zeroPronounItems,
      syntacticScore: finalScore,
      totalWarnings: syntacticItems.length + zeroPronounItems.length,
      analyzedWindow: window,
      sensoryAnalysis,
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
            snippet: s.sentence.trim(),
          });
        }
      }
    }

    return results;
  }

  /**
   * Integrates raw multi-task inference tensor outputs from Narrative-Nano Pro v14
   * into structured literary quality diagnostics and causal DAG events.
   */
  public integrateModelInference(
    baseResult: NarrativeAnalysisResult,
    outputs: ModelMultiTaskOutputs
  ): NarrativeAnalysisResult {
    const { text, seqLen, offsetStart = 0 } = outputs;
    const povItems: PovDiagnosticItem[] = baseResult.povItems ? [...baseResult.povItems] : [];
    const eventActionItems: EventActionItem[] = baseResult.eventActionItems ? [...baseResult.eventActionItems] : [];
    const entitySpanItems: EntitySpanItem[] = baseResult.entitySpanItems ? [...baseResult.entitySpanItems] : [];
    const connectiveItems: ConnectiveRelationItem[] = baseResult.connectiveItems ? [...baseResult.connectiveItems] : [];

    const actionNames: Array<'None' | 'Acquire' | 'Drop' | 'Move' | 'Speak' | 'StateChange'> = [
      'None', 'Acquire', 'Drop', 'Move', 'Speak', 'StateChange'
    ];
    const connNames: Array<'None' | 'Causal' | 'Adversative' | 'Temporal' | 'Additive'> = [
      'None', 'Causal', 'Adversative', 'Temporal', 'Additive'
    ];

    // 1. Process Epistemic POV scores
    if (outputs.epistemic) {
      const epi = outputs.epistemic;
      for (let i = 0; i < Math.min(seqLen, text.length); i++) {
        const score = typeof epi[i] === 'number' ? epi[i] : (epi as any)[i];
        if (score >= 0.6) {
          const charOffset = offsetStart + i;
          const { line, col } = NarrativeLinterEngine.offsetToLineCol(text, charOffset);
          // Look for sentence snippet
          const snippet = NarrativeLinterEngine.extractContextSnippet(text, charOffset, charOffset + 1);
          povItems.push({
            id: `pov-${charOffset}`,
            from: charOffset,
            to: charOffset + 1,
            line,
            col,
            epistemicScore: score,
            message: `強い内面描写・認識POV（スコア: ${(score * 100).toFixed(1)}%）が検出されました。視点の一貫性を確認してください。`,
            snippet,
          });
        }
      }
    }

    // 2. Process Event Action classes
    if (outputs.event_action) {
      const act = outputs.event_action;
      for (let i = 0; i < Math.min(seqLen, text.length); i++) {
        // Find argmax for the 6 action classes at position i
        let maxAct = 0;
        let maxScore = -Infinity;
        for (let c = 0; c < 6; c++) {
          const val = act[i * 6 + c] ?? 0;
          if (val > maxScore) {
            maxScore = val;
            maxAct = c;
          }
        }
        if (maxAct > 0) {
          const charOffset = offsetStart + i;
          eventActionItems.push({
            id: `act-${charOffset}-${maxAct}`,
            from: charOffset,
            to: charOffset + 1,
            actionType: actionNames[maxAct],
            actionId: maxAct,
            text: text[i] || '',
          });
        }
      }
    }

    // 3. Process Entity spans (BIO)
    if (outputs.entity) {
      const ent = outputs.entity;
      let currentEntityStart: number | null = null;
      for (let i = 0; i < Math.min(seqLen, text.length); i++) {
        let maxEnt = 0;
        let maxScore = -Infinity;
        for (let c = 0; c < 4; c++) {
          const val = ent[i * 4 + c] ?? 0;
          if (val > maxScore) {
            maxScore = val;
            maxEnt = c;
          }
        }
        const charOffset = offsetStart + i;
        if (maxEnt === 1) { // B-ENT
          if (currentEntityStart !== null) {
            entitySpanItems.push({
              id: `ent-${currentEntityStart}`,
              from: currentEntityStart,
              to: charOffset,
              text: text.slice(currentEntityStart - offsetStart, i),
              type: 'NamedEntity',
            });
          }
          currentEntityStart = charOffset;
        } else if (maxEnt === 3 && currentEntityStart !== null) { // E-ENT
          entitySpanItems.push({
            id: `ent-${currentEntityStart}`,
            from: currentEntityStart,
            to: charOffset + 1,
            text: text.slice(currentEntityStart - offsetStart, i + 1),
            type: 'NamedEntity',
          });
          currentEntityStart = null;
        } else if (maxEnt === 0 && currentEntityStart !== null) { // O
          entitySpanItems.push({
            id: `ent-${currentEntityStart}`,
            from: currentEntityStart,
            to: charOffset,
            text: text.slice(currentEntityStart - offsetStart, i),
            type: 'NamedEntity',
          });
          currentEntityStart = null;
        }
      }
      if (currentEntityStart !== null) {
        entitySpanItems.push({
          id: `ent-${currentEntityStart}`,
          from: currentEntityStart,
          to: offsetStart + Math.min(seqLen, text.length),
          text: text.slice(currentEntityStart - offsetStart, Math.min(seqLen, text.length)),
          type: 'NamedEntity',
        });
      }
    }

    // 4. Process Discourse Connectives
    if (outputs.connective) {
      const conn = outputs.connective;
      let maxConn = 0;
      let maxScore = -Infinity;
      for (let c = 0; c < 5; c++) {
        const val = conn[c] ?? 0;
        if (val > maxScore) {
          maxScore = val;
          maxConn = c;
        }
      }
      if (maxConn > 0) {
        connectiveItems.push({
          id: `conn-${offsetStart}`,
          from: offsetStart,
          to: offsetStart + Math.min(10, text.length),
          relationType: connNames[maxConn],
          relationId: maxConn,
          text: text.slice(0, 10),
        });
      }
    }

    return {
      ...baseResult,
      povItems,
      eventActionItems,
      entitySpanItems,
      connectiveItems,
      totalWarnings: baseResult.totalWarnings + povItems.length,
    };
  }
}
