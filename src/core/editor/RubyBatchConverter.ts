import { SourceToDisplayMap, type OffsetMapping } from './AozoraParser.js';

export type RubyFormat = 'aozora' | 'kakuyomu' | 'narou';

export interface BatchConverterOptions {
  sourceFormat?: RubyFormat | 'auto';
  targetFormat?: RubyFormat;
  convertBoutenToNarouDots?: boolean;
}

export interface ConversionStats {
  rubyCount: number;
  boutenCount: number;
  normalizedCount: number;
}

export interface ConversionResult {
  convertedText: string;
  sourceText: string;
  sourceFormat: RubyFormat | 'auto';
  targetFormat: RubyFormat;
  map: SourceToDisplayMap;
  stats: ConversionStats;
  verificationReport: OffsetVerificationReport;
}

export interface OffsetVerificationReport {
  isConsistent: boolean;
  totalCheckPoints: number;
  maxDelta: number;
  errors: string[];
}

export interface ReplacedSpan {
  rawFrom: number;
  rawTo: number;
  convertedFrom: number;
  convertedTo: number;
  type: 'ruby' | 'bouten' | 'pipe' | 'norm';
}

export class CompositeSourceToDisplayMap extends SourceToDisplayMap {
  private map1: SourceToDisplayMap;
  private map2: SourceToDisplayMap;

  constructor(map1: SourceToDisplayMap, map2: SourceToDisplayMap) {
    super([]);
    this.map1 = map1;
    this.map2 = map2;
  }

  override toDisplayOffset(rawOffset: number): number {
    return this.map2.toDisplayOffset(this.map1.toDisplayOffset(rawOffset));
  }

  override toRawOffset(displayOffset: number): number {
    return this.map1.toRawOffset(this.map2.toRawOffset(displayOffset));
  }
}

export class RubyBatchConverter {
  /**
   * Detect format of the input text based on markup signatures.
   */
  static detectFormat(text: string): RubyFormat {
    if (
      /［＃.*に傍点］/.test(text) ||
      /〔.*〕/.test(text)
    ) {
      return 'aozora';
    }

    // Narou signature: uses halfwidth/fullwidth parens for ruby e.g., 漢字(かんじ) or ｜親文字(かんじ)
    const narouParenRuby = /(?:｜|\|)?([\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF\w]+)[（\(]([^\)\r\n]+)[）\)]/g;
    if (narouParenRuby.test(text)) {
      return 'narou';
    }

    return 'aozora';
  }

  /**
   * Batch normalize variant rubies (<<るび>>, ＜＜るび＞＞, (るび), （るび）) and boutens (<<<<傍点>>>>, ［＃...に傍点］)
   * into standard Aozora / Kakuyomu format (｜親文字《るび》, 漢字《るび》, 《《傍点》》).
   */
  static normalizeText(rawText: string): ConversionResult {
    const sourceFormat = this.detectFormat(rawText);
    const targetFormat: RubyFormat = 'aozora';

    let stats: ConversionStats = { rubyCount: 0, boutenCount: 0, normalizedCount: 0 };

    // Pass 1: Bouten Normalization (Single unified regex pass over rawText)
    // Matches: ＜＜＜＜...＞＞＞＞, <<<<...>>>>, or ［＃「...」に傍点］
    const combinedBoutenRe = /＜＜＜＜([^＞\r\n]+)＞＞＞＞|<<<<([^>\r\n]+)>>>>|［＃「([^」\r\n]+)」に傍点］/g;
    let textAfterBouten = '';
    const boutenSpans: ReplacedSpan[] = [];
    let prevIdx = 0;
    let match: RegExpExecArray | null;

    while ((match = combinedBoutenRe.exec(rawText)) !== null) {
      const matchStart = match.index;
      const matchEnd = match.index + match[0].length;
      const innerText = match[1] || match[2] || match[3];
      const replacement = `《《${innerText}》》`;

      textAfterBouten += rawText.slice(prevIdx, matchStart);
      const replacedStart = textAfterBouten.length;
      textAfterBouten += replacement;
      const replacedEnd = textAfterBouten.length;

      boutenSpans.push({
        rawFrom: matchStart,
        rawTo: matchEnd,
        convertedFrom: replacedStart,
        convertedTo: replacedEnd,
        type: 'bouten',
      });

      stats.boutenCount++;
      stats.normalizedCount++;
      prevIdx = matchEnd;
    }
    textAfterBouten += rawText.slice(prevIdx);

    const boutenMap = this.buildOffsetMap(rawText, textAfterBouten, boutenSpans);

    // Pass 2: Ruby Normalization (Single unified regex pass over textAfterBouten)
    // Matches:
    // Group 1 & 2: Explicit pipe + ruby (angle/paren)
    // Group 3 & 4: Implicit kanji + ruby (angle/paren)
    // Group 5: Standalone Japanese double angle brackets <<漢字>>
    const combinedRubyRe =
      /(?:｜|\|)([^《\r\n<＜\(（]+)(?:《|<<|＜＜|[\(（])([^\)\r\n》>＞]+)(?:》|>>|＞＞|[\)）])|([\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]+)(?:<<|＜＜|[\(（])([^\)\r\n》>＞]+)(?:》|>>|＞＞|[\)）])|(?:<<|＜＜)([\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]+)(?:>>|＞＞)/g;

    let textAfterRuby = '';
    const rubySpans: ReplacedSpan[] = [];
    prevIdx = 0;

    while ((match = combinedRubyRe.exec(textAfterBouten)) !== null) {
      const matchStart = match.index;
      const matchEnd = match.index + match[0].length;

      let replacement = '';
      if (match[1] && match[2]) {
        // Explicit pipe ruby
        replacement = `｜${match[1]}《${match[2]}》`;
      } else if (match[3] && match[4]) {
        // Implicit kanji ruby
        replacement = `${match[3]}《${match[4]}》`;
      } else if (match[5]) {
        // Standalone Japanese angle brackets
        replacement = `《${match[5]}》`;
      }

      textAfterRuby += textAfterBouten.slice(prevIdx, matchStart);
      const replacedStart = textAfterRuby.length;
      textAfterRuby += replacement;
      const replacedEnd = textAfterRuby.length;

      rubySpans.push({
        rawFrom: matchStart,
        rawTo: matchEnd,
        convertedFrom: replacedStart,
        convertedTo: replacedEnd,
        type: 'ruby',
      });

      stats.rubyCount++;
      stats.normalizedCount++;
      prevIdx = matchEnd;
    }
    textAfterRuby += textAfterBouten.slice(prevIdx);

    const rubyMap = this.buildOffsetMap(textAfterBouten, textAfterRuby, rubySpans);

    // Compose maps for exact multi-pass rawText -> convertedText mapping
    const compositeMap = new CompositeSourceToDisplayMap(boutenMap, rubyMap);
    const verificationReport = this.verifyOffsetMappingConsistency(rawText, textAfterRuby, compositeMap);

    return {
      convertedText: textAfterRuby,
      sourceText: rawText,
      sourceFormat,
      targetFormat,
      map: compositeMap,
      stats,
      verificationReport,
    };
  }

  /**
   * Convert text between Aozora, Kakuyomu, and Narou formats.
   */
  static convertFormat(
    sourceText: string,
    options: BatchConverterOptions
  ): ConversionResult {
    const sourceFormat = options.sourceFormat === 'auto' || !options.sourceFormat
      ? this.detectFormat(sourceText)
      : options.sourceFormat;
    const targetFormat = options.targetFormat ?? 'aozora';

    // First normalize to standard intermediate format
    const normalizedRes = this.normalizeText(sourceText);

    if (targetFormat === 'aozora' || targetFormat === 'kakuyomu') {
      return {
        ...normalizedRes,
        sourceFormat,
        targetFormat,
      };
    }

    // Target format: 'narou'
    // Converts Aozora/Kakuyomu syntax to Narou syntax:
    // ｜親文字《るび》 -> ｜親文字(るび)
    // 漢字《るび》 -> 漢字(るび)
    // 《《傍点》》 -> optionally ｜傍《・》｜点《・》 or (傍点) or kept as 《《傍点》》
    let workingText = normalizedRes.convertedText;
    let stats = { ...normalizedRes.stats };
    const replacedSpans: ReplacedSpan[] = [];

    // 1. Explicit ruby conversion to Narou
    const explicitRubyRe = /｜([^《\r\n]+)《([^》\r\n]+)》/g;
    let buffer = '';
    let prevIdx = 0;
    let match: RegExpExecArray | null;

    while ((match = explicitRubyRe.exec(workingText)) !== null) {
      const matchStart = match.index;
      const matchEnd = match.index + match[0].length;
      const parent = match[1];
      const ruby = match[2];
      const replacement = `｜${parent}(${ruby})`;

      buffer += workingText.slice(prevIdx, matchStart);
      const replacedStart = buffer.length;
      buffer += replacement;
      const replacedEnd = buffer.length;

      replacedSpans.push({
        rawFrom: matchStart,
        rawTo: matchEnd,
        convertedFrom: replacedStart,
        convertedTo: replacedEnd,
        type: 'ruby',
      });

      prevIdx = matchEnd;
    }
    buffer += workingText.slice(prevIdx);
    workingText = buffer;

    // 2. Implicit kanji ruby conversion to Narou
    const implicitRubyRe = /([\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]+)《([^》\r\n]+)》/g;
    buffer = '';
    prevIdx = 0;

    while ((match = implicitRubyRe.exec(workingText)) !== null) {
      const matchStart = match.index;
      const matchEnd = match.index + match[0].length;
      const parent = match[1];
      const ruby = match[2];
      const replacement = `${parent}(${ruby})`;

      buffer += workingText.slice(prevIdx, matchStart);
      const replacedStart = buffer.length;
      buffer += replacement;
      const replacedEnd = buffer.length;

      replacedSpans.push({
        rawFrom: matchStart,
        rawTo: matchEnd,
        convertedFrom: replacedStart,
        convertedTo: replacedEnd,
        type: 'ruby',
      });

      prevIdx = matchEnd;
    }
    buffer += workingText.slice(prevIdx);
    workingText = buffer;

    // 3. Bouten handling for Narou
    if (options.convertBoutenToNarouDots) {
      const boutenRe = /《《([^》\r\n]+)》》/g;
      buffer = '';
      prevIdx = 0;

      while ((match = boutenRe.exec(workingText)) !== null) {
        const matchStart = match.index;
        const matchEnd = match.index + match[0].length;
        const content = match[1];

        // Convert each character to ｜字《・》
        const replacement = content
          .split('')
          .map((ch) => `｜${ch}(・)`)
          .join('');

        buffer += workingText.slice(prevIdx, matchStart);
        const replacedStart = buffer.length;
        buffer += replacement;
        const replacedEnd = buffer.length;

        replacedSpans.push({
          rawFrom: matchStart,
          rawTo: matchEnd,
          convertedFrom: replacedStart,
          convertedTo: replacedEnd,
          type: 'bouten',
        });

        prevIdx = matchEnd;
      }
      buffer += workingText.slice(prevIdx);
      workingText = buffer;
    }

    const map = this.buildOffsetMap(sourceText, workingText, replacedSpans);
    const verificationReport = this.verifyOffsetMappingConsistency(sourceText, workingText, map);

    return {
      convertedText: workingText,
      sourceText,
      sourceFormat,
      targetFormat,
      map,
      stats,
      verificationReport,
    };
  }

  /**
   * Import text pipeline: auto-detects format, normalizes rubies and boutens, and generates mapping.
   */
  static importText(rawText: string, options?: { defaultFormat?: RubyFormat }): ConversionResult {
    const detectedFormat = options?.defaultFormat ?? this.detectFormat(rawText);
    return this.normalizeText(rawText);
  }

  /**
   * Export text pipeline: converts normalized text into requested target format.
   */
  static exportText(
    normalizedText: string,
    targetFormat: RubyFormat,
    options?: { convertBoutenToNarouDots?: boolean }
  ): ConversionResult {
    return this.convertFormat(normalizedText, {
      sourceFormat: 'aozora',
      targetFormat,
      convertBoutenToNarouDots: options?.convertBoutenToNarouDots,
    });
  }

  /**
   * Build SourceToDisplayMap offset mapping array.
   */
  private static buildOffsetMap(
    sourceText: string,
    convertedText: string,
    spans: ReplacedSpan[]
  ): SourceToDisplayMap {
    if (spans.length === 0) {
      return new SourceToDisplayMap([]);
    }

    spans.sort((a, b) => a.rawFrom - b.rawFrom);

    const mappings: OffsetMapping[] = spans.map((s) => ({
      rawFrom: s.rawFrom,
      rawTo: s.rawTo,
      displayFrom: s.convertedFrom,
      displayTo: s.convertedTo,
      delta: s.convertedTo - s.rawTo,
    }));

    return new SourceToDisplayMap(mappings);
  }

  /**
   * Verify consistency of SourceToDisplayMap offset mapping between sourceText and convertedText.
   */
  static verifyOffsetMappingConsistency(
    sourceText: string,
    convertedText: string,
    map: SourceToDisplayMap
  ): OffsetVerificationReport {
    const errors: string[] = [];
    let maxDelta = 0;
    const checkPointsCount = Math.min(100, sourceText.length + 1);
    const step = Math.max(1, Math.floor(sourceText.length / checkPointsCount));

    let prevDisplay = -1;

    for (let i = 0; i <= sourceText.length; i += step) {
      const displayOffset = map.toDisplayOffset(i);

      // Check boundary bounds
      if (displayOffset < 0 || displayOffset > convertedText.length) {
        errors.push(`Display offset ${displayOffset} for raw index ${i} out of bounds [0, ${convertedText.length}]`);
      }

      // Check monotonicity
      if (displayOffset < prevDisplay) {
        errors.push(`Monotonicity violation at raw index ${i}: display offset ${displayOffset} < previous ${prevDisplay}`);
      }
      prevDisplay = displayOffset;

      // Track max absolute delta
      const delta = Math.abs(displayOffset - i);
      if (delta > maxDelta) {
        maxDelta = delta;
      }

      // Round-trip sanity check for exact match points outside matches
      const recoveredRaw = map.toRawOffset(displayOffset);
      if (recoveredRaw < 0 || recoveredRaw > sourceText.length) {
        errors.push(`Recovered raw offset ${recoveredRaw} for display ${displayOffset} out of bounds [0, ${sourceText.length}]`);
      }
    }

    return {
      isConsistent: errors.length === 0,
      totalCheckPoints: checkPointsCount,
      maxDelta,
      errors,
    };
  }
}
