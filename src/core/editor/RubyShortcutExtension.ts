import { EditorView, keymap, KeyBinding } from '@codemirror/view';
import { Extension } from '@codemirror/state';
import { RubySyntaxParser } from './RubySyntaxParser.js';

/**
 * CodeMirror 6 Command to convert selected text or preceding kanji into ruby tag notation.
 * Shortcut: Ctrl+R (Cmd+R on macOS).
 */
export function wrapSelectionWithRuby(view: EditorView): boolean {
  const selection = view.state.selection.main;
  const doc = view.state.doc;

  if (selection.from !== selection.to) {
    // Selection exists
    const selectedText = view.state.sliceDoc(selection.from, selection.to);

    // If selection is already ruby syntax, normalize it or unwrap if requested
    const parsed = RubySyntaxParser.parse(selectedText);
    if (parsed.spans.length === 1 && parsed.spans[0].type === 'ruby') {
      const span = parsed.spans[0];
      // Selection is already a ruby tag: strip ruby markup to revert to parent text
      view.dispatch({
        changes: { from: selection.from, to: selection.to, insert: span.parent },
        selection: { anchor: selection.from, head: selection.from + span.parent.length },
      });
      return true;
    }

    // Wrap selection as ｜text《》 with cursor positioned inside 《》
    const replacement = `｜${selectedText}《》`;
    const cursorInsideRuby = selection.from + selectedText.length + 2;

    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: replacement },
      selection: { anchor: cursorInsideRuby, head: cursorInsideRuby },
    });
    return true;
  }

  // No selection (Cursor only): Scan backward for preceding Kanji sequence or text
  const line = doc.lineAt(selection.from);
  const textBeforeCursor = line.text.slice(0, selection.from - line.from);

  // Match preceding Kanji sequence at end of textBeforeCursor
  const kanjiMatch = textBeforeCursor.match(/([\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]+)$/);

  if (kanjiMatch) {
    const kanjiText = kanjiMatch[1];
    const kanjiStart = selection.from - kanjiText.length;
    const replacement = `｜${kanjiText}《》`;
    const cursorInsideRuby = kanjiStart + kanjiText.length + 2;

    view.dispatch({
      changes: { from: kanjiStart, to: selection.from, insert: replacement },
      selection: { anchor: cursorInsideRuby, head: cursorInsideRuby },
    });
    return true;
  }

  // No preceding Kanji: insert blank ruby tag ｜《》 at cursor
  const replacement = '｜《》';
  const cursorInsideRuby = selection.from + 1; // position between ｜ and 《 or inside 《》

  view.dispatch({
    changes: { from: selection.from, to: selection.from, insert: replacement },
    selection: { anchor: cursorInsideRuby + 1, head: cursorInsideRuby + 1 },
  });
  return true;
}

/**
 * Key binding configuration array for Ruby shortcut.
 */
export const rubyKeymap: KeyBinding[] = [
  {
    key: 'Mod-r',
    run: wrapSelectionWithRuby,
    preventDefault: true,
  },
];

/**
 * Returns CodeMirror extension activating Ctrl+R ruby shortcut keymap.
 */
export function rubyShortcutExtension(): Extension {
  return keymap.of(rubyKeymap);
}
