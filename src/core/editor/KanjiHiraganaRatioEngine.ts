/**
 * KanjiHiraganaRatioEngine - Japanese Literature Golden Ratio Checker
 *
 * Calculates real-time character composition breakdown (Kanji, Hiragana, Katakana, Alphanumeric, Symbols)
 * and verifies compliance with literary / light novel golden ratios (Kanji 25-35%, Hiragana 60-70%).
 *
 * Automatically strips Aozora Bunko ruby annotations and control markup to avoid inflating phonetic character counts.
 */

export interface CharacterCounts {
  kanji: number;
  hiragana: number;
  katakana: number;
  alphanumeric: number;
  symbols: number;
  total: number;
}

export interface CharacterRatios {
  kanjiRatio: number;        // Percentage 0..100 (e.g. 30.5)
  hiraganaRatio: number;     // Percentage 0..100 (e.g. 65.0)
  katakanaRatio: number;     // Percentage 0..100
  alphanumericRatio: number; // Percentage 0..100
  symbolsRatio: number;      // Percentage 0..100
}

export type LevelStatus = 'optimal' | 'too_high' | 'too_low';

export interface EvaluationResult {
  kanjiStatus: LevelStatus;
  hiraganaStatus: LevelStatus;
  isGoldenRatio: boolean;
  messages: string[];
}

export interface CharacterRatioAnalysis {
  cleanedText: string;
  counts: CharacterCounts;
  ratios: CharacterRatios;
  evaluation: EvaluationResult;
}

export class KanjiHiraganaRatioEngine {
  // Recommendation Target Ranges for Light Novel / Literature
  static readonly KANJI_TARGET_MIN = 25.0;
  static readonly KANJI_TARGET_MAX = 35.0;
  static readonly HIRAGANA_TARGET_MIN = 60.0;
  static readonly HIRAGANA_TARGET_MAX = 70.0;

  // Character Classification Patterns
  private static readonly KANJI_RE = /[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF\u3005\u3006\u303B\u303C]/;
  private static readonly HIRAGANA_RE = /[\u3041-\u3096\u309D\u309E]/;
  private static readonly KATAKANA_RE = /[\u30A1-\u30FA\u30FD\u30FE\u30FB\u30FC\uFF66-\uFF9F]/;
  private static readonly ALPHANUMERIC_RE = /[a-zA-Z0-9\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A]/;

  /**
   * Strips Aozora Bunko ruby readings, bouten, and command markup from raw manuscript text.
   */
  static stripAozoraMarkup(rawText: string): string {
    if (!rawText) return '';

    return rawText
      // 1. Explicit ruby: ｜親文字《るび》 -> 親文字
      .replace(/｜([^《\r\n]+)《[^》\r\n]+》/g, '$1')
      // 2. Implicit kanji ruby: 漢字《るび》 -> 漢字
      .replace(/([\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]+)《[^》\r\n]+》/g, '$1')
      // 3. Bouten: 《《傍点》》 -> 傍点
      .replace(/《《([^》\r\n]+)》》/g, '$1')
      // 4. Aozora command markup (e.g. ［＃...］): remove entirely
      .replace(/［＃[^］\r\n]+］/g, '')
      // 6. Ruby sagari: 〔...〕 -> ...
      .replace(/〔([^〕\r\n]+)〕/g, '$1');
  }

  /**
   * Analyzes manuscript text and returns counts, ratio percentages, and literary golden ratio evaluations.
   */
  public analyze(rawText: string): CharacterRatioAnalysis {
    const cleanedText = KanjiHiraganaRatioEngine.stripAozoraMarkup(rawText);

    let kanji = 0;
    let hiragana = 0;
    let katakana = 0;
    let alphanumeric = 0;
    let symbols = 0;

    for (const char of cleanedText) {
      if (KanjiHiraganaRatioEngine.KANJI_RE.test(char)) {
        kanji++;
      } else if (KanjiHiraganaRatioEngine.HIRAGANA_RE.test(char)) {
        hiragana++;
      } else if (KanjiHiraganaRatioEngine.KATAKANA_RE.test(char)) {
        katakana++;
      } else if (KanjiHiraganaRatioEngine.ALPHANUMERIC_RE.test(char)) {
        alphanumeric++;
      } else {
        symbols++;
      }
    }

    const total = kanji + hiragana + katakana + alphanumeric + symbols;

    const kanjiRatio = total > 0 ? Number(((kanji / total) * 100).toFixed(1)) : 0;
    const hiraganaRatio = total > 0 ? Number(((hiragana / total) * 100).toFixed(1)) : 0;
    const katakanaRatio = total > 0 ? Number(((katakana / total) * 100).toFixed(1)) : 0;
    const alphanumericRatio = total > 0 ? Number(((alphanumeric / total) * 100).toFixed(1)) : 0;
    const symbolsRatio = total > 0 ? Number(((symbols / total) * 100).toFixed(1)) : 0;

    // Evaluate Golden Ratio
    let kanjiStatus: LevelStatus = 'optimal';
    let hiraganaStatus: LevelStatus = 'optimal';
    const messages: string[] = [];

    if (total === 0) {
      messages.push('本文を入力してください。');
    } else {
      if (kanjiRatio < KanjiHiraganaRatioEngine.KANJI_TARGET_MIN) {
        kanjiStatus = 'too_low';
        messages.push(`漢字比率が低すぎます (${kanjiRatio}% < 目標 ${KanjiHiraganaRatioEngine.KANJI_TARGET_MIN}%)。開いた印象を受けます。`);
      } else if (kanjiRatio > KanjiHiraganaRatioEngine.KANJI_TARGET_MAX) {
        kanjiStatus = 'too_high';
        messages.push(`漢字比率が高すぎます (${kanjiRatio}% > 目標 ${KanjiHiraganaRatioEngine.KANJI_TARGET_MAX}%)。堅苦しい印象を与える可能性があります。`);
      }

      if (hiraganaRatio < KanjiHiraganaRatioEngine.HIRAGANA_TARGET_MIN) {
        hiraganaStatus = 'too_low';
        messages.push(`ひらがな比率が低すぎます (${hiraganaRatio}% < 目標 ${KanjiHiraganaRatioEngine.HIRAGANA_TARGET_MIN}%)。漢字やカタカナが多く文章が硬くなっています。`);
      } else if (hiraganaRatio > KanjiHiraganaRatioEngine.HIRAGANA_TARGET_MAX) {
        hiraganaStatus = 'too_high';
        messages.push(`ひらがな比率が高すぎます (${hiraganaRatio}% > 目標 ${KanjiHiraganaRatioEngine.HIRAGANA_TARGET_MAX}%)。ひらがな連続で可読性が低下している可能性があります。`);
      }

      if (kanjiStatus === 'optimal' && hiraganaStatus === 'optimal') {
        messages.push(`✨ 文芸・ラノベ黄金比率（漢字 25〜35% / ひらがな 60〜70%）に完全に適合しています！`);
      }
    }

    const isGoldenRatio = total > 0 && kanjiStatus === 'optimal' && hiraganaStatus === 'optimal';

    return {
      cleanedText,
      counts: {
        kanji,
        hiragana,
        katakana,
        alphanumeric,
        symbols,
        total,
      },
      ratios: {
        kanjiRatio,
        hiraganaRatio,
        katakanaRatio,
        alphanumericRatio,
        symbolsRatio,
      },
      evaluation: {
        kanjiStatus,
        hiraganaStatus,
        isGoldenRatio,
        messages,
      },
    };
  }
}
