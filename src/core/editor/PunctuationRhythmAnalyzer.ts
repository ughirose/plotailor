/**
 * PunctuationRhythmAnalyzer - Japanese manuscript punctuation (読点) frequency
 * and sentence length balance analyzer.
 *
 * Requirements:
 * 1. Statistical analysis of 読点 (「、」) count per sentence and sentence character lengths.
 * 2. Automatic detection of:
 *    - Long sentences exceeding 80 characters (1文80文字超の長文)
 *    - Dense punctuation with 4 or more 読点 (読点が4個以上の過密文)
 *    - Sparse punctuation with 40 or more characters without 読点 (40文字以上読点がない過疎文)
 * 3. Text rhythm health score calculation (0 - 100 points) and correction recommendations with position offsets.
 * 4. IME composition protection (isComposing) to prevent editor jitter during typing.
 */

import type { SourceToDisplayMap } from './AozoraParser.js';

export type PunctuationIssueType = 'long_sentence' | 'dense_punctuation' | 'sparse_punctuation';

export interface PunctuationRhythmIssue {
  type: PunctuationIssueType;
  severity: 'warning' | 'error' | 'info';
  from: number;
  to: number;
  sentenceIndex: number;
  sentenceText: string;
  charCount: number;
  commaCount: number;
  message: string;
  suggestions: string[];
}

export interface SentenceStats {
  index: number;
  from: number;
  to: number;
  text: string;
  charCount: number;
  commaCount: number;
  maxSpanWithoutComma: number;
}

export interface PunctuationRhythmStats {
  totalSentences: number;
  totalChars: number;
  totalCommas: number;
  avgSentenceLength: number;
  avgCommasPerSentence: number;
  maxSentenceLength: number;
  minSentenceLength: number;
  longSentenceCount: number;
  densePunctuationCount: number;
  sparsePunctuationCount: number;
}

export interface PunctuationRhythmResult {
  score: number;
  stats: PunctuationRhythmStats;
  sentences: SentenceStats[];
  issues: PunctuationRhythmIssue[];
}

export interface PunctuationRhythmOptions {
  /** Maximum allowed sentence character length before warning (default: 80) */
  maxSentenceLengthThreshold?: number;
  /** Maximum allowed 読点 count per sentence before warning (default: 4) */
  maxCommaCountThreshold?: number;
  /** Minimum character span without 読点 before warning (default: 40) */
  sparseCommaLengthThreshold?: number;
  /** IME composition flag - skips analysis when true */
  isComposing?: boolean;
  /** Source-to-display offset map */
  displayMap?: SourceToDisplayMap;
}

export class PunctuationRhythmAnalyzer {
  private maxSentenceLengthThreshold: number;
  private maxCommaCountThreshold: number;
  private sparseCommaLengthThreshold: number;

  constructor(options?: PunctuationRhythmOptions) {
    this.maxSentenceLengthThreshold = options?.maxSentenceLengthThreshold ?? 80;
    this.maxCommaCountThreshold = options?.maxCommaCountThreshold ?? 4;
    this.sparseCommaLengthThreshold = options?.sparseCommaLengthThreshold ?? 40;
  }

  /**
   * Updates configuration options.
   */
  public setOptions(options: PunctuationRhythmOptions): void {
    if (options.maxSentenceLengthThreshold !== undefined) {
      this.maxSentenceLengthThreshold = options.maxSentenceLengthThreshold;
    }
    if (options.maxCommaCountThreshold !== undefined) {
      this.maxCommaCountThreshold = options.maxCommaCountThreshold;
    }
    if (options.sparseCommaLengthThreshold !== undefined) {
      this.sparseCommaLengthThreshold = options.sparseCommaLengthThreshold;
    }
  }

  /**
   * Analyzes the given text for punctuation rhythm, sentence statistics, issues, and score.
   */
  public analyze(text: string, options?: PunctuationRhythmOptions): PunctuationRhythmResult {
    const isComposing = options?.isComposing ?? false;
    const displayMap = options?.displayMap ?? options?.displayMap;

    if (isComposing || !text || text.trim().length === 0) {
      return this.createEmptyResult();
    }

    const maxLenThreshold = options?.maxSentenceLengthThreshold ?? this.maxSentenceLengthThreshold;
    const maxCommaThreshold = options?.maxCommaCountThreshold ?? this.maxCommaCountThreshold;
    const sparseThreshold = options?.sparseCommaLengthThreshold ?? this.sparseCommaLengthThreshold;

    // Split text into sentence structures while maintaining exact document character offsets
    const sentenceRegex = /[^。！？!?\n]+[。！？!?\n]?|\n/g;
    let match: RegExpExecArray | null;

    const sentences: SentenceStats[] = [];
    let sentenceIndex = 0;

    while ((match = sentenceRegex.exec(text)) !== null) {
      const sentenceText = match[0];
      if (!sentenceText || sentenceText === '\n' || sentenceText.trim().length === 0) {
        continue;
      }

      const rawFrom = match.index;
      const rawTo = match.index + sentenceText.length;

      let from = rawFrom;
      let to = rawTo;
      if (displayMap) {
        from = displayMap.toDisplayOffset(rawFrom);
        to = displayMap.toDisplayOffset(rawTo);
      }

      // Count 読点 (「、」)
      const commas = sentenceText.match(/、/g);
      const commaCount = commas ? commas.length : 0;

      // Calculate max character span without 読点 in this sentence
      const segments = sentenceText.split('、');
      let maxSpanWithoutComma = 0;
      for (const seg of segments) {
        if (seg.length > maxSpanWithoutComma) {
          maxSpanWithoutComma = seg.length;
        }
      }

      sentences.push({
        index: sentenceIndex++,
        from,
        to,
        text: sentenceText,
        charCount: sentenceText.length,
        commaCount,
        maxSpanWithoutComma,
      });
    }

    if (sentences.length === 0) {
      return this.createEmptyResult();
    }

    // Detect issues
    const issues: PunctuationRhythmIssue[] = [];

    for (const s of sentences) {
      // 1. Long sentence detection (> 80 chars by default)
      if (s.charCount > maxLenThreshold) {
        issues.push({
          type: 'long_sentence',
          severity: 'warning',
          from: s.from,
          to: s.to,
          sentenceIndex: s.index,
          sentenceText: s.text,
          charCount: s.charCount,
          commaCount: s.commaCount,
          message: `【長文過多】1文の文字数が${s.charCount}文字であり、推奨値（${maxLenThreshold}文字以下）を超えています。適切な位置で文を分割してください。`,
          suggestions: [
            '接続詞や「〜が」「〜ので」で文を2つ以上に分割する',
            '修飾語句を整理して短く簡潔な文にする',
          ],
        });
      }

      // 2. Dense punctuation detection (>= 4 commas by default)
      if (s.commaCount >= maxCommaThreshold) {
        issues.push({
          type: 'dense_punctuation',
          severity: 'warning',
          from: s.from,
          to: s.to,
          sentenceIndex: s.index,
          sentenceText: s.text,
          charCount: s.charCount,
          commaCount: s.commaCount,
          message: `【読点過密】1文の中に読点（、）が${s.commaCount}個使用されており、過密状態です（推奨上限: ${maxCommaThreshold - 1}個）。文章を分割するか不要な読点を削ってください。`,
          suggestions: [
            '1つの文に複数の述語が並んでいる場合は、文を分ける',
            '過剰な読点を削除してテンポを整える',
          ],
        });
      }

      // 3. Sparse punctuation detection (>= 40 chars without comma)
      if (s.maxSpanWithoutComma >= sparseThreshold) {
        issues.push({
          type: 'sparse_punctuation',
          severity: 'info',
          from: s.from,
          to: s.to,
          sentenceIndex: s.index,
          sentenceText: s.text,
          charCount: s.charCount,
          commaCount: s.commaCount,
          message: `【読点過疎】読点（、）がない区間が${s.maxSpanWithoutComma}文字続いています（推奨: ${sparseThreshold}文字未満で息継ぎの読点を配置）。読点を補うか息継ぎポイントを調整してください。`,
          suggestions: [
            '主語の後や節の区切りに適度に読点（、）を挿入する',
            '長い修飾節の直後に読点を置いて視認性を高める',
          ],
        });
      }
    }

    // Compute aggregate statistics
    const totalSentences = sentences.length;
    const totalChars = sentences.reduce((sum, s) => sum + s.charCount, 0);
    const totalCommas = sentences.reduce((sum, s) => sum + s.commaCount, 0);

    const avgSentenceLength = Number((totalChars / totalSentences).toFixed(1));
    const avgCommasPerSentence = Number((totalCommas / totalSentences).toFixed(2));

    const maxSentenceLength = Math.max(...sentences.map((s) => s.charCount));
    const minSentenceLength = Math.min(...sentences.map((s) => s.charCount));

    const longSentenceCount = issues.filter((i) => i.type === 'long_sentence').length;
    const densePunctuationCount = issues.filter((i) => i.type === 'dense_punctuation').length;
    const sparsePunctuationCount = issues.filter((i) => i.type === 'sparse_punctuation').length;

    const stats: PunctuationRhythmStats = {
      totalSentences,
      totalChars,
      totalCommas,
      avgSentenceLength,
      avgCommasPerSentence,
      maxSentenceLength,
      minSentenceLength,
      longSentenceCount,
      densePunctuationCount,
      sparsePunctuationCount,
    };

    // Calculate rhythm health score (0 - 100)
    const score = this.calculateHealthScore(stats, issues);

    return {
      score,
      stats,
      sentences,
      issues,
    };
  }

  /**
   * Calculates overall text rhythm health score on a 0-100 scale.
   */
  private calculateHealthScore(stats: PunctuationRhythmStats, issues: PunctuationRhythmIssue[]): number {
    let score = 100;

    // Deduct points based on issues
    for (const issue of issues) {
      if (issue.type === 'long_sentence') {
        score -= 15;
      } else if (issue.type === 'dense_punctuation') {
        score -= 10;
      } else if (issue.type === 'sparse_punctuation') {
        score -= 8;
      }
    }

    // Additional penalty if average sentence length is too long (> 60 chars) or extremely short (< 15 chars)
    if (stats.avgSentenceLength > 60) {
      score -= Math.min(15, Math.round((stats.avgSentenceLength - 60) * 0.5));
    }

    // Deduct if average comma density is unbalanced (> 2.5 per sentence)
    if (stats.avgCommasPerSentence > 2.5) {
      score -= Math.min(10, Math.round((stats.avgCommasPerSentence - 2.5) * 5));
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Returns empty result structure for blank inputs or IME composition states.
   */
  private createEmptyResult(): PunctuationRhythmResult {
    return {
      score: 100,
      stats: {
        totalSentences: 0,
        totalChars: 0,
        totalCommas: 0,
        avgSentenceLength: 0,
        avgCommasPerSentence: 0,
        maxSentenceLength: 0,
        minSentenceLength: 0,
        longSentenceCount: 0,
        densePunctuationCount: 0,
        sparsePunctuationCount: 0,
      },
      sentences: [],
      issues: [],
    };
  }
}
