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
        // カーソル非接触時: タグをCSSで不可視・縮小化し、本文を見出しスタイルで装飾（DOM削除による再計算崩れを物理遮断）
        widgets.push(Decoration.mark({ class: 'cm-heading-tag-hidden' }).range(rawFrom, contentFrom));
        if (contentTo > contentFrom) {
          widgets.push(Decoration.mark({ class: spec.cssClass }).range(contentFrom, contentTo));
        }
        widgets.push(Decoration.mark({ class: 'cm-heading-tag-hidden' }).range(contentTo, rawTo));
      } else {
        // カーソル接触時: 編集のためタグを表示しつつ、見出しスタイルも維持
        if (contentTo > contentFrom) {
          widgets.push(Decoration.mark({ class: spec.cssClass }).range(contentFrom, contentTo));
        }
      }

      searchStart = rawTo;
    }
  }

  // Scan Markdown headings (#, ##, ###)
  const mdHeadingRegex = /^(\s*)(#{1,3})\s+(.*)$/gm;
  let mdMatch: RegExpExecArray | null;
  while ((mdMatch = mdHeadingRegex.exec(docText)) !== null) {
    const rawFrom = mdMatch.index;
    const rawTo = rawFrom + mdMatch[0].length;
    const prefixLen = mdMatch[1].length;
    const hashesLen = mdMatch[2].length;
    const tagFrom = rawFrom + prefixLen;
    const contentFrom = tagFrom + hashesLen + 1; // skip '# '
    const contentTo = rawTo;

    const level = hashesLen;
    const cssClass = level === 1 ? 'cm-heading-daimidashi' : level === 2 ? 'cm-heading-nakamidashi' : 'cm-heading-komidashi';

    const isSelected = selectionRanges.some(
      (r) => r.from <= rawTo && r.to >= rawFrom
    );

    if (!isSelected) {
      if (contentFrom > tagFrom) {
        widgets.push(Decoration.mark({ class: 'cm-heading-tag-hidden' }).range(tagFrom, contentFrom));
      }
      if (contentTo > contentFrom) {
        widgets.push(Decoration.mark({ class: cssClass }).range(contentFrom, contentTo));
      }
    } else {
      if (contentTo > contentFrom) {
        widgets.push(Decoration.mark({ class: cssClass }).range(contentFrom, contentTo));
      }
    }
  }

  // RangeSet は offset 昇順でソートが必要
  widgets.sort((a, b) => a.from - b.from || a.to - b.to);
  return Decoration.set(widgets, true);
}

const headingTheme = EditorView.theme({
  '.cm-heading-tag-hidden': {
    opacity: '0 !important',
    fontSize: '0px !important',
    letterSpacing: '0 !important',
    display: 'inline-block !important',
    width: '0 !important',
    height: '0 !important',
    overflow: 'hidden !important',
    pointerEvents: 'none !important',
  },
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
      if (update.docChanged) {
        this.decorations = parseAndBuildHeadingDecorations(update.view);
      } else if (update.selectionSet) {
        // selectionSet 時は、カーソルが見出し行・タグ付近に存在する場合のみ再計算
        const text = update.view.state.doc.toString();
        if (text.includes('［＃')) {
          this.decorations = parseAndBuildHeadingDecorations(update.view);
        }
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
