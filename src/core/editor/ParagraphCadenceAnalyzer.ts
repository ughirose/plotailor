/**
 * ParagraphCadenceAnalyzer - Paragraph Character Count Rhythm & Heatmap Generator
 *
 * Analyzes manuscript paragraph character counts, line counts, and moving average tempo waves.
 * Identifies cadence patterns including:
 * - Black Walls (黒い壁): Overly long paragraphs exceeding 300 characters
 * - Empty Line Paragraphs (1行空き段落): Blank lines creating visual pacing pauses
 * - Short Contrast Paragraphs (短い対比段落): Punchy, short paragraphs that contrast with surrounding narrative
 *
 * Generates UI visual heatmap data (color depth codes, depth intensity 0..1)
 * and a overall Rhythm Health Score (0..100) with diagnostic pacing advice.
 */

export type ParagraphPatternType =
  | 'black_wall'      // 黒い壁: > 300 characters
  | 'empty_line'      // 1行空き: 0 characters / blank
  | 'short_contrast'  // 短い対比段落: short descriptive paragraph (<= 25 chars) after/near longer paragraphs
  | 'dialogue'        // 会話文: Dialogue quotation
  | 'normal';         // 通常段落

export interface CadenceAdvice {
  level: 'info' | 'warning' | 'error';
  message: string;
  paragraphIndex?: number;
}

export interface ParagraphCadenceItem {
  index: number;
  rawText: string;
  cleanedText: string;
  charCount: number;
  lineCount: number;
  isDialogue: boolean;
  isEmpty: boolean;
  pattern: ParagraphPatternType;
  movingAverage: number;
  /** Color depth intensity scale 0.0 (blank) to 1.0 (black wall) */
  depthIntensity: number;
  /** Hex color code for UI heatmap visualization */
  colorDepthCode: string;
}

export interface ParagraphCadenceAnalysis {
  paragraphs: ParagraphCadenceItem[];
  charCounts: number[];
  lineCounts: number[];
  movingAverages: number[];
  totalParagraphs: number;
  totalChars: number;
  totalLines: number;
  averageCharCount: number;
  blackWallCount: number;
  emptyLineCount: number;
  shortContrastCount: number;
  dialogueCount: number;
  /** Rhythm Health Score (0 - 100) */
  rhythmHealthScore: number;
  /** Pacing and rhythm diagnostics advice */
  advice: CadenceAdvice[];
}

export interface AnalyzerOptions {
  /** Moving average window size (default: 3) */
  movingAverageWindow?: number;
  /** Character threshold for black wall (黒い壁) pattern (default: 300) */
  blackWallThreshold?: number;
  /** Upper character threshold for short contrast paragraph (default: 25) */
  shortContrastThreshold?: number;
  /** Assumed characters per line for vertical manuscript layout line count estimation (default: 40) */
  charsPerLine?: number;
}

export class ParagraphCadenceAnalyzer {
  public static readonly DEFAULT_BLACK_WALL_THRESHOLD = 300;
  public static readonly DEFAULT_SHORT_CONTRAST_THRESHOLD = 25;
  public static readonly DEFAULT_MOVING_AVERAGE_WINDOW = 3;
  public static readonly DEFAULT_CHARS_PER_LINE = 40;

  private movingAverageWindow: number;
  private blackWallThreshold: number;
  private shortContrastThreshold: number;
  private charsPerLine: number;

  constructor(options?: AnalyzerOptions) {
    this.movingAverageWindow = options?.movingAverageWindow ?? ParagraphCadenceAnalyzer.DEFAULT_MOVING_AVERAGE_WINDOW;
    this.blackWallThreshold = options?.blackWallThreshold ?? ParagraphCadenceAnalyzer.DEFAULT_BLACK_WALL_THRESHOLD;
    this.shortContrastThreshold = options?.shortContrastThreshold ?? ParagraphCadenceAnalyzer.DEFAULT_SHORT_CONTRAST_THRESHOLD;
    this.charsPerLine = options?.charsPerLine ?? ParagraphCadenceAnalyzer.DEFAULT_CHARS_PER_LINE;
  }

  /**
   * Strips Aozora Bunko ruby annotations and command tags.
   */
  public static stripAozoraMarkup(text: string): string {
    if (!text) return '';
    return text
      .replace(/｜([^《\r\n]+)《[^》\r\n]+》/g, '$1')
      .replace(/([\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]+)《[^》\r\n]+》/g, '$1')
      .replace(/《《([^》\r\n]+)》》/g, '$1')
      .replace(/［＃[^］\r\n]+］/g, '')
      .replace(/〔[^〕\r\n]+〕/g, '');
  }

  /**
   * Analyzes text paragraphs and generates cadence, tempo wave, heatmap, and rhythm health score.
   */
  public analyze(rawText: string, options?: AnalyzerOptions): ParagraphCadenceAnalysis {
    const windowSize = options?.movingAverageWindow ?? this.movingAverageWindow;
    const wallThreshold = options?.blackWallThreshold ?? this.blackWallThreshold;
    const shortThreshold = options?.shortContrastThreshold ?? this.shortContrastThreshold;
    const charsPerLine = options?.charsPerLine ?? this.charsPerLine;

    if (!rawText || rawText.length === 0) {
      return {
        paragraphs: [],
        charCounts: [],
        lineCounts: [],
        movingAverages: [],
        totalParagraphs: 0,
        totalChars: 0,
        totalLines: 0,
        averageCharCount: 0,
        blackWallCount: 0,
        emptyLineCount: 0,
        shortContrastCount: 0,
        dialogueCount: 0,
        rhythmHealthScore: 100,
        advice: [{ level: 'info', message: '本文が入力されていません。' }],
      };
    }

    // Split text into lines/paragraphs by newlines
    const rawLines = rawText.split('\n');
    const cleanedLines = rawLines.map((line) => ParagraphCadenceAnalyzer.stripAozoraMarkup(line));

    const charCounts: number[] = cleanedLines.map((line) => line.trim().length);

    // Calculate line counts (wrapped lines or newline count)
    const lineCounts: number[] = charCounts.map((count) => {
      if (count === 0) return 1;
      return Math.max(1, Math.ceil(count / charsPerLine));
    });

    // Calculate moving averages
    const movingAverages = this.calculateMovingAverages(charCounts, windowSize);

    // Analyze individual paragraphs
    let blackWallCount = 0;
    let emptyLineCount = 0;
    let shortContrastCount = 0;
    let dialogueCount = 0;

    const paragraphs: ParagraphCadenceItem[] = [];

    for (let i = 0; i < rawLines.length; i++) {
      const raw = rawLines[i];
      const cleaned = cleanedLines[i];
      const count = charCounts[i];
      const lineCount = lineCounts[i];
      const trimmed = cleaned.trim();

      const isEmpty = count === 0;
      const isDialogue = !isEmpty && (trimmed.startsWith('「') || trimmed.startsWith('『'));

      // Determine pattern type
      let pattern: ParagraphPatternType = 'normal';

      if (isEmpty) {
        pattern = 'empty_line';
        emptyLineCount++;
      } else if (count > wallThreshold) {
        pattern = 'black_wall';
        blackWallCount++;
      } else if (isDialogue) {
        pattern = 'dialogue';
        dialogueCount++;
      } else {
        // Short contrast paragraph check: short description paragraph (<= shortThreshold)
        // especially when adjacent to longer paragraphs or moving average is higher
        const prevCount = i > 0 ? charCounts[i - 1] : 0;
        const nextCount = i < charCounts.length - 1 ? charCounts[i + 1] : 0;
        const isContrast = count <= shortThreshold && (prevCount > shortThreshold * 2 || nextCount > shortThreshold * 2 || movingAverages[i] > shortThreshold * 2);

        if (isContrast) {
          pattern = 'short_contrast';
          shortContrastCount++;
        }
      }

      // Heatmap Color Depth Intensity (0.0 to 1.0)
      const depthIntensity = this.calculateDepthIntensity(count, wallThreshold);
      const colorDepthCode = this.getColorDepthCode(depthIntensity, pattern);

      paragraphs.push({
        index: i,
        rawText: raw,
        cleanedText: cleaned,
        charCount: count,
        lineCount,
        isDialogue,
        isEmpty,
        pattern,
        movingAverage: movingAverages[i],
        depthIntensity,
        colorDepthCode,
      });
    }

    const totalParagraphs = paragraphs.length;
    const totalChars = charCounts.reduce((sum, c) => sum + c, 0);
    const totalLines = lineCounts.reduce((sum, l) => sum + l, 0);
    const nonCount = charCounts.filter((c) => c > 0);
    const averageCharCount = nonCount.length > 0 ? Number((totalChars / nonCount.length).toFixed(1)) : 0;

    // Calculate Rhythm Health Score & Advice
    const { rhythmHealthScore, advice } = this.evaluateRhythmHealth({
      paragraphs,
      charCounts,
      blackWallCount,
      emptyLineCount,
      shortContrastCount,
      totalParagraphs,
      averageCharCount,
    });

    return {
      paragraphs,
      charCounts,
      lineCounts,
      movingAverages,
      totalParagraphs,
      totalChars,
      totalLines,
      averageCharCount,
      blackWallCount,
      emptyLineCount,
      shortContrastCount,
      dialogueCount,
      rhythmHealthScore,
      advice,
    };
  }

  /**
   * Calculates moving average array with specified sliding window size.
   */
  private calculateMovingAverages(values: number[], windowSize: number): number[] {
    if (values.length === 0) return [];
    const halfWindow = Math.floor(windowSize / 2);
    const result: number[] = [];

    for (let i = 0; i < values.length; i++) {
      const start = Math.max(0, i - halfWindow);
      const end = Math.min(values.length - 1, i + halfWindow);
      let sum = 0;
      let count = 0;

      for (let j = start; j <= end; j++) {
        sum += values[j];
        count++;
      }

      result.push(Number((sum / count).toFixed(1)));
    }

    return result;
  }

  /**
   * Calculates heatmap depth intensity (0.0 to 1.0).
   */
  private calculateDepthIntensity(charCount: number, blackWallThreshold: number): number {
    if (charCount === 0) return 0;
    // Scale intensity logarithmic/linear up to 1.0 at black wall threshold
    const ratio = charCount / blackWallThreshold;
    return Number(Math.min(1.0, Math.max(0.05, ratio)).toFixed(2));
  }

  /**
   * Maps depth intensity and pattern type to UI Heatmap CSS hex color depth codes.
   */
  private getColorDepthCode(intensity: number, pattern: ParagraphPatternType): string {
    if (pattern === 'empty_line') return '#f8f9fa'; // Empty line background
    if (pattern === 'black_wall') return '#800026';  // Dark red alert for black walls (>300 chars)

    // Heatmap color gradient from light blue/green -> yellow -> orange -> red
    if (intensity < 0.15) return '#edf8fb';
    if (intensity < 0.35) return '#b2e2e2';
    if (intensity < 0.55) return '#66c2a4';
    if (intensity < 0.75) return '#2ca25f';
    if (intensity < 0.90) return '#e6550d';
    return '#bd0026';
  }

  /**
   * Evaluates overall paragraph rhythm health score and generates actionable diagnostic advice.
   */
  private evaluateRhythmHealth(params: {
    paragraphs: ParagraphCadenceItem[];
    charCounts: number[];
    blackWallCount: number;
    emptyLineCount: number;
    shortContrastCount: number;
    totalParagraphs: number;
    averageCharCount: number;
  }): { rhythmHealthScore: number; advice: CadenceAdvice[] } {
    const {
      paragraphs,
      charCounts,
      blackWallCount,
      emptyLineCount,
      shortContrastCount,
      totalParagraphs,
    } = params;

    let score = 100;
    const advice: CadenceAdvice[] = [];

    // 1. Black wall penalties
    if (blackWallCount > 0) {
      const penalty = Math.min(45, blackWallCount * 15);
      score -= penalty;

      const wallIndices = paragraphs.filter((p) => p.pattern === 'black_wall').map((p) => p.index + 1);
      advice.push({
        level: blackWallCount >= 3 ? 'error' : 'warning',
        message: `【黒い壁警告】300字を超える長大段落が${blackWallCount}箇所存在します（段落: ${wallIndices.join(', ')}）。適宜改行や会話文を挟んで視覚的圧迫感を軽減してください。`,
        paragraphIndex: wallIndices[0] - 1,
      });
    }

    // 2. Consecutive long paragraphs check (>180 chars without pause)
    let consecutiveLong = 0;
    let maxConsecutiveLong = 0;
    for (const count of charCounts) {
      if (count > 180) {
        consecutiveLong++;
        if (consecutiveLong > maxConsecutiveLong) maxConsecutiveLong = consecutiveLong;
      } else {
        consecutiveLong = 0;
      }
    }

    if (maxConsecutiveLong >= 3) {
      score -= 15;
      advice.push({
        level: 'warning',
        message: `【連続長文段落】180字以上の長文段落が${maxConsecutiveLong}連続しています。1行空きや短い対比段落を挟んでテンポの波を作ってください。`,
      });
    }

    // 3. Monotony check: lack of paragraph length variance
    if (totalParagraphs >= 5) {
      const nonZero = charCounts.filter((c) => c > 0);
      if (nonZero.length >= 5) {
        const mean = nonZero.reduce((a, b) => a + b, 0) / nonZero.length;
        const variance = nonZero.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / nonZero.length;
        const stdDev = Math.sqrt(variance);

        // Low standard deviation indicates monotonous paragraph lengths
        if (stdDev < 12 && mean > 40) {
          score -= 10;
          advice.push({
            level: 'info',
            message: '【リズム一様】段落の文字数が均一化しています。長短の起伏（抑揚の波）をつけると読者の没入感が高まります。',
          });
        }
      }
    }

    // 4. Excessive blank lines check (> 3 consecutive empty lines)
    let consecutiveEmpty = 0;
    let maxConsecutiveEmpty = 0;
    for (const count of charCounts) {
      if (count === 0) {
        consecutiveEmpty++;
        if (consecutiveEmpty > maxConsecutiveEmpty) maxConsecutiveEmpty = consecutiveEmpty;
      } else {
        consecutiveEmpty = 0;
      }
    }

    if (maxConsecutiveEmpty >= 3) {
      score -= 10;
      advice.push({
        level: 'warning',
        message: `【過剰な空行】3行以上の連続空行が検出されました（最大${maxConsecutiveEmpty}連続空行）。`,
      });
    }

    // Positive rhythm encouragement
    if (shortContrastCount > 0 && blackWallCount === 0 && maxConsecutiveLong < 3) {
      advice.push({
        level: 'info',
        message: '✨ 短い対比段落と適度な空行が効いており、文章テンポ（抑揚の波）が健全に保たれています。',
      });
    }

    const rhythmHealthScore = Math.max(0, Math.min(100, score));

    return { rhythmHealthScore, advice };
  }
}
