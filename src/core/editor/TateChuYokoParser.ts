/**
 * TateChuYokoParser - Tate-Chu-Yoko (TCY: 縦中横) Auto-Extraction & Markup Parser
 *
 * Designed for Japanese vertical novel formatting in WorldCraft / Plotailor IDE.
 *
 * Features:
 * 1. Auto-detection of 2-digit ASCII numbers ("12", "03", "99") and 2-character exclamation/question mark pairs ("!?", "!!", "?!", "??", "！？", "！！", etc.).
 * 2. Exclusion of 1-digit numbers ("5"), 3+ digit numbers ("123"), and full-width alphanumeric characters ("１２", "ＡＢ").
 * 3. Bidirectional conversion between Aozora Bunko notation (［＃縦中横］...［＃縦中横終わり］), HTML (<span class="tcy">...</span>), and EPUB3 CSS inline style (<span style="text-combine-upright: all; -webkit-text-combine: horizontal;">...</span>).
 * 4. Structured span parsing and markup stripping helper utilities.
 */

export type TcyMatchType = 'number' | 'punctuation' | 'aozora-markup' | 'html-tag';

export interface TcyMatch {
  type: TcyMatchType;
  text: string;
  raw: string;
  rawFrom: number;
  rawTo: number;
  isExplicit: boolean;
}

export interface TcySpan {
  type: 'tcy' | 'text';
  text: string;
  raw: string;
  rawFrom: number;
  rawTo: number;
  isAutoDetected: boolean;
}

export interface TcyParseResult {
  spans: TcySpan[];
  matches: TcyMatch[];
  rawText: string;
}

export interface TcyOptions {
  /**
   * Auto-detect 2-digit numbers ("12", "03", "99").
   * Default: true
   */
  autoDetectDigits?: boolean;

  /**
   * Auto-detect 2-character exclamation/question mark sequences ("!?", "!!", "?!", "??", "！？", "！！").
   * Default: true
   */
  autoDetectPunctuation?: boolean;

  /**
   * HTML class name for TCY spans.
   * Default: 'tcy'
   */
  htmlClass?: string;

  /**
   * EPUB3 CSS inline style string for vertical text combine.
   * Default: 'text-combine-upright: all; -webkit-text-combine: horizontal;'
   */
  epubStyle?: string;
}

const DEFAULT_OPTIONS: Required<TcyOptions> = {
  autoDetectDigits: true,
  autoDetectPunctuation: true,
  htmlClass: 'tcy',
  epubStyle: 'text-combine-upright: all; -webkit-text-combine: horizontal;',
};

// Full-width digits and alphanumerics check
const FULLWIDTH_ALPHANUM_RE = /[\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A]/;

// Exclamation and question mark set
const EXCLAMATION_QUESTION_CHARS = new Set(['!', '?', '！', '？']);

export class TateChuYokoParser {
  /**
   * Checks whether a string qualifies as an auto-detected TCY candidate.
   * Returns true for 2-digit ASCII numbers or 2-character exclamation/question sequences.
   * Returns false for 1-digit, 3+ digits, full-width alphanumerics, etc.
   */
  public static isTcyCandidate(str: string): boolean {
    if (!str || FULLWIDTH_ALPHANUM_RE.test(str)) {
      return false;
    }

    // 2-digit ASCII number check
    if (/^\d{2}$/.test(str)) {
      return true;
    }

    // 2-character exclamation/question pair check
    if (str.length === 2) {
      const char1 = str[0];
      const char2 = str[1];
      if (EXCLAMATION_QUESTION_CHARS.has(char1) && EXCLAMATION_QUESTION_CHARS.has(char2)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Scans raw text for explicit Aozora Bunko TCY markup.
   * Patterns:
   * 1. ［＃縦中横］...［＃縦中横終わり］ or [＃縦中横]...[＃縦中横終わり]
   * 2. ［＃「...」は縦中横］ or [＃「...」は縦中横]
   */
  public static parseAozoraTcy(rawText: string): TcyMatch[] {
    const matches: TcyMatch[] = [];

    // Pattern 1: ［＃縦中横］...［＃縦中横終わり］
    const blockRe = /[［\[]＃縦中横[］\]]([\s\S]*?)[［\[]＃縦中横終わり[］\]]/g;
    let m: RegExpExecArray | null;
    while ((m = blockRe.exec(rawText)) !== null) {
      matches.push({
        type: 'aozora-markup',
        text: m[1],
        raw: m[0],
        rawFrom: m.index,
        rawTo: m.index + m[0].length,
        isExplicit: true,
      });
    }

    // Pattern 2: ［＃「...」は縦中横］
    const inlineRe = /[［\[]＃「([^」\r\n]+)」は縦中横[］\]]/g;
    while ((m = inlineRe.exec(rawText)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      const overlaps = matches.some((existing) => Math.max(start, existing.rawFrom) < Math.min(end, existing.rawTo));
      if (!overlaps) {
        matches.push({
          type: 'aozora-markup',
          text: m[1],
          raw: m[0],
          rawFrom: start,
          rawTo: end,
          isExplicit: true,
        });
      }
    }

    return matches;
  }

  /**
   * Scans raw text for HTML / EPUB3 TCY tags.
   * Patterns:
   * <span class="tcy...">...</span> or <span style="...text-combine-upright...">...</span>
   */
  public static parseHtmlTcy(rawText: string): TcyMatch[] {
    const matches: TcyMatch[] = [];
    const htmlRe = /<span\b[^>]*?(?:class=["'][^"']*?\btcy\b[^"']* nationality ["']|class=["'][^"']*?\btcy\b[^"']*?["']|style=["'][^"']*?text-combine-upright[^"']*?["'])[^>]*?>([\s\S]*?)<\/span>/gi;
    let m: RegExpExecArray | null;
    while ((m = htmlRe.exec(rawText)) !== null) {
      matches.push({
        type: 'html-tag',
        text: m[1],
        raw: m[0],
        rawFrom: m.index,
        rawTo: m.index + m[0].length,
        isExplicit: true,
      });
    }
    return matches;
  }

  /**
   * Auto-detects 2-digit ASCII numbers and exclamation/question mark pairs in raw text.
   * Strictly excludes 1-digit, 3+ digits, full-width alphanumerics, and sequences of 3+ marks.
   */
  public static detectAutoTcy(rawText: string, options?: Partial<TcyOptions>): TcyMatch[] {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const matches: TcyMatch[] = [];

    // 1. Auto-detect 2-digit ASCII numbers
    if (opts.autoDetectDigits) {
      // Look for digit sequences
      const digitSeqRe = /\d+/g;
      let m: RegExpExecArray | null;
      while ((m = digitSeqRe.exec(rawText)) !== null) {
        const numStr = m[0];
        const start = m.index;
        const end = start + numStr.length;

        // Check character before and character after to ensure no adjacent full-width or ASCII digits/alphanumerics
        const prevChar = start > 0 ? rawText[start - 1] : '';
        const nextChar = end < rawText.length ? rawText[end] : '';

        const hasAlphanumBefore = FULLWIDTH_ALPHANUM_RE.test(prevChar) || /[a-zA-Z]/.test(prevChar);
        const hasAlphanumAfter = FULLWIDTH_ALPHANUM_RE.test(nextChar) || /[a-zA-Z]/.test(nextChar);

        // Candidate must be exactly 2 digits and not connected to adjacent alphanumeric chars
        if (numStr.length === 2 && !hasAlphanumBefore && !hasAlphanumAfter) {
          matches.push({
            type: 'number',
            text: numStr,
            raw: numStr,
            rawFrom: start,
            rawTo: end,
            isExplicit: false,
          });
        }
      }
    }

    // 2. Auto-detect 2-character exclamation / question mark sequences ("!?", "!!", "?!", "??", "！？", "！！", etc.)
    if (opts.autoDetectPunctuation) {
      // Find contiguous sequences of exclamation or question marks
      const puncSeqRe = /[!?！？]+/g;
      let m: RegExpExecArray | null;
      while ((m = puncSeqRe.exec(rawText)) !== null) {
        const seq = m[0];
        const start = m.index;
        const end = start + seq.length;

        // Exactly 2-character sequences qualify as TCY
        if (seq.length === 2) {
          matches.push({
            type: 'punctuation',
            text: seq,
            raw: seq,
            rawFrom: start,
            rawTo: end,
            isExplicit: false,
          });
        }
      }
    }

    // Sort all matches by rawFrom position
    matches.sort((a, b) => a.rawFrom - b.rawFrom);

    return matches;
  }

  /**
   * Parse raw text into structured spans (TcySpan[]), identifying explicit TCY markup and auto-detected targets.
   */
  public static parse(rawText: string, options?: Partial<TcyOptions>): TcyParseResult {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Explicit matches (Aozora Bunko notation and HTML tags)
    const explicitMatches: TcyMatch[] = [
      ...this.parseAozoraTcy(rawText),
      ...this.parseHtmlTcy(rawText),
    ];

    // Sort explicit matches by starting index
    explicitMatches.sort((a, b) => a.rawFrom - b.rawFrom);

    // Auto-detected matches
    const autoMatches = this.detectAutoTcy(rawText, opts);

    // Filter autoMatches that overlap with explicit matches
    const validAutoMatches = autoMatches.filter((autoM) => {
      return !explicitMatches.some(
        (expM) => Math.max(autoM.rawFrom, expM.rawFrom) < Math.min(autoM.rawTo, expM.rawTo)
      );
    });

    const allMatches: TcyMatch[] = [...explicitMatches, ...validAutoMatches];
    allMatches.sort((a, b) => a.rawFrom - b.rawFrom);

    const spans: TcySpan[] = [];
    let currentPos = 0;

    for (const match of allMatches) {
      if (match.rawFrom > currentPos) {
        const plainSegment = rawText.slice(currentPos, match.rawFrom);
        spans.push({
          type: 'text',
          text: plainSegment,
          raw: plainSegment,
          rawFrom: currentPos,
          rawTo: match.rawFrom,
          isAutoDetected: false,
        });
      }

      spans.push({
        type: 'tcy',
        text: match.text,
        raw: match.raw,
        rawFrom: match.rawFrom,
        rawTo: match.rawTo,
        isAutoDetected: !match.isExplicit,
      });

      currentPos = match.rawTo;
    }

    if (currentPos < rawText.length) {
      const remaining = rawText.slice(currentPos);
      spans.push({
        type: 'text',
        text: remaining,
        raw: remaining,
        rawFrom: currentPos,
        rawTo: rawText.length,
        isAutoDetected: false,
      });
    }

    return {
      spans,
      matches: allMatches,
      rawText,
    };
  }

  /**
   * Automatically wraps detected 2-digit numbers and exclamation/question mark sequences
   * with Aozora Bunko TCY notation `［＃縦中横］...［＃縦中横終わり］`.
   */
  public static autoMarkup(rawText: string, options?: Partial<TcyOptions>): string {
    const { spans } = this.parse(rawText, options);
    return spans
      .map((span) => {
        if (span.type === 'text') {
          return span.raw;
        }
        // If it's already explicit Aozora markup, keep its raw string; otherwise wrap in Aozora markup
        if (span.raw.startsWith('［＃') || span.raw.startsWith('[＃') || span.raw.startsWith('<span')) {
          return span.raw;
        }
        return `［＃縦中横］${span.text}［＃縦中横終わり］`;
      })
      .join('');
  }

  /**
   * Converts raw text (containing auto-detected candidates or HTML TCY) into standard Aozora Bunko TCY notation.
   */
  public static toAozora(rawText: string, options?: Partial<TcyOptions>): string {
    const { spans } = this.parse(rawText, options);
    return spans
      .map((span) => {
        if (span.type === 'text') {
          return span.raw;
        }
        return `［＃縦中横］${span.text}［＃縦中横終わり］`;
      })
      .join('');
  }

  /**
   * Converts raw text (containing Aozora TCY or auto-detected candidates) into HTML `<span class="tcy">...</span>`.
   */
  public static toHtml(rawText: string, options?: Partial<TcyOptions>): string {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const { spans } = this.parse(rawText, opts);
    return spans
      .map((span) => {
        if (span.type === 'text') {
          return escapeHtml(span.raw);
        }
        return `<span class="${escapeHtml(opts.htmlClass)}">${escapeHtml(span.text)}</span>`;
      })
      .join('');
  }

  /**
   * Converts raw text (containing Aozora TCY or auto-detected candidates) into EPUB3 compliant HTML
   * using inline CSS style `style="text-combine-upright: all; -webkit-text-combine: horizontal;"`.
   */
  public static toEpubHtml(rawText: string, options?: Partial<TcyOptions>): string {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const { spans } = this.parse(rawText, opts);
    return spans
      .map((span) => {
        if (span.type === 'text') {
          return escapeHtml(span.raw);
        }
        return `<span style="${escapeHtml(opts.epubStyle)}">${escapeHtml(span.text)}</span>`;
      })
      .join('');
  }

  /**
   * Removes all TCY markup (Aozora markup and HTML TCY spans), returning plain text.
   */
  public static removeTcyMarkup(rawText: string): string {
    let result = rawText;

    // Remove Aozora ［＃縦中横］...［＃縦中横終わり］
    result = result.replace(/[［\[]＃縦中横[］\]]([\s\S]*?)[［\[]＃縦中横終わり[］\]]/g, '$1');

    // Remove Aozora ［＃「...」は縦中横］
    result = result.replace(/[［\[]＃「([^」\r\n]+)」は縦中横[］\]]/g, '$1');

    // Remove HTML TCY spans
    result = result.replace(/<span\b[^>]*?(?:class=["'][^"']*?\btcy\b[^"']*?["']|style=["'][^"']*?text-combine-upright[^"']*?["'])[^>]*?>([\s\S]*?)<\/span>/gi, '$1');

    return result;
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
