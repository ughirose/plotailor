import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  RubySyntaxParser,
  wrapSelectionWithRuby,
  rubyShortcutExtension,
  ThreePaneWorkspace,
} from '../src/index.js';

describe('RubySyntaxParser - Novel Ruby Parsing & Syntax Normalization', () => {
  describe('Parsing Explicit and Implicit Ruby Markup', () => {
    it('parses explicit full-width pipe ruby markup', () => {
      const text = '彼は｜青空《あおぞら》の下を歩いた。';
      const result = RubySyntaxParser.parse(text);

      expect(result.spans.length).toBe(3);
      expect(result.spans[0]).toEqual({
        type: 'text',
        raw: '彼は',
        rawFrom: 0,
        rawTo: 2,
      });

      expect(result.spans[1]).toEqual({
        type: 'ruby',
        parent: '青空',
        ruby: 'あおぞら',
        raw: '｜青空《あおぞら》',
        rawFrom: 2,
        rawTo: 12,
        isExplicit: true,
        pipeChar: '｜',
      });

      expect(result.spans[2]).toEqual({
        type: 'text',
        raw: 'の下を歩いた。',
        rawFrom: 12,
        rawTo: 19,
      });
    });

    it('parses explicit half-width pipe ruby markup (Kakuyomu / Web style)', () => {
      const text = '彼女は|魔法《マナ》の詠唱を始めた。';
      const result = RubySyntaxParser.parse(text);

      expect(result.spans.length).toBe(3);
      expect(result.spans[1]).toEqual({
        type: 'ruby',
        parent: '魔法',
        ruby: 'マナ',
        raw: '|魔法《マナ》',
        rawFrom: 3,
        rawTo: 11,
        isExplicit: true,
        pipeChar: '|',
      });
    });

    it('parses implicit kanji ruby without prefix pipe', () => {
      const text = '漢字《かんじ》の勉強をする。';
      const result = RubySyntaxParser.parse(text);

      expect(result.spans.length).toBe(3);
      expect(result.spans[0]).toEqual({
        type: 'ruby',
        parent: '漢字',
        ruby: 'かんじ',
        raw: '漢字《かんじ》',
        rawFrom: 0,
        rawTo: 8,
        isExplicit: false,
      });
    });

    it('handles non-kanji before brackets properly when explicit pipe is used', () => {
      const text = '｜WorldCraft《ワールドクラフト》の冒険';
      const result = RubySyntaxParser.parse(text);

      expect(result.spans.length).toBe(2);
      expect(result.spans[0]).toEqual({
        type: 'ruby',
        parent: 'WorldCraft',
        ruby: 'ワールドクラフト',
        raw: '｜WorldCraft《ワールドクラフト》',
        rawFrom: 0,
        rawTo: 22,
        isExplicit: true,
        pipeChar: '｜',
      });
    });
  });

  describe('Auto-Closing Unclosed Brackets', () => {
    it('automatically closes unclosed explicit ruby brackets at end of line/string', () => {
      const unclosed = '彼は｜青空《あおぞら';
      const closed = RubySyntaxParser.autoCloseBrackets(unclosed);

      expect(closed).toBe('彼は｜青空《あおぞら》');
    });

    it('automatically closes unclosed implicit kanji ruby brackets', () => {
      const unclosed = '漢字《かんじ';
      const closed = RubySyntaxParser.autoCloseBrackets(unclosed);

      expect(closed).toBe('漢字《かんじ》');
    });

    it('preserves already valid closed ruby brackets', () => {
      const text = '｜漢字《かんじ》';
      expect(RubySyntaxParser.autoCloseBrackets(text)).toBe('｜漢字《かんじ》');
    });
  });

  describe('Normalization & Format Conversion', () => {
    it('normalizes half-width pipe to full-width pipe for Aozora format', () => {
      const raw = '彼は|青空《あおぞら》と|魔法《マナ》を愛した。';
      const normalized = RubySyntaxParser.normalizeRuby(raw, { pipeStyle: 'fullwidth' });

      expect(normalized).toBe('彼は｜青空《あおぞら》と｜魔法《マナ》を愛した。');
    });

    it('normalizes full-width pipe to half-width pipe for Kakuyomu format', () => {
      const raw = '彼は｜青空《あおぞら》と｜魔法《マナ》を愛した。';
      const normalized = RubySyntaxParser.normalizeRuby(raw, { pipeStyle: 'halfwidth' });

      expect(normalized).toBe('彼は|青空《あおぞら》と|魔法《マナ》を愛した。');
    });

    it('converts implicit kanji ruby to explicit ruby when requested', () => {
      const raw = '漢字《かんじ》と｜青空《あおぞら》';
      const normalized = RubySyntaxParser.normalizeRuby(raw, {
        pipeStyle: 'fullwidth',
        convertImplicitToExplicit: true,
      });

      expect(normalized).toBe('｜漢字《かんじ》と｜青空《あおぞら》');
    });

    it('converts explicit kanji ruby to implicit ruby if base text is purely kanji', () => {
      const raw = '｜漢字《かんじ》と｜WorldCraft《ワールドクラフト》';
      const normalized = RubySyntaxParser.normalizeRuby(raw, {
        convertExplicitToImplicitIfPossible: true,
      });

      // 漢字 is pure kanji -> implicit, WorldCraft contains English -> remains explicit
      expect(normalized).toBe('漢字《かんじ》と｜WorldCraft《ワールドクラフト》');
    });

    it('converts between Aozora, Kakuyomu, and Narou target formats', () => {
      const input = '｜漢字《かんじ》と|魔法《マナ》';

      const aozora = RubySyntaxParser.convertFormat(input, 'aozora');
      expect(aozora).toBe('｜漢字《かんじ》と｜魔法《マナ》');

      const kakuyomu = RubySyntaxParser.convertFormat(input, 'kakuyomu');
      expect(kakuyomu).toBe('|漢字《かんじ》と|魔法《マナ》');

      const narou = RubySyntaxParser.convertFormat(input, 'narou');
      expect(narou).toBe('｜漢字《かんじ》と｜魔法《マナ》');
    });
  });

  describe('Auto-Completion Helper', () => {
    it('completes bare pipe base text at cursor offset', () => {
      const text = '彼は｜紫電の剣';
      const completed = RubySyntaxParser.autoCompleteRuby(text, text.length);

      expect(completed.text).toBe('彼は｜紫電の剣《》');
      expect(completed.newCursorOffset).toBe(9); // position inside 《》
    });

    it('completes unclosed bracket at cursor offset', () => {
      const text = '彼は｜紫電の剣《しでんのけん';
      const completed = RubySyntaxParser.autoCompleteRuby(text, text.length);

      expect(completed.text).toBe('動きは｜紫電の剣《しでんのけん》'.replace('動きは', '彼は'));
    });
  });

  describe('Semantic HTML Conversion', () => {
    it('renders ruby markup to HTML ruby tags with escaping', () => {
      const raw = '｜青空《あおぞら》&<幻想>';
      const html = RubySyntaxParser.toHtml(raw);

      expect(html).toBe('<ruby>青空<rt>あおぞら</rt></ruby>&amp;&lt;幻想&gt;');
    });
  });
});

describe('CodeMirror 6 Ruby Shortcut Extension (Ctrl+R / Mod-R)', () => {
  it('wraps non-empty selection in ruby tag notation and positions cursor inside 《》', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);

    const state = EditorState.create({
      doc: '彼は紫電の剣を手にした。',
      selection: { anchor: 2, head: 6 }, // "紫電の剣" selected
      extensions: [rubyShortcutExtension()],
    });

    const view = new EditorView({ state, parent });

    const handled = wrapSelectionWithRuby(view);
    expect(handled).toBe(true);

    const newDoc = view.state.doc.toString();
    expect(newDoc).toBe('彼は｜紫電の剣《》を手にした。');

    const sel = view.state.selection.main;
    expect(sel.from).toBe(9); // position inside 《》
    expect(sel.to).toBe(9);

    view.destroy();
    parent.remove();
  });

  it('unwraps selection if selected text is already a ruby tag', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);

    const initialText = '｜紫電の剣《しでんのけん》';
    const state = EditorState.create({
      doc: initialText,
      selection: { anchor: 0, head: initialText.length },
      extensions: [rubyShortcutExtension()],
    });

    const view = new EditorView({ state, parent });

    const handled = wrapSelectionWithRuby(view);
    expect(handled).toBe(true);

    expect(view.state.doc.toString()).toBe('紫電の剣');

    view.destroy();
    parent.remove();
  });

  it('detects preceding Kanji sequence when no selection is present and wraps it', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);

    const state = EditorState.create({
      doc: '彼は紫電の剣',
      selection: { anchor: 6, head: 6 }, // cursor at end after "紫電の剣"
      extensions: [rubyShortcutExtension()],
    });

    const view = new EditorView({ state, parent });

    const handled = wrapSelectionWithRuby(view);
    expect(handled).toBe(true);

    expect(view.state.doc.toString()).toBe('彼は｜紫電の剣《》');
    const sel = view.state.selection.main;
    expect(sel.from).toBe(9);

    view.destroy();
    parent.remove();
  });

  it('inserts empty ruby tag when no selection or preceding Kanji is present', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);

    const state = EditorState.create({
      doc: 'abc ',
      selection: { anchor: 4, head: 4 },
      extensions: [rubyShortcutExtension()],
    });

    const view = new EditorView({ state, parent });

    const handled = wrapSelectionWithRuby(view);
    expect(handled).toBe(true);

    expect(view.state.doc.toString()).toBe('abc ｜《》');

    view.destroy();
    parent.remove();
  });
});

describe('ThreePaneWorkspace Ruby Integration', () => {
  it('normalizes document ruby syntax and updates workspace state', () => {
    const workspace = new ThreePaneWorkspace({
      initialText: '彼は|青空《あおぞら》を見た。',
    });

    const normalized = workspace.normalizeRuby({ pipeStyle: 'fullwidth' });
    expect(normalized).toBe('彼は｜青空《あおぞら》を見た。');
    expect(workspace.getState().rawText).toBe('彼は｜青空《あおぞら》を見た。');
  });

  it('converts document ruby format to Kakuyomu style', () => {
    const workspace = new ThreePaneWorkspace({
      initialText: '彼は｜青空《あおぞら》を見た。',
    });

    const converted = workspace.convertRubyFormat('kakuyomu');
    expect(converted).toBe('彼は|青空《あおぞら》を見た。');
    expect(workspace.getState().rawText).toBe('彼は|青空《あおぞら》を見た。');
  });
});
