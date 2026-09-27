/**
 * ExclamationSpacingFormatter - Automatic full-width space insertion formatter
 * for Japanese exclamation marks (！ / !) and question marks (？ / ?).
 *
 * Strict compliance with Japanese novel typography standards and 3-Pane IDE Constitution:
 * - Inserts a full-width space (　) immediately after 感嘆符 (！) and 疑問符 (？) when followed by text.
 * - Exempts positions directly before closing brackets (」, 』, ）, etc.), newlines, and EOF.
 * - Handles consecutive marks (e.g. ！？, ！！, ？？) correctly by placing space after the final mark.
 * - Respects IME composition state (skips processing while active).
 */

export interface ExclamationSpacingDiagnostic {
  from: number;
  to: number;
  severity: 'warning' | 'info';
  message: string;
  char: string;
  fixable: boolean;
}

export interface ExclamationSpacingOptions {
  isComposing?: boolean;
  convertHalfWidthToFullWidth?: boolean;
  skipAtLineEnd?: boolean;
  skipBeforeClosingBracket?: boolean;
}

const DEFAULT_OPTIONS: Required<Omit<ExclamationSpacingOptions, 'isComposing'>> = {
  convertHalfWidthToFullWidth: true,
  skipAtLineEnd: true,
  skipBeforeClosingBracket: true,
};

// Set of closing brackets in Japanese typography and standard punctuation
const CLOSING_BRACKETS = new Set([
  '」', '』', '）', '］', '}', ']', ')', '”', '’', '＞', '>', '≫', '»', '›', '】', '〉', '〕', '』', '’'
]);

const EXCLAMATION_QUESTION_MARKS = new Set(['！', '？', '!', '?']);

export class ExclamationSpacingFormatter {
  /**
   * Checks if a character is an exclamation or question mark (full-width or half-width).
   */
  public static isExclamationOrQuestion(char: string): boolean {
    return EXCLAMATION_QUESTION_MARKS.has(char);
  }

  /**
   * Scans text and returns diagnostics for missing full-width spaces after ！ and ？.
   */
  public lint(
    text: string,
    options?: ExclamationSpacingOptions
  ): ExclamationSpacingDiagnostic[] {
    if (options?.isComposing) {
      return [];
    }

    const opts = { ...DEFAULT_OPTIONS, ...options };
    const diagnostics: ExclamationSpacingDiagnostic[] = [];
    const len = text.length;

    let i = 0;
    while (i < len) {
      const char = text[i];

      if (!ExclamationSpacingFormatter.isExclamationOrQuestion(char)) {
        i++;
        continue;
      }

      // Find the end of the consecutive exclamation/question mark sequence
      let sequenceStart = i;
      let sequenceEnd = i;
      while (
        sequenceEnd + 1 < len &&
        ExclamationSpacingFormatter.isExclamationOrQuestion(text[sequenceEnd + 1])
      ) {
        sequenceEnd++;
      }

      const nextCharIdx = sequenceEnd + 1;
      const hasHalfWidthMark = Array.from(text.slice(sequenceStart, sequenceEnd + 1)).some(
        (c) => c === '!' || c === '?'
      );

      // Check if space is needed after sequenceEnd
      if (nextCharIdx >= len) {
        // End of document -> no space required
        if (opts.convertHalfWidthToFullWidth && hasHalfWidthMark) {
          diagnostics.push({
            from: sequenceStart,
            to: sequenceEnd + 1,
            severity: 'info',
            message: '半角の感嘆符・疑問符を全角（！・？）に変換できます',
            char: text.slice(sequenceStart, sequenceEnd + 1),
            fixable: true,
          });
        }
        i = sequenceEnd + 1;
        continue;
      }

      const nextChar = text[nextCharIdx];

      // Exceptions:
      // 1. Followed by newline (\n or \r)
      if (opts.skipAtLineEnd && (nextChar === '\n' || nextChar === '\r')) {
        if (opts.convertHalfWidthToFullWidth && hasHalfWidthMark) {
          diagnostics.push({
            from: sequenceStart,
            to: sequenceEnd + 1,
            severity: 'info',
            message: '半角の感嘆符・疑問符を全角（！・？）に変換できます',
            char: text.slice(sequenceStart, sequenceEnd + 1),
            fixable: true,
          });
        }
        i = sequenceEnd + 1;
        continue;
      }

      // 2. Followed by closing bracket
      if (opts.skipBeforeClosingBracket && CLOSING_BRACKETS.has(nextChar)) {
        if (opts.convertHalfWidthToFullWidth && hasHalfWidthMark) {
          diagnostics.push({
            from: sequenceStart,
            to: sequenceEnd + 1,
            severity: 'info',
            message: '半角の感嘆符・疑問符を全角（！・？）に変換できます',
            char: text.slice(sequenceStart, sequenceEnd + 1),
            fixable: true,
          });
        }
        i = sequenceEnd + 1;
        continue;
      }

      // 3. Already followed by full-width space
      if (nextChar === '　') {
        if (opts.convertHalfWidthToFullWidth && hasHalfWidthMark) {
          diagnostics.push({
            from: sequenceStart,
            to: sequenceEnd + 1,
            severity: 'info',
            message: '半角の感嘆符・疑問符を全角（！・？）に変換できます',
            char: text.slice(sequenceStart, sequenceEnd + 1),
            fixable: true,
          });
        }
        i = sequenceEnd + 1;
        continue;
      }

      // Violation found! (Missing full-width space or using half-width space)
      const isHalfWidthSpace = nextChar === ' ';
      diagnostics.push({
        from: sequenceStart,
        to: nextCharIdx + (isHalfWidthSpace ? 1 : 0),
        severity: 'warning',
        message: isHalfWidthSpace
          ? '感嘆符・疑問符の直後は半角空白ではなく全角空白（　）を挿入してください'
          : '感嘆符・疑問符の直後に全角空白（　）がありません',
        char: text.slice(sequenceStart, sequenceEnd + 1),
        fixable: true,
      });

      i = sequenceEnd + 1;
    }

    return diagnostics;
  }

  /**
   * Formats text by inserting full-width spaces after exclamation and question marks
   * and optionally converting half-width !/? to full-width ！/？.
   */
  public format(
    text: string,
    options?: ExclamationSpacingOptions
  ): { formattedText: string; fixesApplied: number } {
    if (options?.isComposing) {
      return { formattedText: text, fixesApplied: 0 };
    }

    const opts = { ...DEFAULT_OPTIONS, ...options };
    let fixesApplied = 0;
    let result = '';
    const len = text.length;

    let i = 0;
    while (i < len) {
      const char = text[i];

      if (!ExclamationSpacingFormatter.isExclamationOrQuestion(char)) {
        result += char;
        i++;
        continue;
      }

      // Sequence of exclamation/question marks
      let sequenceStart = i;
      let sequenceEnd = i;
      while (
        sequenceEnd + 1 < len &&
        ExclamationSpacingFormatter.isExclamationOrQuestion(text[sequenceEnd + 1])
      ) {
        sequenceEnd++;
      }

      let sequenceText = text.slice(sequenceStart, sequenceEnd + 1);

      // Convert half-width ! and ? to full-width if option enabled
      if (opts.convertHalfWidthToFullWidth) {
        const converted = sequenceText.replace(/!/g, '！').replace(/\?/g, '？');
        if (converted !== sequenceText) {
          fixesApplied++;
          sequenceText = converted;
        }
      }

      result += sequenceText;

      const nextCharIdx = sequenceEnd + 1;
      if (nextCharIdx >= len) {
        // EOF
        i = sequenceEnd + 1;
        continue;
      }

      const nextChar = text[nextCharIdx];

      // Check exceptions
      const isAtLineEnd = opts.skipAtLineEnd && (nextChar === '\n' || nextChar === '\r');
      const isBeforeClosingBracket = opts.skipBeforeClosingBracket && CLOSING_BRACKETS.has(nextChar);
      const isAlreadyFullWidthSpace = nextChar === '　';

      if (isAtLineEnd || isBeforeClosingBracket || isAlreadyFullWidthSpace) {
        i = sequenceEnd + 1;
        continue;
      }

      // Insert full-width space or replace half-width space
      if (nextChar === ' ') {
        result += '　';
        fixesApplied++;
        i = nextCharIdx + 1; // Consume half-width space
      } else {
        result += '　';
        fixesApplied++;
        i = sequenceEnd + 1;
      }
    }

    return { formattedText: result, fixesApplied };
  }
}
