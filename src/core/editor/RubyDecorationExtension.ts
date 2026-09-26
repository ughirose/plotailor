import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { EditorState, Extension, Range, Facet } from '@codemirror/state';
import { isComposing } from './cm6ImeGuard.js';

export type RubyDisplayMode = 'normal' | 'raw' | 'off';

export interface RubyDecorationConfig {
  mode?: RubyDisplayMode;
  bypassActiveLine?: boolean;
}

export const rubyConfigFacet = Facet.define<RubyDecorationConfig, Required<RubyDecorationConfig>>({
  combine: (values) => {
    return values.reduce<Required<RubyDecorationConfig>>(
      (acc, cur) => ({
        mode: cur.mode ?? acc.mode,
        bypassActiveLine: cur.bypassActiveLine ?? acc.bypassActiveLine,
      }),
      {
        mode: 'normal',
        bypassActiveLine: false,
      }
    );
  },
});

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
    // 1. Bouten: <<<<傍点文字>>>>, 《《傍点文字》》, ＜＜＜＜傍点文字＞＞＞＞
    const boutenFourAngleRegex = /(?:<{4,}|＜{4,})([^\n<>《》＜＞]+?)(?:>{4,}|＞{4,})/g;
    const boutenDoubleBracketRegex = /《《([^》\n]+?)》》/g;

    // 2. Aozora tag bouten: ［＃傍点］...［＃傍点終わり］ or [#傍点]...[#傍点終わり]
    const boutenTagRegex = /[［\[]＃傍点[］\]]([^\n［］\[\]]+?)[［\[]＃傍点終わり[］\]]/g;

    // 3. Explicit ruby: ｜親文字《るび》, |親文字<<るび>>, |親文字＜＜るび＞＞
    const explicitRubyRegex = /[｜|]([^\n｜|《》<>＜＞]+?)(?:《|<<|＜＜)([^\n《》<>＜＞]+?)(?:》|>>|＞＞)/g;

    // 4. Implicit ruby: 漢字/語句《るび》, 語句<<るび>>, 語句＜＜るび＞＞
    // Supports Kanji, Katakana, Alpha-numeric words (e.g. 二重満月, 総督, 第一衛星)
    const implicitRubyRegex = /([一-龠々〆ヵヶ\u3400-\u4dbf\uf900-\ufaff\u30a0-\u30ffA-Za-z0-9]+?)(?:《|<<|＜＜)([^\n《》<>＜＞]+?)(?:》|>>|＞＞)/g;

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

    // Scan for 4-angle bouten first (e.g. <<<<星辰の盟約>>>>)
    while ((m = boutenFourAngleRegex.exec(text)) !== null) {
      addMatch({
        type: 'bouten',
        rawFrom: m.index,
        rawTo: m.index + m[0].length,
        text: m[1],
      });
    }

    // Scan for double bracket bouten second
    while ((m = boutenDoubleBracketRegex.exec(text)) !== null) {
      addMatch({
        type: 'bouten',
        rawFrom: m.index,
        rawTo: m.index + m[0].length,
        text: m[1],
      });
    }

    // Scan for tag bouten third
    while ((m = boutenTagRegex.exec(text)) !== null) {
      addMatch({
        type: 'bouten',
        rawFrom: m.index,
        rawTo: m.index + m[0].length,
        text: m[1],
      });
    }

    // Scan for explicit ruby fourth
    while ((m = explicitRubyRegex.exec(text)) !== null) {
      addMatch({
        type: 'ruby',
        rawFrom: m.index,
        rawTo: m.index + m[0].length,
        baseText: m[1],
        rubyText: m[2],
      });
    }

    // Scan for implicit ruby fifth (e.g. 二重満月<<コンジャンクション>>, 総督<<ヴァレリウス>>)
    while ((m = implicitRubyRegex.exec(text)) !== null) {
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

    const rbEl = document.createElement('rb');
    rbEl.className = 'cm-ruby-base';
    rbEl.textContent = this.baseText;

    const rtEl = document.createElement('rt');
    rtEl.className = 'cm-ruby-text';
    rtEl.textContent = this.rubyText;

    rubyEl.appendChild(rbEl);
    rubyEl.appendChild(rtEl);
    return rubyEl;
  }

  ignoreEvent(): boolean {
    return true;
  }

  eq(other: RubyWidget): boolean {
    return (
      other instanceof RubyWidget &&
      other.baseText === this.baseText &&
      other.rubyText === this.rubyText
    );
  }
}

export class RubyOffWidget extends WidgetType {
  constructor(public readonly baseText: string) {
    super();
  }

  toDOM(): HTMLElement {
    const spanEl = document.createElement('span');
    spanEl.className = 'cm-ruby-off';
    spanEl.textContent = this.baseText;
    return spanEl;
  }

  ignoreEvent(): boolean {
    return true;
  }

  eq(other: RubyOffWidget): boolean {
    return other instanceof RubyOffWidget && other.baseText === this.baseText;
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

  ignoreEvent(): boolean {
    return true;
  }

  eq(other: BoutenWidget): boolean {
    return other instanceof BoutenWidget && other.text === this.text;
  }
}

export function parseAndBuildDecorations(
  state: EditorState,
  config: RubyDecorationConfig = {}
): {
  decorations: DecorationSet;
  map: SourceToDisplayMap;
  matches: ParsedMatch[];
} {
  const mode = config.mode ?? 'normal';
  if (mode === 'raw') {
    return {
      decorations: Decoration.none,
      map: new SourceToDisplayMap([]),
      matches: [],
    };
  }

  const docText = state.doc.toString();
  const matches = AozoraParser.parse(docText);
  const selectionRanges = state.selection.ranges;

  // Active lines collection when bypassActiveLine is active
  const activeLineNumbers = new Set<number>();
  if (config.bypassActiveLine) {
    for (const r of selectionRanges) {
      const startLine = state.doc.lineAt(r.from).number;
      const endLine = state.doc.lineAt(r.to).number;
      for (let l = startLine; l <= endLine; l++) {
        activeLineNumbers.add(l);
      }
    }
  }

  const spans: MappingSpan[] = [];
  const widgets: Range<Decoration>[] = [];
  let accumulatedDelta = 0;

  for (const match of matches) {
    let isSelected = selectionRanges.some(
      (r) => r.from <= match.rawTo && r.to >= match.rawFrom
    );

    if (!isSelected && config.bypassActiveLine) {
      const matchLine = state.doc.lineAt(match.rawFrom).number;
      if (activeLineNumbers.has(matchLine)) {
        isSelected = true; // Bypass decoration completely on active editing line
      }
    }

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
          widget:
            mode === 'off'
              ? new RubyOffWidget(match.baseText)
              : new RubyWidget(match.baseText, match.rubyText),
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
        if (mode !== 'off') {
          const widget = Decoration.replace({
            widget: new BoutenWidget(match.text),
          });
          widgets.push(widget.range(match.rawFrom, match.rawTo));
        } else {
          // Off mode for bouten: strip markup, keep pure text
          const widget = Decoration.replace({
            widget: new RubyOffWidget(match.text),
          });
          widgets.push(widget.range(match.rawFrom, match.rawTo));
        }
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
    display: 'inline-flex',
    position: 'relative',
    verticalAlign: 'baseline',
    textAlign: 'center',
    lineHeight: 'inherit',
    whiteSpace: 'nowrap',
  },
  '.cm-ruby .cm-ruby-base, .cm-ruby rb': {
    display: 'inline',
    lineHeight: 'inherit',
    whiteSpace: 'nowrap',
  },
  '.cm-ruby .cm-ruby-text, .cm-ruby rt': {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    top: '-0.95em',
    fontSize: '0.52em',
    lineHeight: '1',
    userSelect: 'none',
    textAlign: 'center',
    color: 'var(--color-gold, #cfa85c)',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  },
  '.cm-ruby-off': {
    display: 'inline',
    lineHeight: 'inherit',
  },
  '.cm-bouten': {
    textEmphasis: 'sesame',
    WebkitTextEmphasis: 'sesame',
    textEmphasisPosition: 'over right',
    WebkitTextEmphasisPosition: 'over right',
  },
  '&.cm-vertical-rl .cm-content, .vertical-rl & .cm-content, .pane-center.vertical-rl .cm-content': {
    writingMode: 'vertical-rl',
    WebkitWritingMode: 'vertical-rl',
  },
  '&.cm-vertical-rl .cm-ruby, .vertical-rl & .cm-ruby, .pane-center.vertical-rl .cm-ruby': {
    display: 'inline-flex',
    position: 'relative',
    writingMode: 'vertical-rl',
    WebkitWritingMode: 'vertical-rl',
    textAlign: 'center',
    verticalAlign: 'baseline',
    whiteSpace: 'nowrap',
  },
  '&.cm-vertical-rl .cm-ruby .cm-ruby-text, .vertical-rl & .cm-ruby .cm-ruby-text, .pane-center.vertical-rl .cm-ruby .cm-ruby-text, &.cm-vertical-rl .cm-ruby rt, .vertical-rl & .cm-ruby rt, .pane-center.vertical-rl .cm-ruby rt': {
    position: 'absolute',
    top: '50%',
    left: 'auto',
    right: '-0.65em',
    transform: 'translateY(-50%)',
    writingMode: 'vertical-rl',
    WebkitWritingMode: 'vertical-rl',
    fontSize: '0.52em',
    lineHeight: '1',
    userSelect: 'none',
    textAlign: 'center',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  },
});

export class RubyDecorationPlugin {
  decorations: DecorationSet;
  map: SourceToDisplayMap;
  matches: ParsedMatch[];

  constructor(view: EditorView) {
    const config = view.state.facet(rubyConfigFacet);
    const result = parseAndBuildDecorations(view.state, config);
    this.decorations = result.decorations;
    this.map = result.map;
    this.matches = result.matches;
  }

  update(update: ViewUpdate) {
    if (update.view.composing || isComposing(update.state)) {
      // Do NOT replace/rebuild decorations while user is composing with Japanese IME
      return;
    }
    const config = update.state.facet(rubyConfigFacet);
    if (update.docChanged || update.selectionSet) {
      const result = parseAndBuildDecorations(update.state, config);
      this.decorations = result.decorations;
      this.map = result.map;
      this.matches = result.matches;
    }
  }
}

export const rubyDecorationPlugin = ViewPlugin.fromClass(RubyDecorationPlugin, {
  decorations: (v) => v.decorations,
});

export function rubyDecorationExtension(options?: RubyDecorationConfig): Extension {
  return [
    options ? rubyConfigFacet.of(options) : [],
    rubyDecorationPlugin,
    rubyTheme,
  ];
}
