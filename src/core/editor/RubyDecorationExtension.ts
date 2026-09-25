import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { EditorState, Extension, Range } from '@codemirror/state';

export interface RubyMatch {
  type: 'ruby';
  rawFrom: number;
  rawTo: number;
  baseText: string;
  rubyText: string;
}

export interface BoutenMatch {
  type: 'bouten';
  rawFrom: number;
  rawTo: number;
  text: string;
}

export type ParsedMatch = RubyMatch | BoutenMatch;

export interface MappingSpan {
  rawFrom: number;
  rawTo: number;
  displayFrom: number;
  displayTo: number;
  delta: number;
}

/**
 * AozoraParser
 * Parses Aozora Bunko style ruby and bouten markup.
 */
export class AozoraParser {
  static parse(text: string): ParsedMatch[] {
    const matches: ParsedMatch[] = [];

    // Syntaxes:
    // 1. Double bracket bouten: 《《傍点文字》》
    const boutenDoubleBracketRegex = /《《([^》\n]+?)》》/g;

    // 2. Aozora tag bouten: ［＃傍点］...［＃傍点終わり］ or [#傍点]...[#傍点終わり]
    const boutenTagRegex = /[［\[]＃傍点[］\]]([^\n［］\[\]]+?)[［\[]＃傍点終わり[］\]]/g;

    // 3. Explicit ruby: ｜親文字《るび》 or |親文字《るび》
    const explicitRubyRegex = /[｜|]([^\n｜|《》]+?)《([^\n《》]+?)》/g;

    // 4. Implicit Kanji ruby: 漢字《かんじ》
    const implicitKanjiRubyRegex = /([\u4e00-\u9faf\u3400-\u4dbf\uf900-\ufaff]+)《([^\n《》]+?)》/g;

    const occupiedRanges: [number, number][] = [];

    const isRangeOccupied = (from: number, to: number) => {
      return occupiedRanges.some(([oFrom, oTo]) => from < oTo && to > oFrom);
    };

    const addMatch = (match: ParsedMatch) => {
      if (!isRangeOccupied(match.rawFrom, match.rawTo)) {
        matches.push(match);
        occupiedRanges.push([match.rawFrom, match.rawTo]);
      }
    };

    let m: RegExpExecArray | null;

    // Scan for double bracket bouten first
    while ((m = boutenDoubleBracketRegex.exec(text)) !== null) {
      addMatch({
        type: 'bouten',
        rawFrom: m.index,
        rawTo: m.index + m[0].length,
        text: m[1],
      });
    }

    // Scan for tag bouten second
    while ((m = boutenTagRegex.exec(text)) !== null) {
      addMatch({
        type: 'bouten',
        rawFrom: m.index,
        rawTo: m.index + m[0].length,
        text: m[1],
      });
    }

    // Scan for explicit ruby third
    while ((m = explicitRubyRegex.exec(text)) !== null) {
      addMatch({
        type: 'ruby',
        rawFrom: m.index,
        rawTo: m.index + m[0].length,
        baseText: m[1],
        rubyText: m[2],
      });
    }

    // Scan for implicit kanji ruby fourth
    while ((m = implicitKanjiRubyRegex.exec(text)) !== null) {
      addMatch({
        type: 'ruby',
        rawFrom: m.index,
        rawTo: m.index + m[0].length,
        baseText: m[1],
        rubyText: m[2],
      });
    }

    matches.sort((a, b) => a.rawFrom - b.rawFrom);
    return matches;
  }
}

/**
 * SourceToDisplayMap
 * Maps character offsets between raw document source text and display text.
 */
export class SourceToDisplayMap {
  constructor(public readonly spans: readonly MappingSpan[]) {}

  rawToDisplay(rawOffset: number): number {
    let accumulatedDelta = 0;
    for (const span of this.spans) {
      if (rawOffset < span.rawFrom) {
        return rawOffset + accumulatedDelta;
      }
      if (rawOffset >= span.rawFrom && rawOffset <= span.rawTo) {
        return span.displayFrom;
      }
      accumulatedDelta = span.delta;
    }
    return rawOffset + accumulatedDelta;
  }

  displayToRaw(displayOffset: number): number {
    let lastSpanDelta = 0;
    for (const span of this.spans) {
      if (displayOffset < span.displayFrom) {
        return displayOffset - lastSpanDelta;
      }
      if (displayOffset >= span.displayFrom && displayOffset <= span.displayTo) {
        const offsetInDisplay = displayOffset - span.displayFrom;
        return span.rawFrom + offsetInDisplay;
      }
      lastSpanDelta = span.delta;
    }
    return displayOffset - lastSpanDelta;
  }
}

export class RubyWidget extends WidgetType {
  constructor(
    public readonly baseText: string,
    public readonly rubyText: string
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const rubyEl = document.createElement('ruby');
    rubyEl.className = 'cm-ruby';

    const baseNode = document.createTextNode(this.baseText);
    const rtEl = document.createElement('rt');
    rtEl.textContent = this.rubyText;

    rubyEl.appendChild(baseNode);
    rubyEl.appendChild(rtEl);
    return rubyEl;
  }

  eq(other: RubyWidget): boolean {
    return (
      other instanceof RubyWidget &&
      other.baseText === this.baseText &&
      other.rubyText === this.rubyText
    );
  }
}

export class BoutenWidget extends WidgetType {
  constructor(public readonly text: string) {
    super();
  }

  toDOM(): HTMLElement {
    const spanEl = document.createElement('span');
    spanEl.className = 'cm-bouten';
    spanEl.textContent = this.text;
    return spanEl;
  }

  eq(other: BoutenWidget): boolean {
    return other instanceof BoutenWidget && other.text === this.text;
  }
}

export function parseAndBuildDecorations(state: EditorState): {
  decorations: DecorationSet;
  map: SourceToDisplayMap;
  matches: ParsedMatch[];
} {
  const docText = state.doc.toString();
  const matches = AozoraParser.parse(docText);
  const selectionRanges = state.selection.ranges;

  const spans: MappingSpan[] = [];
  const widgets: Range<Decoration>[] = [];
  let accumulatedDelta = 0;

  for (const match of matches) {
    const isSelected = selectionRanges.some(
      (r) => r.from <= match.rawTo && r.to >= match.rawFrom
    );

    const displayFrom = match.rawFrom + accumulatedDelta;

    if (match.type === 'ruby') {
      const displayTo = displayFrom + match.baseText.length;
      const currentDelta = match.baseText.length - (match.rawTo - match.rawFrom);
      accumulatedDelta += currentDelta;

      spans.push({
        rawFrom: match.rawFrom,
        rawTo: match.rawTo,
        displayFrom,
        displayTo,
        delta: accumulatedDelta,
      });

      if (!isSelected) {
        const widget = Decoration.replace({
          widget: new RubyWidget(match.baseText, match.rubyText),
        });
        widgets.push(widget.range(match.rawFrom, match.rawTo));
      }
    } else if (match.type === 'bouten') {
      const displayTo = displayFrom + match.text.length;
      const currentDelta = match.text.length - (match.rawTo - match.rawFrom);
      accumulatedDelta += currentDelta;

      spans.push({
        rawFrom: match.rawFrom,
        rawTo: match.rawTo,
        displayFrom,
        displayTo,
        delta: accumulatedDelta,
      });

      if (!isSelected) {
        const widget = Decoration.replace({
          widget: new BoutenWidget(match.text),
        });
        widgets.push(widget.range(match.rawFrom, match.rawTo));
      }
    }
  }

  return {
    decorations: Decoration.set(widgets, true),
    map: new SourceToDisplayMap(spans),
    matches,
  };
}

export const rubyTheme = EditorView.theme({
  '.cm-ruby': {
    rubyPosition: 'over',
    WebkitRubyPosition: 'over',
  },
  '.cm-ruby rt': {
    fontSize: '0.5em',
    lineHeight: '1',
  },
  '.cm-bouten': {
    textEmphasis: 'sesame',
    WebkitTextEmphasis: 'sesame',
    textEmphasisPosition: 'over right',
    WebkitTextEmphasisPosition: 'over right',
  },
  '&.cm-vertical-rl .cm-content': {
    writingMode: 'vertical-rl',
    WebkitWritingMode: 'vertical-rl',
  },
});

export class RubyDecorationPlugin {
  decorations: DecorationSet;
  map: SourceToDisplayMap;
  matches: ParsedMatch[];

  constructor(view: EditorView) {
    const result = parseAndBuildDecorations(view.state);
    this.decorations = result.decorations;
    this.map = result.map;
    this.matches = result.matches;
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.selectionSet) {
      const result = parseAndBuildDecorations(update.state);
      this.decorations = result.decorations;
      this.map = result.map;
      this.matches = result.matches;
    }
  }
}

export const rubyDecorationPlugin = ViewPlugin.fromClass(RubyDecorationPlugin, {
  decorations: (v) => v.decorations,
});

export function rubyDecorationExtension(): Extension {
  return [rubyDecorationPlugin, rubyTheme];
}
