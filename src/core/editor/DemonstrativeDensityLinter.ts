/**
 * DemonstrativeDensityLinter - High-performance demonstrative (こそあど言葉) density and proximity duplicate linter.
 *
 * Detects frequent demonstratives ("これ", "それ", "あの", "この", "その", etc.) in paragraphs and consecutive sentences
 * that make the referent ambiguous.
 * Evaluates density scores and checks warning thresholds.
 */

import { AhoCorasickAutomaton } from '../nlp/AhoCorasickAutomaton.js';
import type { SourceToDisplayMap } from './AozoraParser.js';

export const DEFAULT_DEMONSTRATIVES = [
  'これ', 'それ', 'あれ',
  'この', 'その', 'あの',
  'ここ', 'そこ', 'あそこ',
  'こちら', 'そちら', 'あちら',
  'こう', 'そう', 'ああ',
];

export interface DemonstrativeLinterOptions {
  /** Custom set of demonstrative terms (defaults to DEFAULT_DEMONSTRATIVES) */
  demonstratives?: string[];
  /** Maximum allowed count of demonstratives in a single paragraph before warning (default: 3) */
  paragraphCountThreshold?: number;
  /** Maximum allowed character density ratio of demonstratives in a paragraph (default: 0.05 => 5%) */
  paragraphDensityThreshold?: number;
  /** Maximum allowed demonstratives in sliding N consecutive sentences window (default: 2) */
  consecutiveSentenceCountThreshold?: number;
  /** Number of consecutive sentences in sliding window (default: 2) */
  sentenceWindowSize?: number;
}

export interface DemonstrativeMatch {
  term: string;
  start: number;
  end: number;
  paragraphIndex: number;
  sentenceIndex: number;
}

export interface DemonstrativeDiagnostic {
  from: number;
  to: number;
  severity: 'warning' | 'error' | 'info';
  message: string;
  demonstrative: string;
  paragraphIndex: number;
  sentenceIndex: number;
  densityScore: number;
  countInSegment: number;
  triggerReason: 'paragraph_count' | 'paragraph_density' | 'consecutive_sentences';
  suggestions: string[];
}

export interface LintOptions {
  isComposing?: boolean;
  displayMap?: SourceToDisplayMap;
}

export class DemonstrativeDensityLinter {
  private automaton: AhoCorasickAutomaton<string> = new AhoCorasickAutomaton();
  private demonstratives: string[];
  private paragraphCountThreshold: number;
  private paragraphDensityThreshold: number;
  private consecutiveSentenceCountThreshold: number;
  private sentenceWindowSize: number;

  constructor(options?: DemonstrativeLinterOptions) {
    this.demonstratives = options?.demonstratives ?? DEFAULT_DEMONSTRATIVES;
    this.paragraphCountThreshold = options?.paragraphCountThreshold ?? 3;
    this.paragraphDensityThreshold = options?.paragraphDensityThreshold ?? 0.05;
    this.consecutiveSentenceCountThreshold = options?.consecutiveSentenceCountThreshold ?? 2;
    this.sentenceWindowSize = options?.sentenceWindowSize ?? 2;

    this.buildAutomaton();
  }

  public setOptions(options: DemonstrativeLinterOptions): void {
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
    this.buildAutomaton();
  }

  private buildAutomaton(): void {
    this.automaton = new AhoCorasickAutomaton();
    for (const term of this.demonstratives) {
      this.automaton.addPattern(term, term);
    }
    this.automaton.build();
  }

  /**
   * Calculates demonstrative density score for a given text segment.
   * Density score = count of demonstratives / total segment character length.
   */
  public calculateDensityScore(
    text: string,
    matchesCount?: number
  ): { densityScore: number; count: number; totalChars: number } {
    if (!text || text.length === 0) {
      return { densityScore: 0, count: 0, totalChars: 0 };
    }
    const count = matchesCount !== undefined ? matchesCount : this.automaton.search(text).length;
    const densityScore = text.length > 0 ? count / text.length : 0;
    return {
      densityScore,
      count,
      totalChars: text.length,
    };
  }

  /**
   * Lints text for demonstrative density and proximity duplicates.
   */
  public lint(text: string, options?: LintOptions): DemonstrativeDiagnostic[] {
    if (options?.isComposing || !text) {
      return [];
    }

    // 1. Find all demonstrative matches in text using Aho-Corasick
    const rawMatches = this.automaton.search(text);
    if (rawMatches.length === 0) {
      return [];
    }

    rawMatches.sort((a, b) => a.start - b.start);

    // 2. Build paragraph and sentence boundaries
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
      offset += pText.length + 1; // +1 for newline character
    }

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

    // Assign paragraphIndex and sentenceIndex to matches
    const matches: DemonstrativeMatch[] = [];
    for (const m of rawMatches) {
      const p = paragraphBoundaries.find((pb) => m.start >= pb.start && m.start <= pb.end) ?? paragraphBoundaries[0];
      const s = sentenceBoundaries.find((sb) => m.start >= sb.start && m.start < sb.end) ?? { index: 0 };

      matches.push({
        term: m.keyword,
        start: m.start,
        end: m.end,
        paragraphIndex: p.index,
        sentenceIndex: s.index,
      });
    }

    const diagnosticsMap = new Map<string, DemonstrativeDiagnostic>();

    // 3. Evaluate paragraph-level thresholds
    for (const pb of paragraphBoundaries) {
      if (!pb.text || pb.text.trim().length === 0) continue;

      const pMatches = matches.filter((m) => m.paragraphIndex === pb.index);
      const count = pMatches.length;
      const densityScore = pb.text.length > 0 ? count / pb.text.length : 0;

      const isCountViolation = count >= this.paragraphCountThreshold;
      const isDensityViolation = count > 1 && densityScore >= this.paragraphDensityThreshold;

      if (isCountViolation || isDensityViolation) {
        const reason: 'paragraph_count' | 'paragraph_density' = isCountViolation
          ? 'paragraph_count'
          : 'paragraph_density';

        for (const match of pMatches) {
          let from = match.start;
          let to = match.end;

          if (options?.displayMap) {
            from = options.displayMap.toDisplayOffset(from);
            to = options.displayMap.toDisplayOffset(to);
          }

          const key = `${from}-${to}`;
          diagnosticsMap.set(key, {
            from,
            to,
            severity: 'warning',
            message: `【指示語連続・高密度】段落内で指示語（「${match.term}」等）が近接・頻出しています（出現数: ${count}回, 密度: ${(densityScore * 100).toFixed(1)}%）。指示対象を具体詞に置き換えることを検討してください。`,
            demonstrative: match.term,
            paragraphIndex: match.paragraphIndex,
            sentenceIndex: match.sentenceIndex,
            densityScore: Number(densityScore.toFixed(4)),
            countInSegment: count,
            triggerReason: reason,
            suggestions: [
              `「${match.term}」を具体的名詞・固有名称に置き換える`,
              '文構造を整理して指示対象の曖昧さを解消する',
            ],
          });
        }
      }
    }

    // 4. Evaluate sliding window of consecutive sentences
    if (sentenceBoundaries.length > 0) {
      for (let i = 0; i <= sentenceBoundaries.length - this.sentenceWindowSize; i++) {
        const windowSentences = sentenceBoundaries.slice(i, i + this.sentenceWindowSize);
        const windowSentenceIndices = new Set(windowSentences.map((s) => s.index));
        const windowMatches = matches.filter((m) => windowSentenceIndices.has(m.sentenceIndex));

        if (windowMatches.length >= this.consecutiveSentenceCountThreshold) {
          const windowText = windowSentences.map((s) => s.text).join('');
          const windowDensity = windowText.length > 0 ? windowMatches.length / windowText.length : 0;

          for (const match of windowMatches) {
            let from = match.start;
            let to = match.end;

            if (options?.displayMap) {
              from = options.displayMap.toDisplayOffset(from);
              to = options.displayMap.toDisplayOffset(to);
            }

            const key = `${from}-${to}`;
            if (!diagnosticsMap.has(key)) {
              diagnosticsMap.set(key, {
                from,
                to,
                severity: 'warning',
                message: `【指示語近接重複】連続する文のなかで「${match.term}」等の指示語が近接して連続使用されています（近接出現数: ${windowMatches.length}回）。文章の明瞭性を高めるため具体的な語句への書き換えを推奨します。`,
                demonstrative: match.term,
                paragraphIndex: match.paragraphIndex,
                sentenceIndex: match.sentenceIndex,
                densityScore: Number(windowDensity.toFixed(4)),
                countInSegment: windowMatches.length,
                triggerReason: 'consecutive_sentences',
                suggestions: [
                  `「${match.term}」を名詞・主語として明確に指定する`,
                  '連続する指示語のいずれかを削除または再構成する',
                ],
              });
            }
          }
        }
      }
    }

    return Array.from(diagnosticsMap.values()).sort((a, b) => a.from - b.from);
  }
}
