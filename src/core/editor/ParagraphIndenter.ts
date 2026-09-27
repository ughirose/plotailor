/**
 * ParagraphIndenter - Japanese Paragraph Indentation & Batch Formatting Utility
 *
 * Complies with 3-Pane Integrated IDE Constitution:
 * - Detects prose paragraphs missing full-width space indentation (　 / U+3000)
 * - Excludes dialogue lines (会話文 「」, 『』, （）, etc.)
 * - Provides batch apply, batch remove, and toggle utility functions
 * - Strictly typed and orthogonal
 */

export interface ParagraphIndentOptions {
  /**
   * Opening quote characters that indicate dialogue or quoted blocks.
   * Lines starting with these characters will NOT be indented.
   * Default: ['「', '『', '（', '【', '“', '‘', '《', '〈', '〔', '［', '＜', '«', '"', "'"]
   */
  quoteStartChars?: string[];

  /**
   * If true, leading half-width spaces (' ') or tabs ('\t') at line starts
   * are converted or replaced with full-width space ('　') when applying indentation.
   * Default: true
   */
  normalizeHalfWidthSpace?: boolean;

  /**
   * Full-width space character used for indentation.
   * Default: '　' (U+3000)
   */
  indentChar?: string;
}

export type IndentationLineStatus =
  | 'missing-indent'    // Prose line needing full-width space indentation
  | 'already-indented'  // Line already starting with full-width space
  | 'dialogue'          // Dialogue / quote line (starts with 「, 『, etc.)
  | 'empty'             // Empty or whitespace-only line
  | 'half-width-indent';// Line starting with half-width space/tab

export interface IndentationDiagnostic {
  line: number;         // 1-based line number
  from: number;         // Character index in full document where line starts
  to: number;           // Character index in full document where line ends
  content: string;      // Original line content
  status: IndentationLineStatus;
  formatted: string;    // Corrected line content after applyIndent
}

export class ParagraphIndenter {
  public static readonly DEFAULT_QUOTE_CHARS = [
    '「', '『', '（', '【', '“', '‘', '《', '〈', '〔', '［', '＜', '«', '"', "'",
  ];

  public static readonly FULL_WIDTH_SPACE = '　'; // U+3000

  /**
   * Checks if a line starts with a dialogue quote character.
   */
  public static isDialogueLine(line: string, quoteChars = ParagraphIndenter.DEFAULT_QUOTE_CHARS): boolean {
    const trimmedLead = line.trimStart();
    if (trimmedLead.length === 0) return false;
    const firstChar = trimmedLead[0];
    return quoteChars.includes(firstChar);
  }

  /**
   * Analyzes document text and returns line-by-line indentation diagnostics.
   */
  public static analyze(text: string, options?: ParagraphIndentOptions): IndentationDiagnostic[] {
    const quoteChars = options?.quoteStartChars ?? ParagraphIndenter.DEFAULT_QUOTE_CHARS;
    const indentChar = options?.indentChar ?? ParagraphIndenter.FULL_WIDTH_SPACE;
    const normalizeHalfWidth = options?.normalizeHalfWidthSpace ?? true;

    const lines = text.split('\n');
    const diagnostics: IndentationDiagnostic[] = [];
    let currentOffset = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineLen = line.length;
      const from = currentOffset;
      const to = currentOffset + lineLen;
      currentOffset = to + 1; // +1 for '\n'

      // Empty or whitespace-only
      if (line.trim().length === 0) {
        diagnostics.push({
          line: i + 1,
          from,
          to,
          content: line,
          status: 'empty',
          formatted: line,
        });
        continue;
      }

      // Dialogue line starting with quotes
      if (ParagraphIndenter.isDialogueLine(line, quoteChars)) {
        diagnostics.push({
          line: i + 1,
          from,
          to,
          content: line,
          status: 'dialogue',
          formatted: line,
        });
        continue;
      }

      // Already starts with full-width space
      if (line.startsWith(indentChar)) {
        diagnostics.push({
          line: i + 1,
          from,
          to,
          content: line,
          status: 'already-indented',
          formatted: line,
        });
        continue;
      }

      // Starts with half-width space or tab
      if (/^[ \t]/.test(line)) {
        const stripped = normalizeHalfWidth ? line.trimStart() : line;
        const formatted = indentChar + stripped;
        diagnostics.push({
          line: i + 1,
          from,
          to,
          content: line,
          status: 'half-width-indent',
          formatted,
        });
        continue;
      }

      // Prose line missing indentation
      diagnostics.push({
        line: i + 1,
        from,
        to,
        content: line,
        status: 'missing-indent',
        formatted: indentChar + line,
      });
    }

    return diagnostics;
  }

  /**
   * Detects only lines that require indentation (status 'missing-indent' or 'half-width-indent').
   */
  public static detectUnindentedLines(text: string, options?: ParagraphIndentOptions): IndentationDiagnostic[] {
    return ParagraphIndenter.analyze(text, options).filter(
      (d) => d.status === 'missing-indent' || d.status === 'half-width-indent'
    );
  }

  /**
   * Applies full-width paragraph indentation to all unindented prose lines.
   * Dialogue lines and empty lines remain unchanged.
   */
  public static applyIndent(text: string, options?: ParagraphIndentOptions): string {
    const diagnostics = ParagraphIndenter.analyze(text, options);
    return diagnostics.map((d) => d.formatted).join('\n');
  }

  /**
   * Removes full-width paragraph indentation (and leading spaces if configured) from all lines.
   * Dialogue lines starting with quotes remain intact.
   */
  public static removeIndent(text: string, options?: ParagraphIndentOptions): string {
    const quoteChars = options?.quoteStartChars ?? ParagraphIndenter.DEFAULT_QUOTE_CHARS;
    const indentChar = options?.indentChar ?? ParagraphIndenter.FULL_WIDTH_SPACE;

    const lines = text.split('\n');
    return lines
      .map((line) => {
        if (line.trim().length === 0) return line;
        if (ParagraphIndenter.isDialogueLine(line, quoteChars)) return line;

        let result = line;
        if (result.startsWith(indentChar)) {
          result = result.slice(indentChar.length);
        } else if (/^[ \t]/.test(result)) {
          result = result.trimStart();
        }
        return result;
      })
      .join('\n');
  }

  /**
   * Toggles paragraph indentation.
   * If any eligible prose lines are missing indents, applies indents.
   * If all eligible prose lines are already indented, removes indents.
   */
  public static toggleIndent(text: string, options?: ParagraphIndentOptions): string {
    const unindented = ParagraphIndenter.detectUnindentedLines(text, options);
    if (unindented.length > 0) {
      return ParagraphIndenter.applyIndent(text, options);
    } else {
      return ParagraphIndenter.removeIndent(text, options);
    }
  }
}
