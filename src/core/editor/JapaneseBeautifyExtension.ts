import { EditorState, Extension, Prec } from '@codemirror/state';
import type { ManuscriptMetrics } from '../../types/manuscript-counter.js';

export interface JapaneseBeautifyOptions {
  /**
   * Master switch for Japanese beautification extensions.
   * Default: true
   */
  enabled?: boolean;

  /**
   * Automatically snaps single ellipsis '…' to double '……' and single dash '―' to double '――'.
   * Default: true
   */
  autoSnapYakumono?: boolean;

  /**
   * Automatically closes Japanese brackets (「」, 『』, （）, 【】, 《》, 〈〉).
   * Default: true
   */
  autoCloseBrackets?: boolean;

  /**
   * Automatically inserts full-width space ('　') at the beginning of a new line after pressing Enter.
   * Default: true
   */
  autoIndent?: boolean;

  /**
   * Automatically removes the leading full-width space ('　') when typing dialogue opening brackets ('「', '『').
   * Default: true
   */
  stripIndentOnDialogue?: boolean;
}

const BRACKET_PAIRS: Record<string, string> = {
  '「': '」',
  '『': '』',
  '（': '）',
  '【': '】',
  '《': '》',
  '〈': '〉',
};

const CLOSING_BRACKETS = new Set(Object.values(BRACKET_PAIRS));

/**
 * Calculates high-performance quantitative text metrics for Japanese manuscripts.
 * Meets strict SLA requirement: < 5ms for 100,000+ characters.
 */
export function calculateManuscriptMetrics(text: string): ManuscriptMetrics {
  const rawCharacters = text.length;
  // Strip whitespace characters (\s including \r, \n, \t and full-width space \u3000)
  const trimmed = text.replace(/[\s\u3000]/g, '');
  const trimmedCharacters = trimmed.length;
  // 400-char Genko Yoshi sheet count (20x20 standard)
  const genkoSheets = trimmedCharacters === 0 ? 0 : Math.ceil(trimmedCharacters / 400);
  // Estimated reading time at standard Japanese novel pace (~500 chars/min)
  const estimatedReadingMinutes = trimmedCharacters === 0 ? 0 : Number((trimmedCharacters / 500).toFixed(1));

  return {
    rawCharacters,
    trimmedCharacters,
    genkoSheets,
    estimatedReadingMinutes,
  };
}

/**
 * CodeMirror 6 extension providing real-time Japanese text beautification,
 * bracket auto-pairing, smart indentation, and dialogue leading space removal.
 */
export function japaneseBeautifyExtension(options: JapaneseBeautifyOptions = {}): Extension {
  const {
    enabled = true,
    autoSnapYakumono = true,
    autoCloseBrackets = true,
    autoIndent = true,
    stripIndentOnDialogue = true,
  } = options;

  if (!enabled) {
    return [];
  }

  return Prec.high(
    EditorState.transactionFilter.of((tr) => {
      if (!tr.docChanged) return tr;

      // Only filter single-cursor user insertions
      let changeCount = 0;
      let fromA = 0;
      let toA = 0;
      let inserted = '';

      tr.changes.iterChanges((fA, tA, _fB, _tB, text) => {
        changeCount++;
        fromA = fA;
        toA = tA;
        inserted = text.toString();
      });

      if (changeCount !== 1) return tr;

      const doc = tr.startState.doc;
      const docLen = doc.length;

      // 1. Dialogue leading space removal when typing 「 or 『
      if (stripIndentOnDialogue && (inserted === '「' || inserted === '『') && fromA > 0) {
        const prevChar = doc.sliceString(fromA - 1, fromA);
        const isLineStart = fromA - 1 === 0 || doc.sliceString(fromA - 2, fromA - 1) === '\n';

        if (prevChar === '　' && isLineStart) {
          const closing = autoCloseBrackets ? BRACKET_PAIRS[inserted] : '';
          const insertText = inserted + (closing ?? '');
          return [
            {
              changes: { from: fromA - 1, to: toA, insert: insertText },
              selection: { anchor: fromA - 1 + inserted.length },
            },
          ];
        }
      }

      // 2. Auto-close Japanese brackets
      if (autoCloseBrackets && BRACKET_PAIRS[inserted]) {
        const closing = BRACKET_PAIRS[inserted];
        if (toA > fromA) {
          // Wrap selected text
          const selectedText = doc.sliceString(fromA, toA);
          return [
            {
              changes: { from: fromA, to: toA, insert: `${inserted}${selectedText}${closing}` },
              selection: { anchor: fromA + inserted.length + selectedText.length },
            },
          ];
        } else {
          return [
            {
              changes: { from: fromA, to: toA, insert: `${inserted}${closing}` },
              selection: { anchor: fromA + inserted.length },
            },
          ];
        }
      }

      // 3. Skip over closing bracket if typed right in front of identical closing bracket
      if (autoCloseBrackets && CLOSING_BRACKETS.has(inserted) && fromA === toA && fromA < docLen) {
        const nextChar = doc.sliceString(fromA, fromA + 1);
        if (nextChar === inserted) {
          return [
            {
              selection: { anchor: fromA + 1 },
            },
          ];
        }
      }

      // 4. Snap Yakumono: '…' -> '……' and '―' -> '――'
      if (autoSnapYakumono) {
        if (inserted === '…') {
          const prevChar = fromA > 0 ? doc.sliceString(fromA - 1, fromA) : '';
          const nextChar = toA < docLen ? doc.sliceString(toA, toA + 1) : '';
          if (prevChar !== '…' && nextChar !== '…') {
            return [
              {
                changes: { from: fromA, to: toA, insert: '……' },
                selection: { anchor: fromA + 2 },
              },
            ];
          }
        } else if (inserted === '―' || inserted === '—') {
          const prevChar = fromA > 0 ? doc.sliceString(fromA - 1, fromA) : '';
          const nextChar = toA < docLen ? doc.sliceString(toA, toA + 1) : '';
          if (prevChar !== '―' && prevChar !== '—' && nextChar !== '―' && nextChar !== '—') {
            return [
              {
                changes: { from: fromA, to: toA, insert: '――' },
                selection: { anchor: fromA + 2 },
              },
            ];
          }
        }
      }

      // 5. Smart auto-indent: newline -> newline + full-width space ('　')
      if (autoIndent && (inserted === '\n' || inserted === '\r\n')) {
        return [
          {
            changes: { from: fromA, to: toA, insert: `${inserted}　` },
            selection: { anchor: fromA + inserted.length + 1 },
          },
        ];
      }

      return tr;
    })
  );
}
