/**
 * DemonstrativeOveruseDetector - High-performance demonstrative (こそあど言葉) overuse and proximity duplicate linter.
 *
 * Detects frequent or repetitive demonstratives ("これ", "力はそれ", "あれ", "この", "その", "あの", "ここ", "そこ", "あそこ", etc.)
 * in proximate context (same paragraph or within 2 preceding sentences).
 * Generates warning diagnostics with exact position, target term, penalty scores, and suggestions to rephrase into concrete nouns.
 */

import { AhoCorasickAutomaton } from '../nlp/AhoCorasickAutomaton.js';
import type { SourceToDisplayMap } from './AozoraParser.js';

export const DEFAULT_DEMONSTRATIVE_TERMS: string[] = [
  'これ', 'それ', 'あれ', 'どれ',
  'この', 'その', 'あの', 'どの',
  'ここ', 'そこ', 'あそこ', 'どこ',
  'こちら', 'そちら', 'あちら', 'どちら',
  'こう', 'そう', 'ああ', 'どう',
];

export interface DemonstrativeOveruseOptions {
  /** Custom list of demonstrative terms (defaults to DEFAULT_DEMONSTRATIVE_TERMS) */
  demonstratives?: string[];
  /** Max count of demonstratives allowed in a single paragraph before warning (default: 3) */
  paragraphCountThreshold?: number;
  /** Max character density ratio of demonstratives in a paragraph (default: 0.05 => 5%) */
  paragraphDensityThreshold?: number;
  /** Max demonstratives allowed in sliding proximate sentences window (default: 2) */
  consecutiveSentenceCountThreshold?: number;
  /** Size of sliding sentence context window (default: 3 sentences = current + up to 2 preceding sentences) */
  sentenceWindowSize?: number;
  /** Base penalty score for paragraph overuse (default: 15) */
  paragraphPenaltyBase?: number;
  /** Base penalty score for sentence proximity overuse (default: 10) */
  proximityPenaltyBase?: number;
  /** Bonus penalty score when the exact same demonstrative term is repeated in proximate context (default: 20) */
  sameTermPenaltyBonus?: number;
}

export type OveruseTriggerReason = 'paragraph_overuse' | 'sentence_proximity' | 'same_term_repetition';

export interface DemonstrativeOveruseDiagnostic {
  from: number;
  to: number;
  line?: number;
  col?: number;
  severity: 'warning' | 'error' | 'info';
  message: string;
  demonstrative: string;
  penaltyScore: number;
  paragraphIndex: number;
  sentenceIndex: number;
  countInSegment: number;
  triggerReason: OveruseTriggerReason;
  suggestions: string[];
}

export interface DetectOptions {
  isComposing?: boolean;
  displayMap?: SourceToDisplayMap;
}

export interface DemonstrativeMatchInternal {
  term: string;
  start: number;
  end: number;
  paragraphIndex: number;
  sentenceIndex: number;
}

export class DemonstrativeOveruseDetector {
  private automaton: AhoCorasickAutomaton<string> = new AhoCorasickAutomaton();
  private demonstratives: string[];
  private paragraphCountThreshold: number;
  private paragraphDensityThreshold: number;
  private consecutiveSentenceCountThreshold: number;
  private sentenceWindowSize: number;
  private paragraphPenaltyBase: number;
  private proximityPenaltyBase: number;
  private sameTermPenaltyBonus: number;

  constructor(options?: DemonstrativeOveruseOptions) {
    this.demonstratives = options?.demonstratives ?? DEFAULT_DEMONSTRATIVE_TERMS;
    this.paragraphCountThreshold = options?.paragraphCountThreshold ?? 3;
    this.paragraphDensityThreshold = options?.paragraphDensityThreshold ?? 0.05;
    this.consecutiveSentenceCountThreshold = options?.consecutiveSentenceCountThreshold ?? 2;
    this.sentenceWindowSize = options?.sentenceWindowSize ?? 3; // 3 sentences = current + 2 preceding sentences
    this.paragraphPenaltyBase = options?.paragraphPenaltyBase ?? 15;
    this.proximityPenaltyBase = options?.proximityPenaltyBase ?? 10;
    this.sameTermPenaltyBonus = options?.sameTermPenaltyBonus ?? 20;

    this.buildAutomaton();
  }

  /**
   * Updates detector options dynamically.
   */
  public setOptions(options: DemonstrativeOveruseOptions): void {
    if (options.demonstratives !== undefined) {
      this.demonstratives = options.demonstratives;
    }
    if (options.paragraphCountThreshold !== undefined) {
      this.paragraphCountThreshold = options.paragraphCountThreshold;
    }
    if (options.paragraphDensityThreshold !== undefined) {
      this.paragraphDensityThreshold = options.paragraphDensityThreshold;
    }
    if (options.consecutiveSentenceCountThreshold !== undefined) {
      this.consecutiveSentenceCountThreshold = options.consecutiveSentenceCountThreshold;
    }
    if (options.sentenceWindowSize !== undefined) {
      this.sentenceWindowSize = options.sentenceWindowSize;
    }
    if (options.paragraphPenaltyBase !== undefined) {
      this.paragraphPenaltyBase = options.paragraphPenaltyBase;
    }
    if (options.proximityPenaltyBase !== undefined) {
      this.proximityPenaltyBase = options.proximityPenaltyBase;
    }
    if (options.sameTermPenaltyBonus !== undefined) {
      this.sameTermPenaltyBonus = options.sameTermPenaltyBonus;
    }

    this.buildAutomaton();
  }

  /**
   * Returns copy of active options.
   */
  public getOptions(): Required<DemonstrativeOveruseOptions> {
    return {
      demonstratives: [...this.demonstratives],
      paragraphCountThreshold: this.paragraphCountThreshold,
      paragraphDensityThreshold: this.paragraphDensityThreshold,
      consecutiveSentenceCountThreshold: this.consecutiveSentenceCountThreshold,
      sentenceWindowSize: this.sentenceWindowSize,
      paragraphPenaltyBase: this.paragraphPenaltyBase,
      proximityPenaltyBase: this.proximityPenaltyBase,
      sameTermPenaltyBonus: this.sameTermPenaltyBonus,
    };
  }

  private buildAutomaton(): void {
    this.automaton = new AhoCorasickAutomaton();
    for (const term of this.demonstratives) {
      this.automaton.addPattern(term, term);
    }
    this.automaton.build();
  }

  /**
   * Filter out sub-matches where a shorter match is enclosed within a longer match (e.g., "そこ" inside "あそこ").
   */
  private filterOverlappingMatches<M extends { start: number; end: number; keyword?: string }>(matches: M[]): M[] {
    const sorted = [...matches].sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);
    const kept: M[] = [];

    for (const match of sorted) {
      const isSubMatch = kept.some((k) => match.start >= k.start && match.end <= k.end);
      if (!isSubMatch) {
        kept.push(match);
      }
    }

    return kept.sort((a, b) => a.start - b.start);
  }

  /**
   * Helper to convert 0-indexed character offset into 1-indexed line and col.
   */
  private offsetToLineCol(text: string, offset: number): { line: number; col: number } {
    const clamped = Math.max(0, Math.min(offset, text.length));
    const lines = text.slice(0, clamped).split('\n');
    const line = lines.length;
    const col = lines[lines.length - 1].length + 1;
    return { line, col };
  }

  /**
   * Extracts raw matches of demonstrative terms using fast Aho-Corasick automaton scan.
   * Excludes nested sub-term matches (e.g., "そこ" inside "あそこ").
   */
  public extractDemonstratives(text: string): Array<{ keyword: string; start: number; end: number }> {
    if (!text) return [];
    const rawMatches = this.automaton.search(text);
    return this.filterOverlappingMatches(rawMatches);
  }

  /**
   * Primary detection method to analyze demonstrative overuse in proximate context.
   */
  public detect(text: string, options?: DetectOptions): DemonstrativeOveruseDiagnostic[] {
    if (options?.isComposing || !text) {
      return [];
    }

    const rawMatches = this.extractDemonstratives(text);
    if (rawMatches.length === 0) {
      return [];
    }

    // 1. Build Paragraph Boundaries
    const paragraphBoundaries: Array<{ index: number; start: number; end: number; text: string }> = [];
    const paragraphs = text.split('\n');
    let offset = 0;
    for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
      const pText = paragraphs[pIdx];
      paragraphBoundaries.push({
        index: pIdx,
        start: offset,
        end: offset + pText.length,
        text: pText,
      });
      offset += pText.length + 1;
    }

    // 2. Build Sentence Boundaries
    const sentenceBoundaries: Array<{
      index: number;
      paragraphIndex: number;
      start: number;
      end: number;
      text: string;
    }> = [];

    let sIdx = 0;
    for (const p of paragraphBoundaries) {
      if (p.text.length === 0) continue;
      let sentenceStart = p.start;
      for (let i = 0; i < p.text.length; i++) {
        const char = p.text[i];
        const isDelimiter = char === '。' || char === '！' || char === '？' || char === '!' || char === '?';
        const isEnd = i === p.text.length - 1;
        if (isDelimiter || isEnd) {
          const sentenceEnd = p.start + i + 1;
          const sText = text.substring(sentenceStart, sentenceEnd);
          sentenceBoundaries.push({
            index: sIdx++,
            paragraphIndex: p.index,
            start: sentenceStart,
            end: sentenceEnd,
            text: sText,
          });
          sentenceStart = sentenceEnd;
        }
      }
    }

    // 3. Map Matches to Paragraph & Sentence Indices
    const matches: DemonstrativeMatchInternal[] = [];
    for (const m of rawMatches) {
      const p = paragraphBoundaries.find((pb) => m.start >= pb.start && m.start <= pb.end) ?? paragraphBoundaries[0];
      const s = sentenceBoundaries.find((sb) => m.start >= sb.start && m.start < sb.end) ?? { index: 0, paragraphIndex: p.index };

      matches.push({
        term: m.keyword,
        start: m.start,
        end: m.end,
        paragraphIndex: p.index,
        sentenceIndex: s.index,
      });
    }

    const diagnosticsMap = new Map<string, DemonstrativeOveruseDiagnostic>();

    // 4. Paragraph Overuse Detection
    for (const pb of paragraphBoundaries) {
      if (!pb.text || pb.text.trim().length === 0) continue;

      const pMatches = matches.filter((m) => m.paragraphIndex === pb.index);
      const count = pMatches.length;
      const densityScore = pb.text.length > 0 ? count / pb.text.length : 0;

      const isCountViolation = count >= this.paragraphCountThreshold;
      const isDensityViolation = count > 1 && densityScore >= this.paragraphDensityThreshold;

      if (isCountViolation || isDensityViolation) {
        const termCounts = new Map<string, number>();
        for (const m of pMatches) {
          termCounts.set(m.term, (termCounts.get(m.term) ?? 0) + 1);
        }

        for (const match of pMatches) {
          const sameTermCount = termCounts.get(match.term) ?? 1;
          const isSameTermRepeated = sameTermCount > 1;

          let triggerReason: OveruseTriggerReason = 'paragraph_overuse';
          if (isSameTermRepeated) {
            triggerReason = 'same_term_repetition';
          }

          const extraCount = Math.max(0, count - this.paragraphCountThreshold + 1);
          let penaltyScore = this.paragraphPenaltyBase + extraCount * 5;
          if (isSameTermRepeated) {
            penaltyScore += this.sameTermPenaltyBonus;
          }

          let from = match.start;
          let to = match.end;

          if (options?.displayMap) {
            from = options.displayMap.toDisplayOffset(from);
            to = options.displayMap.toDisplayOffset(to);
          }

          const { line, col } = this.offsetToLineCol(text, match.start);
          const key = `${from}-${to}`;

          diagnosticsMap.set(key, {
            from,
            to,
            line,
            col,
            severity: 'warning',
            message: `【指示語連多用警告】同一段落内で指示語「${match.term}」が多用されています（出現数: ${count}回, 密度: ${(densityScore * 100).toFixed(1)}%）。指し示す対象を具体名詞（人物名・事物名）に置き換えることを推奨します。`,
            demonstrative: match.term,
            penaltyScore: Math.round(penaltyScore),
            paragraphIndex: match.paragraphIndex,
            sentenceIndex: match.sentenceIndex,
            countInSegment: count,
            triggerReason,
            suggestions: [
              `「${match.term}」を具体的名詞・固有名称に言い換える`,
              '指示対象（主語・目的語）を明示して文章を分かりやすくする',
            ],
          });
        }
      }
    }

    // 5. Proximity / Sliding Sentence Window Detection (直前2文以内 context)
    if (sentenceBoundaries.length > 0) {
      for (let i = 0; i <= sentenceBoundaries.length - 1; i++) {
        const windowStartIdx = Math.max(0, i - (this.sentenceWindowSize - 1));
        const windowSentences = sentenceBoundaries.slice(windowStartIdx, i + 1);
        const windowSentenceIndices = new Set(windowSentences.map((s) => s.index));
        const windowMatches = matches.filter((m) => windowSentenceIndices.has(m.sentenceIndex));

        if (windowMatches.length >= this.consecutiveSentenceCountThreshold) {
          const windowTermCounts = new Map<string, number>();
          for (const wm of windowMatches) {
            windowTermCounts.set(wm.term, (windowTermCounts.get(wm.term) ?? 0) + 1);
          }

          for (const match of windowMatches) {
            const sameTermInWindow = (windowTermCounts.get(match.term) ?? 0) > 1;

            let triggerReason: OveruseTriggerReason = 'sentence_proximity';
            if (sameTermInWindow) {
              triggerReason = 'same_term_repetition';
            }

            const extraMatches = Math.max(0, windowMatches.length - this.consecutiveSentenceCountThreshold + 1);
            let penaltyScore = this.proximityPenaltyBase + extraMatches * 5;
            if (sameTermInWindow) {
              penaltyScore += this.sameTermPenaltyBonus;
            }

            let from = match.start;
            let to = match.end;

            if (options?.displayMap) {
              from = options.displayMap.toDisplayOffset(from);
              to = options.displayMap.toDisplayOffset(to);
            }

            const key = `${from}-${to}`;
            const existing = diagnosticsMap.get(key);

            if (!existing) {
              const { line, col } = this.offsetToLineCol(text, match.start);
              diagnosticsMap.set(key, {
                from,
                to,
                line,
                col,
                severity: 'warning',
                message: `【指示語近接多用】直前2文以内の近接文脈で「${match.term}」等の指示語が連続して使用されています（近接出現数: ${windowMatches.length}回）。具体名詞に言い換えて指示対象の曖昧さを解消してください。`,
                demonstrative: match.term,
                penaltyScore: Math.round(penaltyScore),
                paragraphIndex: match.paragraphIndex,
                sentenceIndex: match.sentenceIndex,
                countInSegment: windowMatches.length,
                triggerReason,
                suggestions: [
                  `「${match.term}」を具体名詞・固有名詞に変更する`,
                  '近接する指示語のいずれかを削除または主語を復元する',
                ],
              });
            } else {
              // Update existing diagnostic with elevated penalty score or same term trigger
              if (penaltyScore > existing.penaltyScore) {
                existing.penaltyScore = Math.round(penaltyScore);
              }
              if (triggerReason === 'same_term_repetition') {
                existing.triggerReason = 'same_term_repetition';
              }
            }
          }
        }
      }
    }

    return Array.from(diagnosticsMap.values()).sort((a, b) => a.from - b.from);
  }

  /**
   * Alias for detect method for linter interface consistency.
   */
  public lint(text: string, options?: DetectOptions): DemonstrativeOveruseDiagnostic[] {
    return this.detect(text, options);
  }

  /**
   * Calculates total penalty score across all detected overuse issues in text.
   */
  public calculateOverusePenaltyScore(text: string, options?: DetectOptions): number {
    const diagnostics = this.detect(text, options);
    return diagnostics.reduce((sum, diag) => sum + diag.penaltyScore, 0);
  }
}
