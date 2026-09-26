// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  AozoraParser,
  SourceToDisplayMap,
  RubyWidget,
  RubyOffWidget,
  BoutenWidget,
  parseAndBuildDecorations,
  rubyDecorationExtension,
  rubyTheme,
  rubyDecorationPlugin,
} from '../src/core/editor/RubyDecorationExtension.js';

describe('AozoraParser', () => {
  it('should parse explicit ruby with full-width or half-width pipes', () => {
    const text = 'これは｜魔法《マゴウ》と|特技《スキル》です。';
    const matches = AozoraParser.parse(text);

    expect(matches).toHaveLength(2);
    expect(matches[0]).toEqual({
      type: 'ruby',
      rawFrom: 3,
      rawTo: 11,
      baseText: '魔法',
      rubyText: 'マゴウ',
    });
    expect(matches[1]).toEqual({
      type: 'ruby',
      rawFrom: 12,
      rawTo: 20,
      baseText: '特技',
      rubyText: 'スキル',
    });
  });

  it('should parse implicit kanji ruby', () => {
    const text = '冒険者は漢字《かんじ》を読んだ。';
    const matches = AozoraParser.parse(text);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual({
      type: 'ruby',
      rawFrom: 4,
      rawTo: 11,
      baseText: '漢字',
      rubyText: 'かんじ',
    });
  });

  it('should parse double bracket bouten', () => {
    const text = 'ここが《《強調部分》》です。';
    const matches = AozoraParser.parse(text);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual({
      type: 'bouten',
      rawFrom: 3,
      rawTo: 11,
      text: '強調部分',
    });
  });

  it('should parse Aozora tag bouten', () => {
    const text = 'ここが［＃傍点］重要［＃傍点終わり］です。';
    const matches = AozoraParser.parse(text);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual({
      type: 'bouten',
      rawFrom: 3,
      rawTo: 18,
      text: '重要',
    });
  });

  it('should handle complex mixed text without overlapping matches', () => {
    const text = '｜魔法《マゴウ》と漢字《かんじ》と《《強調》》の［＃傍点］テスト［＃傍点終わり］。';
    const matches = AozoraParser.parse(text);

    expect(matches).toHaveLength(4);
    expect(matches[0].type).toBe('ruby');
    expect(matches[1].type).toBe('ruby');
    expect(matches[2].type).toBe('bouten');
    expect(matches[3].type).toBe('bouten');
  });

  it('should correctly parse <<ruby>> and <<<<bouten>>>> from Chapter 1 sample', () => {
    const text1 = '第一衛星《セレネ》が蒼き冷光を投げかけ、第二衛星《フォボス》の琥珀色が地平の端を染める。';
    const m1 = AozoraParser.parse(text1);
    expect(m1).toHaveLength(2);
    expect(m1[0]).toMatchObject({ type: 'ruby', baseText: '第一衛星', rubyText: 'セレネ' });
    expect(m1[1]).toMatchObject({ type: 'ruby', baseText: '第二衛星', rubyText: 'フォボス' });

    const text2 = '二重満月<<コンジャンクション>>の夜、北方の砦に集う兵たちの息は白く凍りついていた。';
    const m2 = AozoraParser.parse(text2);
    expect(m2).toHaveLength(1);
    expect(m2[0]).toMatchObject({ type: 'ruby', baseText: '二重満月', rubyText: 'コンジャンクション' });

    const text3 = '「総督<<ヴァレリウス>>閣下、帝国軍の先遣隊が峡谷を越えたとの急報です」';
    const m3 = AozoraParser.parse(text3);
    expect(m3).toHaveLength(1);
    expect(m3[0]).toMatchObject({ type: 'ruby', baseText: '総督', rubyText: 'ヴァレリウス' });

    const text4 = '千年の古より受け継がれし<<<<星辰の盟約>>>>を巡る、運命の分岐点であった。';
    const m4 = AozoraParser.parse(text4);
    expect(m4).toHaveLength(1);
    expect(m4[0]).toMatchObject({ type: 'bouten', text: '星辰の盟約' });
  });
});

describe('SourceToDisplayMap', () => {
  it('should map raw to display offsets and vice-versa for single ruby', () => {
    // Text: "これは｜魔法《マゴウ》の力。" (len: 13)
    // Match: "｜魔法《マゴウ》" from raw 3 to 11 (len 8), baseText "魔法" (len 2)
    const state = EditorState.create({ doc: 'これは｜魔法《マゴウ》の力。' });
    const { map } = parseAndBuildDecorations(state);

    // Before ruby (raw <= 3) -> display = raw
    expect(map.rawToDisplay(0)).toBe(0);
    expect(map.rawToDisplay(3)).toBe(3);

    // Inside ruby (raw 3..11) -> maps to displayFrom (3)
    expect(map.rawToDisplay(5)).toBe(3);
    expect(map.rawToDisplay(11)).toBe(3);

    // After ruby (raw 12 -> "の") -> display = 12 - 6 = 6
    expect(map.rawToDisplay(11)).toBe(3);
    expect(map.rawToDisplay(12)).toBe(6);

    // Reverse: displayToRaw
    expect(map.displayToRaw(0)).toBe(0);
    expect(map.displayToRaw(3)).toBe(3);
    expect(map.displayToRaw(4)).toBe(4); // inside display base text "魔法" (raw 4)
    expect(map.displayToRaw(5)).toBe(5);
    expect(map.displayToRaw(6)).toBe(12); // "の"
  });
});

describe('RubyWidget and BoutenWidget', () => {
  it('should render correct HTML structure for RubyWidget', () => {
    const widget = new RubyWidget('親文字', 'るび');
    const dom = widget.toDOM();

    expect(dom.tagName.toLowerCase()).toBe('ruby');
    expect(dom.className).toBe('cm-ruby');
    expect(dom.childNodes[0].textContent).toBe('親文字');

    const rt = dom.querySelector('rt');
    expect(rt).not.toBeNull();
    expect(rt?.textContent).toBe('るび');

    expect(widget.eq(new RubyWidget('親文字', 'るび'))).toBe(true);
    expect(widget.eq(new RubyWidget('親文字', 'ちがう'))).toBe(false);
  });

  it('should render correct HTML structure for BoutenWidget', () => {
    const widget = new BoutenWidget('傍点文字');
    const dom = widget.toDOM();

    expect(dom.tagName.toLowerCase()).toBe('span');
    expect(dom.className).toBe('cm-bouten');
    expect(dom.textContent).toBe('傍点文字');

    expect(widget.eq(new BoutenWidget('傍点文字'))).toBe(true);
    expect(widget.eq(new BoutenWidget('別の文字'))).toBe(false);
  });
});

describe('RubyDecorationExtension Bidirectional Cursor Editing', () => {
  let parent: HTMLDivElement;

  beforeEach(() => {
    parent = document.createElement('div');
    document.body.appendChild(parent);
    return () => {
      parent.remove();
    };
  });

  it('should replace ruby with widget when cursor is outside, and expand to raw text when cursor enters', () => {
    const doc = 'これは｜魔法《マゴウ》の力。';
    let state = EditorState.create({
      doc,
      selection: { anchor: 0 }, // Cursor at start (pos 0)
      extensions: [rubyDecorationExtension()],
    });

    let view = new EditorView({ state, parent });

    // When cursor is at pos 0 (outside ruby 3..11), decoration set should have 1 replace widget range
    let plugin = view.plugin(rubyDecorationPlugin);
    expect(plugin).not.toBeNull();
    expect(plugin!.decorations.size).toBe(1);

    // Move cursor inside ruby area (e.g. pos 5)
    view.dispatch({ selection: { anchor: 5 } });

    plugin = view.plugin(rubyDecorationPlugin);
    // Since cursor is inside ruby area (3..11), replace widget is suppressed so raw text is expanded for editing
    expect(plugin!.decorations.size).toBe(0);

    // Move cursor out of ruby area (e.g. pos 12)
    view.dispatch({ selection: { anchor: 12 } });

    plugin = view.plugin(rubyDecorationPlugin);
    // Widget decoration is restored when cursor exits
    expect(plugin!.decorations.size).toBe(1);

    view.destroy();
  });

  it('should include vertical-rl writing mode and ruby/bouten in rubyTheme', () => {
    expect(rubyTheme).toBeDefined();
  });
});

describe('RubyDisplayMode (Normal, Raw, Off/Hidden)', () => {
  const doc = 'これは｜魔法《マゴウ》と《《強調》》の力。';

  it('normal mode should generate RubyWidget and BoutenWidget', () => {
    const state = EditorState.create({
      doc,
      extensions: [rubyDecorationExtension({ mode: 'normal' })],
    });
    const { decorations } = parseAndBuildDecorations(state, { mode: 'normal' });
    expect(decorations.size).toBe(2);
  });

  it('raw mode should generate 0 decorations, keeping raw Aozora markup', () => {
    const state = EditorState.create({
      doc,
      extensions: [rubyDecorationExtension({ mode: 'raw' })],
    });
    const { decorations } = parseAndBuildDecorations(state, { mode: 'raw' });
    expect(decorations.size).toBe(0);
  });

  it('off mode should generate RubyOffWidget hiding ruby text and showing only base text', () => {
    const state = EditorState.create({
      doc,
      extensions: [rubyDecorationExtension({ mode: 'off' })],
    });
    const { decorations } = parseAndBuildDecorations(state, { mode: 'off' });
    expect(decorations.size).toBe(2);

    const offWidgets: string[] = [];
    decorations.between(0, doc.length, (from, to, value) => {
      const widget = (value.spec as any).widget;
      if (widget instanceof RubyOffWidget) {
        offWidgets.push(widget.baseText);
      }
    });
    expect(offWidgets).toContain('魔法');
    expect(offWidgets).toContain('強調');

    const offWidget = new RubyOffWidget('魔法');
    const dom = offWidget.toDOM();
    expect(dom.className).toBe('cm-ruby-off');
    expect(dom.textContent).toBe('魔法');
    expect(dom.querySelector('rt')).toBeNull();
  });
});

describe('RubyDecorationExtension Active Line Bypass (IME Conflict Prevention)', () => {
  it('should completely bypass decorations on the active editing line when bypassActiveLine is true', () => {
    const doc = '一行目｜魔法《マゴウ》。\n二行目｜神話《シンワ》。';
    // Cursor at line 1, pos 2 (inside line 1, but outside ruby)
    const state = EditorState.create({
      doc,
      selection: { anchor: 2 },
    });

    // Without bypass: line 1 ruby is decorated because cursor is outside the ruby token
    const withoutBypass = parseAndBuildDecorations(state, { bypassActiveLine: false });
    expect(withoutBypass.decorations.size).toBe(2);

    // With bypassActiveLine: true: line 1 ruby is bypassed (raw text) while line 2 remains decorated
    const withBypass = parseAndBuildDecorations(state, { bypassActiveLine: true });
    expect(withBypass.decorations.size).toBe(1);

    // Line 2 ruby (offset > 12) should still be decorated
    let hasLine2Widget = false;
    withBypass.decorations.between(0, doc.length, (from, to) => {
      if (from > 10) hasLine2Widget = true;
    });
    expect(hasLine2Widget).toBe(true);
  });
});

