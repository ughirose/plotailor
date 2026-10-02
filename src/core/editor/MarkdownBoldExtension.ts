import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from '@codemirror/view';
import { Extension, Range } from '@codemirror/state';

export function parseAndBuildBoldDecorations(view: EditorView): DecorationSet {
  const docText = view.state.doc.toString();
  const selectionRanges = view.state.selection.ranges;
  const widgets: Range<Decoration>[] = [];

  const boldRegex = /\*\*([^\n*]+?)\*\*/g;
  let m: RegExpExecArray | null;

  while ((m = boldRegex.exec(docText)) !== null) {
    const rawFrom = m.index;
    const rawTo = m.index + m[0].length;
    const contentFrom = rawFrom + 2;
    const contentTo = rawTo - 2;

    const isSelected = selectionRanges.some(
      (r) => r.from <= rawTo && r.to >= rawFrom
    );

    if (!isSelected) {
      // Hide the outer ** asterisks and mark the inner text with bold
      widgets.push(Decoration.replace({}).range(rawFrom, contentFrom));
      widgets.push(Decoration.mark({ class: 'cm-bold-text' }).range(contentFrom, contentTo));
      widgets.push(Decoration.replace({}).range(contentTo, rawTo));
    } else {
      // When cursor is inside/touching, keep bold styling while revealing ** for editing
      widgets.push(Decoration.mark({ class: 'cm-bold-text' }).range(contentFrom, contentTo));
    }
  }

  return Decoration.set(widgets, true);
}

const boldTheme = EditorView.theme({
  '.cm-bold-text': {
    fontWeight: 'bold !important',
  },
});

export const markdownBoldPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = parseAndBuildBoldDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.view.composing) return;
      if (update.docChanged || update.selectionSet) {
        this.decorations = parseAndBuildBoldDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

export function markdownBoldExtension(): Extension {
  return [markdownBoldPlugin, boldTheme];
}
