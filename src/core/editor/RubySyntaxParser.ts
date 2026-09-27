/**
 * RubySyntaxParser - Unified Ruby Markup Parser, Normalizer & Format Converter
 * Supports Aozora Bunko, Kakuyomu, and Narou novel platforms.
 */

export type RubyFormat = 'aozora' | 'kakuyomu' | 'narou';

export interface RubyTextSpan {
  type: 'text';
  raw: string;
  rawFrom: number;
  rawTo: number;
}

export interface RubyMarkupSpan {
  type: 'ruby';
  parent: string;
  ruby: string;
  raw: string;
  rawFrom: number;
  rawTo: number;
  isExplicit: boolean;
  pipeChar?: '｜' | '|';
}

export type RubySyntaxSpan = RubyTextSpan | RubyMarkupSpan;

export interface RubyParseResult {
  spans: RubySyntaxSpan[];
  rawText: string;
  hasUnclosedBrackets: boolean;
}

export interface NormalizeOptions {
  /**
   * Preferred pipe style for explicit ruby prefix.
   * 'fullwidth' -> '｜' (standard Aozora)
   * 'halfwidth' -> '|' (standard Kakuyomu)
   * Default: 'fullwidth'
   */
  pipeStyle?: 'fullwidth' | 'halfwidth';

  /**
   * Auto-close unclosed ruby brackets ('《').
   * Default: true
   */
  autoCloseBrackets?: boolean;

  /**
   * Convert implicit kanji ruby ('漢字《ルビ》') to explicit ruby ('｜漢字《ルビ》').
   * Default: false
   */
  convertImplicitToExplicit?: boolean;

  /**
   * Convert explicit kanji ruby ('｜漢字《ルビ》') to implicit ('漢字《ルビ》') if base text consists purely of Kanji.
   * Default: false
   */
  convertExplicitToImplicitIfPossible?: boolean;
}

// Regex matching Kanji sequence (CJK Unified Ideographs)
const KANJI_RE = /^[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]+$/;

export class RubySyntaxParser {
  /**
   * Explicit Ruby regex matching full-width or half-width pipe: ｜親文字《ルビ》 or |親文字《ルビ》
   */
  private static readonly EXPLICIT_RUBY_RE = /([｜|])([^《\r\n]+)《([^》\r\n]*)》/g;

  /**
   * Implicit Kanji Ruby regex matching pure Kanji followed by 《ルビ》
   */
  private static readonly IMPLICIT_KANJI_RUBY_RE = /([\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]+)《([^》\r\n]*)》/g;

  /**
   * Unclosed Ruby regex matching explicit or implicit base text with unclosed 《
   */
  private static readonly UNCLOSED_EXPLICIT_RE = /([｜|])([^《\r\n]+)《([^》\r\n]*)(?=$|[\r\n｜|])/g;
  private static readonly UNCLOSED_IMPLICIT_RE = /([\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]+)《([^》\r\n]*)(?=$|[\r\n｜|])/g;

  /**
   * Parse raw text into structured spans.
   */
  static parse(rawText: string): RubyParseResult {
    // First, check if there are unclosed brackets
    const normalizedText = this.autoCloseBrackets(rawText);
    const hasUnclosedBrackets = normalizedText !== rawText;

    const matches: RubyMarkupSpan[] = [];

    // 1. Explicit Ruby
    const explicitRe = new RegExp(this.EXPLICIT_RUBY_RE);
    let m: RegExpExecArray | null;
    while ((m = explicitRe.exec(rawText)) !== null) {
      matches.push({
        type: 'ruby',
        parent: m[2],
        ruby: m[3],
        raw: m[0],
        rawFrom: m.index,
        rawTo: m.index + m[0].length,
        isExplicit: true,
        pipeChar: m[1] as '｜' | '|',
      });
    }

    // 2. Implicit Kanji Ruby (ignore if overlapping existing explicit match)
    const implicitRe = new RegExp(this.IMPLICIT_KANJI_RUBY_RE);
    while ((m = implicitRe.exec(rawText)) !== null) {
      const start = m.index;
      const end = m.index + m[0].length;

      const overlaps = matches.some(
        (existing) => Math.max(start, existing.rawFrom) < Math.min(end, existing.rawTo)
      );

      if (!overlaps) {
        matches.push({
          type: 'ruby',
          parent: m[1],
          ruby: m[2],
          raw: m[0],
          rawFrom: start,
          rawTo: end,
          isExplicit: false,
        });
      }
    }

    // Sort matches by start position
    matches.sort((a, b) => a.rawFrom - b.rawFrom);

    const spans: RubySyntaxSpan[] = [];
    let currentPos = 0;

    for (const match of matches) {
      if (match.rawFrom > currentPos) {
        const textSegment = rawText.slice(currentPos, match.rawFrom);
        spans.push({
          type: 'text',
          raw: textSegment,
          rawFrom: currentPos,
          rawTo: match.rawFrom,
        });
      }

      spans.push(match);
      currentPos = match.rawTo;
    }

    if (currentPos < rawText.length) {
      const remaining = rawText.slice(currentPos);
      spans.push({
        type: 'text',
        raw: remaining,
        rawFrom: currentPos,
        rawTo: rawText.length,
      });
    }

    return {
      spans,
      rawText,
      hasUnclosedBrackets,
    };
  }

  /**
   * Auto-closes any unclosed 《 in raw text.
   * e.g., "｜漢字《かんじ" -> "｜漢字《かんじ》"
   */
  static autoCloseBrackets(rawText: string): string {
    let text = rawText;

    // Process explicit unclosed: [｜|]base《ruby
    text = text.replace(/([｜|][^《\r\n]+《[^》\r\n]*)(?=$|[\r\n｜|])/g, '$1》');

    // Process implicit unclosed: kanji《ruby
    text = text.replace(/([\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]+《[^》\r\n]*)(?=$|[\r\n｜|])/g, (match) => {
      if (match.endsWith('》')) return match;
      return match + '》';
    });

    return text;
  }

  /**
   * Normalize ruby syntax in raw text based on specified options.
   */
  static normalizeRuby(rawText: string, options: NormalizeOptions = {}): string {
    const {
      pipeStyle = 'fullwidth',
      autoCloseBrackets = true,
      convertImplicitToExplicit = false,
      convertExplicitToImplicitIfPossible = false,
    } = options;

    let text = rawText;
    if (autoCloseBrackets) {
      text = this.autoCloseBrackets(text);
    }

    const { spans } = this.parse(text);
    const targetPipe = pipeStyle === 'halfwidth' ? '|' : '｜';

    return spans
      .map((span) => {
        if (span.type === 'text') {
          return span.raw;
        }

        const isPureKanji = KANJI_RE.test(span.parent);

        if (convertExplicitToImplicitIfPossible && span.isExplicit && isPureKanji) {
          return `${span.parent}《${span.ruby}》`;
        }

        if (convertImplicitToExplicit && !span.isExplicit) {
          return `${targetPipe}${span.parent}《${span.ruby}》`;
        }

        if (span.isExplicit) {
          return `${targetPipe}${span.parent}《${span.ruby}》`;
        }

        return `${span.parent}《${span.ruby}》`;
      })
      .join('');
  }

  /**
   * Converts ruby markup format between Aozora, Kakuyomu, and Narou platforms.
   */
  static convertFormat(rawText: string, targetFormat: RubyFormat): string {
    switch (targetFormat) {
      case 'aozora':
        // Aozora standard: fullwidth pipe ｜ for explicit, implicit for pure Kanji
        return this.normalizeRuby(rawText, {
          pipeStyle: 'fullwidth',
          autoCloseBrackets: true,
        });

      case 'kakuyomu':
        // Kakuyomu standard: halfwidth pipe | for explicit ruby prefix
        return this.normalizeRuby(rawText, {
          pipeStyle: 'halfwidth',
          autoCloseBrackets: true,
        });

      case 'narou':
        // Narou standard: standardizes explicit pipes to fullwidth ｜
        return this.normalizeRuby(rawText, {
          pipeStyle: 'fullwidth',
          autoCloseBrackets: true,
        });
    }
  }

  /**
   * Auto-completes incomplete ruby syntax at or before the given cursor position.
   */
  static autoCompleteRuby(
    rawText: string,
    cursorOffset: number = rawText.length
  ): { text: string; newCursorOffset: number } {
    const beforeCursor = rawText.slice(0, cursorOffset);
    const afterCursor = rawText.slice(cursorOffset);

    // Case 1: Unclosed bracket 《 immediately preceding or containing cursor: e.g. "｜漢字《かんじ"
    const unclosedMatch = beforeCursor.match(/([｜|]?[^《\r\n]+《[^》\r\n]*)$/);
    if (unclosedMatch && !afterCursor.startsWith('》')) {
      const fixedBefore = beforeCursor + '》';
      return {
        text: fixedBefore + afterCursor,
        newCursorOffset: cursorOffset,
      };
    }

    // Case 2: Pipe base text without 《: e.g. "｜漢字" at cursor
    const barePipeMatch = beforeCursor.match(/([｜|][^《\r\n《》]+)$/);
    if (barePipeMatch && !afterCursor.startsWith('《')) {
      const fixedBefore = beforeCursor + '《》';
      return {
        text: fixedBefore + afterCursor,
        newCursorOffset: cursorOffset + 1, // position inside 《|》
      };
    }

    // Default: run general auto-close
    const closed = this.autoCloseBrackets(rawText);
    return {
      text: closed,
      newCursorOffset: cursorOffset + (closed.length - rawText.length),
    };
  }

  /**
   * Renders raw text containing ruby markup to semantic HTML.
   */
  static toHtml(rawText: string): string {
    const { spans } = this.parse(rawText);
    return spans
      .map((span) => {
        if (span.type === 'text') {
          return escapeHtml(span.raw);
        }
        return `<ruby>${escapeHtml(span.parent)}<rt>${escapeHtml(span.ruby)}</rt></ruby>`;
      })
      .join('');
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
