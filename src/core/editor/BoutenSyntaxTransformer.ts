/**
 * BoutenSyntaxTransformer - Multi-Type Bouten (Emphasis Mark) Parser & Format Converter
 *
 * Supports emphasis mark types:
 * - sesame (ごま斑 / ごま)
 * - bullet (黒丸 / 丸)
 * - circle (白丸)
 * - double-circle (蛇の目 / 二重丸)
 * - triangle (三角)
 *
 * Supports inter-conversion between:
 * - Kakuyomu syntax (《《強調》》)
 * - Syosetu / Narou HTML (<span class="bouten">強調</span>)
 * - Aozora Bunko syntax (［＃「強調」に傍点］ / ［＃傍点］強調［＃傍点終わり］)
 * - CSS text-emphasis string representations
 */

export type BoutenType = 'sesame' | 'bullet' | 'circle' | 'double-circle' | 'triangle';

export type BoutenFormat = 'kakuyomu' | 'aozora' | 'narou' | 'html' | 'css-emphasis';

export interface BoutenSpan {
  type: 'bouten';
  text: string;
  mark: BoutenType;
  raw: string;
  rawFrom: number;
  rawTo: number;
  syntaxFormat: BoutenFormat | 'angle';
}

export interface TextSpan {
  type: 'text';
  raw: string;
  rawFrom: number;
  rawTo: number;
}

export type BoutenSyntaxSpan = TextSpan | BoutenSpan;

export interface BoutenParseResult {
  spans: BoutenSyntaxSpan[];
  rawText: string;
  extractedSpans: BoutenSpan[];
}

export interface ConvertOptions {
  /**
   * Default mark to use when converting from formats that do not specify a mark type.
   * Default: 'sesame'
   */
  defaultMark?: BoutenType;

  /**
   * Use inline CSS style attributes when converting to 'html' or 'narou'.
   * Default: false
   */
  useCssInline?: boolean;

  /**
   * Class name prefix for HTML rendering (e.g. "bouten").
   * Default: "bouten"
   */
  classPrefix?: string;
}

export class BoutenSyntaxTransformer {
  /**
   * Japanese mark type label dictionary
   */
  static readonly MARK_LABELS: Record<BoutenType, string> = {
    sesame: 'ごま斑',
    bullet: '黒丸',
    circle: '白丸',
    'double-circle': '蛇の目',
    triangle: '三角',
  };

  /**
   * CSS text-emphasis-style values map
   */
  static readonly CSS_MARK_MAP: Record<BoutenType, string> = {
    sesame: 'sesame',
    bullet: 'filled circle',
    circle: 'open circle',
    'double-circle': 'double-circle',
    triangle: 'filled triangle',
  };

  /**
   * Parses raw text and extracts all bouten markup spans alongside plain text spans.
   */
  static parse(rawText: string): BoutenParseResult {
    const extractedSpans: BoutenSpan[] = [];

    // Helper to check if a range overlaps existing matches
    const isOverlapping = (from: number, to: number) => {
      return extractedSpans.some((s) => Math.max(from, s.rawFrom) < Math.min(to, s.rawTo));
    };

    // 1. Four-angle brackets (<<<<...>>>> or ＜＜＜＜...＞＞＞＞)
    const angleRe = /(?:<{4,}|＜{4,})([^\n<>《》＜＞]+?)(?:>{4,}|＞{4,})/g;
    let match: RegExpExecArray | null;
    while ((match = angleRe.exec(rawText)) !== null) {
      if (!isOverlapping(match.index, match.index + match[0].length)) {
        extractedSpans.push({
          type: 'bouten',
          text: match[1],
          mark: 'sesame',
          raw: match[0],
          rawFrom: match.index,
          rawTo: match.index + match[0].length,
          syntaxFormat: 'angle',
        });
      }
    }

    // 2. Kakuyomu notation: 《《...》》
    const kakuyomuRe = /《《([^》\r\n]+?)》》/g;
    while ((match = kakuyomuRe.exec(rawText)) !== null) {
      if (!isOverlapping(match.index, match.index + match[0].length)) {
        extractedSpans.push({
          type: 'bouten',
          text: match[1],
          mark: 'sesame',
          raw: match[0],
          rawFrom: match.index,
          rawTo: match.index + match[0].length,
          syntaxFormat: 'kakuyomu',
        });
      }
    }

    // 3. Aozora inline mark notation: ［＃「文字」に...傍点］ or [#「文字」に...傍点]
    const aozoraInlineRe = /[［\[]＃「([^」\r\n]+?)」に(ごま|ごま捕り|丸|黒丸|白丸|二重丸|蛇の目|三角)?傍点[］\]]/g;
    while ((match = aozoraInlineRe.exec(rawText)) !== null) {
      if (!isOverlapping(match.index, match.index + match[0].length)) {
        const text = match[1];
        const markTypeStr = match[2] || 'ごま';
        const mark = this.parseJapaneseMarkType(markTypeStr);
        extractedSpans.push({
          type: 'bouten',
          text,
          mark,
          raw: match[0],
          rawFrom: match.index,
          rawTo: match.index + match[0].length,
          syntaxFormat: 'aozora',
        });
      }
    }

    // 4. Aozora block tag notation: ［＃傍点（...）］文字［＃傍点終わり］
    const aozoraBlockRe = /[［\[]＃傍点(?:（(ごま|丸|黒丸|白丸|二重丸|蛇の目|三角)）)?[］\]]([^\n［］\[\]]+?)[［\[]＃傍点終わり[］\]]/g;
    while ((match = aozoraBlockRe.exec(rawText)) !== null) {
      if (!isOverlapping(match.index, match.index + match[0].length)) {
        const markTypeStr = match[1] || 'ごま';
        const text = match[2];
        const mark = this.parseJapaneseMarkType(markTypeStr);
        extractedSpans.push({
          type: 'bouten',
          text,
          mark,
          raw: match[0],
          rawFrom: match.index,
          rawTo: match.index + match[0].length,
          syntaxFormat: 'aozora',
        });
      }
    }

    // 5. HTML tags (<span class="...">...</span> or <em class="...">...</em>)
    const htmlTagRe = /<(span|em|emphasis)\b([^>]*?)>([\s\S]*?)<\/\1>/gi;
    while ((match = htmlTagRe.exec(rawText)) !== null) {
      const fullTag = match[0];
      const attrs = match[2];
      const innerText = match[3];

      if (!isOverlapping(match.index, match.index + fullTag.length)) {
        const isBoutenHtml =
          /class=["'][^"']*\b(bouten|emphasis)\b[^"']*["']/i.test(attrs) ||
          /style=["'][^"']*text-emphasis[^"']*["']/i.test(attrs);

        if (isBoutenHtml) {
          const mark = this.parseHtmlMarkType(attrs);
          extractedSpans.push({
            type: 'bouten',
            text: innerText,
            mark,
            raw: fullTag,
            rawFrom: match.index,
            rawTo: match.index + fullTag.length,
            syntaxFormat: 'narou',
          });
        }
      }
    }

    // Sort extracted spans by rawFrom position
    extractedSpans.sort((a, b) => a.rawFrom - b.rawFrom);

    // Build contiguous spans array (alternating text and bouten)
    const spans: BoutenSyntaxSpan[] = [];
    let currentPos = 0;

    for (const span of extractedSpans) {
      if (span.rawFrom > currentPos) {
        spans.push({
          type: 'text',
          raw: rawText.slice(currentPos, span.rawFrom),
          rawFrom: currentPos,
          rawTo: span.rawFrom,
        });
      }
      spans.push(span);
      currentPos = span.rawTo;
    }

    if (currentPos < rawText.length) {
      spans.push({
        type: 'text',
        raw: rawText.slice(currentPos),
        rawFrom: currentPos,
        rawTo: rawText.length,
      });
    }

    return {
      spans,
      rawText,
      extractedSpans,
    };
  }

  /**
   * Extracts all bouten spans from raw text.
   */
  static extract(rawText: string): BoutenSpan[] {
    return this.parse(rawText).extractedSpans;
  }

  /**
   * Strips all bouten markup tags, leaving pure plain text.
   * e.g. "これ《《重要》》です" -> "これ重要です"
   */
  static strip(rawText: string): string {
    const { spans } = this.parse(rawText);
    return spans
      .map((s) => (s.type === 'text' ? s.raw : s.text))
      .join('');
  }

  /**
   * Replaces each bouten span in raw text using a custom replacer callback.
   */
  static replace(rawText: string, replacer: (span: BoutenSpan) => string): string {
    const { spans } = this.parse(rawText);
    return spans
      .map((s) => (s.type === 'text' ? s.raw : replacer(s)))
      .join('');
  }

  /**
   * Transforms the mark type of all bouten occurrences in the raw text while maintaining syntax style.
   */
  static transformMark(rawText: string, targetMark: BoutenType): string {
    return this.replace(rawText, (span) => {
      const format: BoutenFormat = span.syntaxFormat === 'angle' ? 'kakuyomu' : span.syntaxFormat;
      return this.formatSpan(span.text, targetMark, format);
    });
  }

  /**
   * Converts all bouten markup in raw text to a specified target format.
   */
  static convertFormat(
    rawText: string,
    targetFormat: BoutenFormat,
    options: ConvertOptions = {}
  ): string {
    const { defaultMark = 'sesame', useCssInline = false, classPrefix = 'bouten' } = options;

    const { spans } = this.parse(rawText);

    return spans
      .map((s) => {
        if (s.type === 'text') {
          return s.raw;
        }

        const mark = s.mark || defaultMark;

        if (targetFormat === 'css-emphasis') {
          return `${s.text} [CSS: ${this.toCss(mark)}]`;
        }

        return this.formatSpan(s.text, mark, targetFormat, { useCssInline, classPrefix });
      })
      .join('');
  }

  /**
   * Formats a single text segment and mark type into target format syntax string.
   */
  static formatSpan(
    text: string,
    mark: BoutenType,
    targetFormat: BoutenFormat,
    options?: { useCssInline?: boolean; classPrefix?: string }
  ): string {
    const classPrefix = options?.classPrefix || 'bouten';
    const useCssInline = Boolean(options?.useCssInline);

    switch (targetFormat) {
      case 'kakuyomu':
        // Kakuyomu standard only supports 《《...》》
        return `《《${text}》》`;

      case 'aozora':
        // Aozora Bunko format
        if (mark === 'sesame') {
          return `［＃「${text}」に傍点］`;
        }
        const label = this.MARK_LABELS[mark] || 'ごま';
        return `［＃「${text}」に${label}傍点］`;

      case 'narou':
      case 'html': {
        if (useCssInline) {
          const cssStyle = this.toCss(mark);
          return `<span style="text-emphasis-style: ${cssStyle}; -webkit-text-emphasis-style: ${cssStyle};">${text}</span>`;
        }

        if (mark === 'sesame') {
          return `<span class="${classPrefix}">${text}</span>`;
        }
        return `<span class="${classPrefix} ${classPrefix}-${mark}">${text}</span>`;
      }

      case 'css-emphasis':
        return `${text} [CSS: ${this.toCss(mark)}]`;
    }
  }

  /**
   * Returns standard CSS text-emphasis-style value string for given mark type.
   */
  static toCss(mark: BoutenType): string {
    return this.CSS_MARK_MAP[mark] || 'sesame';
  }

  /**
   * Returns object containing full CSS properties for given mark type.
   */
  static getCssStyle(mark: BoutenType): {
    'text-emphasis-style': string;
    '-webkit-text-emphasis-style': string;
  } {
    const cssValue = this.toCss(mark);
    return {
      'text-emphasis-style': cssValue,
      '-webkit-text-emphasis-style': cssValue,
    };
  }

  /**
   * Renders raw text directly to semantic HTML string with bouten styles.
   */
  static toHtml(rawText: string, options: ConvertOptions = {}): string {
    return this.convertFormat(rawText, 'html', options);
  }

  /**
   * Maps Japanese mark type string (from Aozora) to BoutenType enum value.
   */
  private static parseJapaneseMarkType(label?: string): BoutenType {
    if (!label) return 'sesame';
    if (label.includes('丸') && (label.includes('黒') || label === '丸')) return 'bullet';
    if (label.includes('白丸')) return 'circle';
    if (label.includes('二重丸') || label.includes('蛇の目')) return 'double-circle';
    if (label.includes('三角')) return 'triangle';
    if (label.includes('ごま')) return 'sesame';
    return 'sesame';
  }

  /**
   * Maps HTML attributes/classes to BoutenType enum value.
   */
  private static parseHtmlMarkType(attrs: string): BoutenType {
    const lower = attrs.toLowerCase();

    if (lower.includes('double-circle') || lower.includes('蛇の目') || lower.includes('二重丸')) {
      return 'double-circle';
    }
    if (lower.includes('bullet') || lower.includes('filled circle') || lower.includes('黒丸')) {
      return 'bullet';
    }
    if (lower.includes('circle') || lower.includes('open circle') || lower.includes('白丸')) {
      return 'circle';
    }
    if (lower.includes('triangle') || lower.includes('三角')) {
      return 'triangle';
    }
    if (lower.includes('sesame') || lower.includes('ごま')) {
      return 'sesame';
    }

    return 'sesame';
  }
}
