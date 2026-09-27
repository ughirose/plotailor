/**
 * BracketPairChecker - Real-time bracket pair and quote consistency checker for Plotailor IDE.
 *
 * Performs high-performance single-pass stack traversal to detect:
 * - Unmatched closing brackets (閉じ括弧過剰)
 * - Unclosed opening brackets / quotes (閉じ括弧抜け・行単位特定)
 * - Mismatched bracket pair types (括弧種類の不一致, e.g. 「...』)
 *
 * Supports target Japanese bracket pairs:
 * - 「 and 」 (鍵括弧)
 * - 『 and 』 (二重鍵括弧)
 * - （ and ） (丸括弧)
 * - 【 and 】 (角括弧)
 */

export type OpenBracket = '「' | '『' | '（' | '【';
export type CloseBracket = '」' | '』' | '）' | '】';
export type BracketChar = OpenBracket | CloseBracket;

export type BracketErrorType = 'unmatched_close' | 'unclosed_open' | 'mismatched_pair';

export interface BracketDiagnostic {
  from: number;
  to: number;
  line: number;
  column: number;
  severity: 'error' | 'warning';
  message: string;
  bracket: string;
  type: BracketErrorType;
  expectedBracket?: string;
}

export interface BracketCheckOptions {
  isComposing?: boolean;
}

interface StackEntry {
  char: OpenBracket;
  expectedClose: CloseBracket;
  index: number;
  line: number;
  column: number;
}

const OPEN_TO_CLOSE: Record<OpenBracket, CloseBracket> = {
  '「': '」',
  '『': '』',
  '（': '）',
  '【': '】',
};

const CLOSE_TO_OPEN: Record<CloseBracket, OpenBracket> = {
  '」': '「',
  '』': '『',
  '）': '（',
  '】': '【',
};

const OPEN_BRACKETS = new Set<string>(['「', '『', '（', '【']);
const CLOSE_BRACKETS = new Set<string>(['」', '』', '）', '】']);

export class BracketPairChecker {
  /**
   * Scans document text and returns real-time bracket diagnostics.
   * If `isComposing` is true (e.g. Japanese IME input active), returns empty list to prevent UI jitter.
   */
  public check(text: string, options?: BracketCheckOptions): BracketDiagnostic[] {
    if (options?.isComposing) {
      return [];
    }

    const diagnostics: BracketDiagnostic[] = [];
    const stack: StackEntry[] = [];

    let currentLine = 1;
    let currentColumn = 1;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      if (char === '\n') {
        currentLine++;
        currentColumn = 1;
        continue;
      }

      if (OPEN_BRACKETS.has(char)) {
        const openChar = char as OpenBracket;
        stack.push({
          char: openChar,
          expectedClose: OPEN_TO_CLOSE[openChar],
          index: i,
          line: currentLine,
          column: currentColumn,
        });
      } else if (CLOSE_BRACKETS.has(char)) {
        const closeChar = char as CloseBracket;
        if (stack.length === 0) {
          diagnostics.push({
            from: i,
            to: i + 1,
            line: currentLine,
            column: currentColumn,
            severity: 'error',
            message: `${currentLine}行目 ${currentColumn}列: 閉じ括弧「${closeChar}」に対応する開き括弧がありません`,
            bracket: closeChar,
            type: 'unmatched_close',
            expectedBracket: CLOSE_TO_OPEN[closeChar],
          });
        } else {
          const top = stack[stack.length - 1];
          if (top.expectedClose === closeChar) {
            stack.pop();
          } else {
            // Mismatch or unmatched close
            // If top was opened on the same line or closeChar matches an inner scope mismatch
            if (top.line === currentLine) {
              // Mismatched pair on the same line
              stack.pop();
              diagnostics.push({
                from: i,
                to: i + 1,
                line: currentLine,
                column: currentColumn,
                severity: 'error',
                message: `${currentLine}行目 ${currentColumn}列: 括弧の不一致です。「${top.char}」（${top.line}行目）に対して「${closeChar}」が使われています（期待: 「${top.expectedClose}」）`,
                bracket: closeChar,
                type: 'mismatched_pair',
                expectedBracket: top.expectedClose,
              });
            } else {
              // Check if closeChar matches an earlier bracket in the stack
              let matchIndex = -1;
              for (let s = stack.length - 1; s >= 0; s--) {
                if (stack[s].expectedClose === closeChar) {
                  matchIndex = s;
                  break;
                }
              }

              if (matchIndex !== -1) {
                // Unclosed opening brackets for items above matchIndex
                while (stack.length > matchIndex + 1) {
                  const unclosed = stack.pop()!;
                  diagnostics.push({
                    from: unclosed.index,
                    to: unclosed.index + 1,
                    line: unclosed.line,
                    column: unclosed.column,
                    severity: 'error',
                    message: `${unclosed.line}行目 ${unclosed.column}列: 開き括弧「${unclosed.char}」が閉じられていません（期待: 「${unclosed.expectedClose}」）`,
                    bracket: unclosed.char,
                    type: 'unclosed_open',
                    expectedBracket: unclosed.expectedClose,
                  });
                }
                // Now pop the matching bracket
                stack.pop();
              } else {
                // closeChar doesn't match anything in stack
                diagnostics.push({
                  from: i,
                  to: i + 1,
                  line: currentLine,
                  column: currentColumn,
                  severity: 'error',
                  message: `${currentLine}行目 ${currentColumn}列: 閉じ括弧「${closeChar}」に対応する開き括弧がありません`,
                  bracket: closeChar,
                  type: 'unmatched_close',
                  expectedBracket: CLOSE_TO_OPEN[closeChar],
                });
              }
            }
          }
        }
      }

      currentColumn++;
    }

    // Remaining items on stack are unclosed opening brackets
    for (const top of stack) {
      diagnostics.push({
        from: top.index,
        to: top.index + 1,
        line: top.line,
        column: top.column,
        severity: 'error',
        message: `${top.line}行目 ${top.column}列: 開き括弧「${top.char}」が閉じられていません（期待: 「${top.expectedClose}」）`,
        bracket: top.char,
        type: 'unclosed_open',
        expectedBracket: top.expectedClose,
      });
    }

    // Sort diagnostics by starting position 'from'
    diagnostics.sort((a, b) => a.from - b.from);

    return diagnostics;
  }
}
