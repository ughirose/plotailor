import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from '@codemirror/view';
import { Extension, Range } from '@codemirror/state';

/**
 * AozoraHeadingExtension.ts
 * 
 * 青空文庫見出し記法（大見出し・中見出し・小見出し）をCodeMirror 6エディタ上で
 * インライン装飾（フォント拡大・太字）として動的レンダリングする拡張機能。
 * カーソル非接触時はタグ記法を折りたたみ、接触時は編集用にタグを展開する。
 */

interface HeadingSpec {
  level: number;
  openTag: string;
  closeTag: string;
  cssClass: string;
}

const HEADING_SPECS: HeadingSpec[] = [
  { level: 1, openTag: '［＃大見出し］', closeTag: '［＃大見出し終わり］', cssClass: 'cm-heading-daimidashi' },
  { level: 2, openTag: '［＃中見出し］', closeTag: '［＃中見出し終わり］', cssClass: 'cm-heading-nakamidashi' },
  { level: 3, openTag: '［＃小見出し］', closeTag: '［＃小見出し終わり］', cssClass: 'cm-heading-komidashi' },
];

export function parseAndBuildHeadingDecorations(view: EditorView): DecorationSet {
  const docText = view.state.doc.toString();
  const selectionRanges = view.state.selection.ranges;
  const widgets: Range<Decoration>[] = [];

  for (const spec of HEADING_SPECS) {
    let searchStart = 0;
    while (searchStart < docText.length) {
      const openIdx = docText.indexOf(spec.openTag, searchStart);
      if (openIdx === -1) break;

      const closeIdx = docText.indexOf(spec.closeTag, openIdx + spec.openTag.length);
      if (closeIdx === -1) {
        searchStart = openIdx + spec.openTag.length;
        continue;
      }

      const rawFrom = openIdx;
      const rawTo = closeIdx + spec.closeTag.length;
      const contentFrom = openIdx + spec.openTag.length;
      const contentTo = closeIdx;

      const isSelected = selectionRanges.some(
        (r) => r.from <= rawTo && r.to >= rawFrom
      );

      if (!isSelected) {
        // カーソル非接触時: タグを非表示にし、本文を見出しスタイルで装飾
        widgets.push(Decoration.replace({}).range(rawFrom, contentFrom));
        if (contentTo > contentFrom) {
          widgets.push(Decoration.mark({ class: spec.cssClass }).range(contentFrom, contentTo));
        }
        widgets.push(Decoration.replace({}).range(contentTo, rawTo));
      } else {
        // カーソル接触時: 編集のためタグを表示しつつ、見出しスタイルも維持
        if (contentTo > contentFrom) {
          widgets.push(Decoration.mark({ class: spec.cssClass }).range(contentFrom, contentTo));
        }
      }

      searchStart = rawTo;
    }
  }

  // RangeSet は offset 昇順でソートが必要
  widgets.sort((a, b) => a.from - b.from || a.to - b.to);
  return Decoration.set(widgets, true);
}

const headingTheme = EditorView.theme({
  '.cm-heading-daimidashi': {
    fontSize: '1.35em !important',
    fontWeight: '700 !important',
    letterSpacing: '0.05em !important',
    color: 'var(--color-gold, #cfa85c) !important',
  },
  '.cm-heading-nakamidashi': {
    fontSize: '1.2em !important',
    fontWeight: '700 !important',
    color: 'var(--color-primary, #58a6ff) !important',
  },
  '.cm-heading-komidashi': {
    fontSize: '1.1em !important',
    fontWeight: '600 !important',
    color: 'var(--color-text, #e6edf3) !important',
  },
});

export const aozoraHeadingPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = parseAndBuildHeadingDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.view.composing) return;
      if (update.docChanged || update.selectionSet) {
        this.decorations = parseAndBuildHeadingDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

export function aozoraHeadingExtension(): Extension {
  return [headingTheme, aozoraHeadingPlugin];
}
