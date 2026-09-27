/**
 * SentenceEndingCadenceCalculator - Japanese Sentence Ending Monotony Score Calculator
 *
 * Analyzes Japanese prose for consecutive past-tense / state sentence endings (e.g. 「〜た」「〜だ」 4+ in a row).
 * Provides real-time monotony penalty calculation and actionable cadence improvement advice.
 */

export interface SentenceInfo {
  index: number;
  text: string;
  cleanText: string;
  ending: string;
  isPastTense: boolean;
  isDialogue: boolean;
  startOffset: number;
  endOffset: number;
}

export interface MonotonyRun {
  startIndex: number;
  endIndex: number;
  length: number;
  sentences: SentenceInfo[];
}

export interface CadenceAdvice {
  level: 'info' | 'warning' | 'error';
  message: string;
  suggestion: string;
  runIndex?: number;
}

export interface SentenceCadenceResult {
  totalSentences: number;
  pastTenseCount: number;
  pastTenseRatio: number;
  maxConsecutivePastTense: number;
  monotonyPenalty: number;
  cadenceScore: number;
  runs: MonotonyRun[];
  advice: CadenceAdvice[];
  sentences: SentenceInfo[];
}

export interface SentenceCadenceOptions {
  /** Threshold for triggering monotony detection (default: 4) */
  threshold?: number;
  /** Whether to exclude dialogue sentences in 「...」 from monotony calculation (default: false) */
  ignoreDialogue?: boolean;
}

export class SentenceEndingCadenceCalculator {
  private static readonly DEFAULT_THRESHOLD = 4;

  /**
   * Strip Aozora Bunko markup before sentence processing.
   */
  public static stripAozoraMarkup(text: string): string {
    return text
      // ｜漢字《かんじ》 -> 漢字
      .replace(/｜([^《\r\n]+)《[^》\r\n]+》/g, '$1')
      // 漢字《かんじ》 -> 漢字
      .replace(/([\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]+)《[^》\r\n]+》/g, '$1')
      // 《《傍点》》 -> 傍点
      .replace(/《《([^》\r\n]+)》》/g, '$1')
      // ［＃「...」に傍点］ -> ...
      .replace(/［＃「([^」\r\n]+)」に傍点］/g, '$1')
      // 〔ルビ下がり〕 -> empty
      .replace(/〔[^〕\r\n]+〕/g, '');
  }

  /**
   * Clean sentence text by removing trailing punctuation and quotes/brackets.
   */
  public static cleanSentence(rawSentence: string): { cleanText: string; isDialogue: boolean } {
    const isDialogue = rawSentence.startsWith('「') || rawSentence.startsWith('『');

    // Remove trailing punctuation, quotes, brackets, spaces
    let clean = rawSentence
      .replace(/[。！？!?…―\s」』）\)"'”]+$/g, '')
      .replace(/^[「『（\("'“]+/g, '')
      .trim();

    return { cleanText: clean, isDialogue };
  }

  /**
   * Detect if sentence ends with past tense or declarative state ending (た / だ).
   */
  public static detectEnding(sentenceText: string): { ending: string; isPastTense: boolean } {
    const { cleanText } = this.cleanSentence(sentenceText);
    if (!cleanText) {
      return { ending: '', isPastTense: false };
    }

    const lastChar = cleanText.slice(-1);
    const isPastTense = lastChar === 'た' || lastChar === 'だ';

    return {
      ending: lastChar,
      isPastTense,
    };
  }

  /**
   * Split input text into individual sentences with offset mappings.
   */
  public static splitSentences(text: string): SentenceInfo[] {
    const strippedText = this.stripAozoraMarkup(text);
    const sentences: SentenceInfo[] = [];

    // Split on sentence delimiters: 。, \n, !, ?, ！, ？
    // Keep track of characters to reconstruct sentence units
    const delimiterRegex = /([。！？!?\n]+)/g;
    let match: RegExpExecArray | null;
    let lastIndex = 0;
    let sentenceIndex = 0;

    const pushSentence = (rawSeg: string, startOffset: number, endOffset: number) => {
      const trimmed = rawSeg.trim();
      if (!trimmed) return;

      const { cleanText, isDialogue } = this.cleanSentence(trimmed);
      if (!cleanText) return;

      const { ending, isPastTense } = this.detectEnding(trimmed);

      sentences.push({
        index: sentenceIndex++,
        text: trimmed,
        cleanText,
        ending,
        isPastTense,
        isDialogue,
        startOffset,
        endOffset,
      });
    };

    while ((match = delimiterRegex.exec(strippedText)) !== null) {
      const segEnd = match.index + match[0].length;
      const rawSeg = strippedText.slice(lastIndex, segEnd);
      pushSentence(rawSeg, lastIndex, segEnd);
      lastIndex = segEnd;
    }

    if (lastIndex < strippedText.length) {
      const rawSeg = strippedText.slice(lastIndex);
      pushSentence(rawSeg, lastIndex, strippedText.length);
    }

    return sentences;
  }

  /**
   * Analyze text for sentence ending cadence and monotony score.
   */
  public analyze(text: string, options: SentenceCadenceOptions = {}): SentenceCadenceResult {
    const threshold = options.threshold ?? SentenceEndingCadenceCalculator.DEFAULT_THRESHOLD;
    const ignoreDialogue = options.ignoreDialogue ?? false;

    const allSentences = SentenceEndingCadenceCalculator.splitSentences(text);
    const sentences = ignoreDialogue
      ? allSentences.filter((s) => !s.isDialogue)
      : allSentences;

    const totalSentences = sentences.length;
    let pastTenseCount = 0;
    let currentRunSentences: SentenceInfo[] = [];
    let maxConsecutivePastTense = 0;
    const runs: MonotonyRun[] = [];

    for (let i = 0; i < sentences.length; i++) {
      const s = sentences[i];
      if (s.isPastTense) {
        pastTenseCount++;
        currentRunSentences.push(s);
      } else {
        if (currentRunSentences.length >= threshold) {
          runs.push({
            startIndex: currentRunSentences[0].index,
            endIndex: currentRunSentences[currentRunSentences.length - 1].index,
            length: currentRunSentences.length,
            sentences: [...currentRunSentences],
          });
        }
        if (currentRunSentences.length > maxConsecutivePastTense) {
          maxConsecutivePastTense = currentRunSentences.length;
        }
        currentRunSentences = [];
      }
    }

    // Process final run
    if (currentRunSentences.length >= threshold) {
      runs.push({
        startIndex: currentRunSentences[0].index,
        endIndex: currentRunSentences[currentRunSentences.length - 1].index,
        length: currentRunSentences.length,
        sentences: [...currentRunSentences],
      });
    }
    if (currentRunSentences.length > maxConsecutivePastTense) {
      maxConsecutivePastTense = currentRunSentences.length;
    }

    // Calculate penalty score
    let rawPenalty = 0;
    for (const run of runs) {
      if (run.length === 4) {
        rawPenalty += 25;
      } else if (run.length === 5) {
        rawPenalty += 40;
      } else {
        rawPenalty += 50 + (run.length - 6) * 15;
      }
    }

    const monotonyPenalty = Math.min(100, Math.round(rawPenalty));
    const cadenceScore = Math.max(0, 100 - monotonyPenalty);
    const pastTenseRatio = totalSentences > 0 ? Number((pastTenseCount / totalSentences).toFixed(2)) : 0;

    // Generate Advice
    const advice: CadenceAdvice[] = [];

    if (runs.length === 0) {
      advice.push({
        level: 'info',
        message: '文末表現のテンポは良好です。',
        suggestion: '「た/だ」の4連続以上の単調な重複は見られません。リズム豊かな文章が維持されています。',
      });
    } else {
      runs.forEach((run, idx) => {
        const startNum = run.startIndex + 1;
        const endNum = run.endIndex + 1;
        const level: CadenceAdvice['level'] = run.length >= 6 ? 'error' : 'warning';

        advice.push({
          level,
          runIndex: idx,
          message: `第${startNum}句〜第${endNum}句で「た/だ」の文末表現が${run.length}連続しています。`,
          suggestion: `【改善提案】体言止め（名詞止め）、進行形（〜している/〜ていた）、体感・情景描写や対話文を挟むことで文章のテンポがより良くなります。`,
        });
      });
    }

    return {
      totalSentences,
      pastTenseCount,
      pastTenseRatio,
      maxConsecutivePastTense,
      monotonyPenalty,
      cadenceScore,
      runs,
      advice,
      sentences,
    };
  }
}
