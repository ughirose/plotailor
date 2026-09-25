import { describe, it, expect, vi } from 'vitest';
import {
  AozoraParser,
  SourceToDisplayMap,
  ScrollNormalizer,
  VerticalViewport,
} from '../src/index.js';

describe('AozoraParser', () => {
  it('parses explicit ruby syntax ｜親文字《るび》', () => {
    const raw = '彼は｜青空《あおぞら》を見上げた。';
    const html = AozoraParser.toHtml(raw);
    expect(html).toBe('彼は<ruby>青空<rt>あおぞら</rt></ruby>を見上げた。');
  });

  it('parses implicit kanji ruby 漢字《かんじ》 without leading pipe', () => {
    const raw = '彼の名は夜神月《やがみらいと》である。';
    const html = AozoraParser.toHtml(raw);
    expect(html).toBe('彼の名は<ruby>夜神月<rt>やがみらいと</rt></ruby>である。');
  });

  it('parses bouten emphasis markers 《《...》》 and ［＃「...」に傍点］', () => {
    const raw1 = 'それは《《極めて重要》》な伏線だ。';
    expect(AozoraParser.toHtml(raw1)).toBe('それは<span class="bouten">極めて重要</span>な伏線だ。');

    const raw2 = 'ここは［＃「絶対絶命」に傍点］の局面だ。';
    expect(AozoraParser.toHtml(raw2)).toBe('ここは<span class="bouten">絶対絶命</span>の局面だ。');
  });

  it('parses ruby sagari markers 〔...〕', () => {
    const raw = '第一章〔ルビ下がり〕の始まり。';
    expect(AozoraParser.toHtml(raw)).toBe('第一章<span class="ruby-sagari">ルビ下がり</span>の始まり。');
  });

  it('provides precise bidirectional offset mapping via SourceToDisplayMap', () => {
    // raw: ｜青空《あおぞら》の広がり
    // raw length = 1 + 2 + 1 + 4 + 1 + 4 = 13
    // display text = 青空の広がり (length = 2 + 4 = 6)
    const raw = '｜青空《あおぞら》の広がり';
    const { spans, map } = AozoraParser.parse(raw);

    expect(spans.length).toBe(2);
    expect(spans[0].type).toBe('ruby');
    expect(spans[1].type).toBe('text');

    // display offset of raw index 0 (the |)
    const display0 = map.toDisplayOffset(0);
    expect(display0).toBe(0);

    // display offset of after ruby markup (raw offset 9 is start of の)
    const displayAfterRuby = map.toDisplayOffset(9);
    expect(displayAfterRuby).toBe(2);

    // raw offset corresponding to display index 2 ('の')
    const rawBack = map.toRawOffset(2);
    expect(rawBack).toBe(9);
  });
});

describe('ScrollNormalizer', () => {
  it('normalizes wheel delta according to deltaMode', () => {
    const normalizer = new ScrollNormalizer({ lineHeight: 20, pageHeight: 500, multiplier: 1.0 });

    const pixelResult = normalizer.normalizeDeltas({ deltaX: 0, deltaY: 100, deltaMode: 0 });
    expect(pixelResult.pixelDeltaY).toBe(100);

    const lineResult = normalizer.normalizeDeltas({ deltaX: 0, deltaY: 3, deltaMode: 1 });
    expect(lineResult.pixelDeltaY).toBe(60);

    const pageResult = normalizer.normalizeDeltas({ deltaX: 0, deltaY: 2, deltaMode: 2 });
    expect(pageResult.pixelDeltaY).toBe(1000);
  });

  it('converts vertical deltaY into horizontal scroll delta for vertical-rl layout', () => {
    const normalizer = new ScrollNormalizer();

    // Wheel scrolling down (deltaY > 0) in vertical-rl navigates to columns on left (negative scroll delta)
    const scrollDelta = normalizer.computeVerticalRlScroll({ deltaX: 0, deltaY: 50, deltaMode: 0 });
    expect(scrollDelta).toBe(-50);
  });

  it('updates container scrollLeft when handling wheel event', () => {
    const normalizer = new ScrollNormalizer({ preventDefault: true });
    const container = { scrollLeft: 500, scrollWidth: 2000, clientWidth: 800 };
    const preventDefaultSpy = vi.fn();

    const fakeEvent = {
      deltaX: 0,
      deltaY: 100,
      deltaMode: 0,
      preventDefault: preventDefaultSpy,
    } as unknown as WheelEvent;

    const newScrollLeft = normalizer.handleWheel(fakeEvent, container);
    expect(newScrollLeft).toBe(400);
    expect(container.scrollLeft).toBe(400);
    expect(preventDefaultSpy).toHaveBeenCalled();
  });
});

describe('VerticalViewport', () => {
  it('initializes with default vertical-rl and upright orientation', () => {
    const viewport = new VerticalViewport();
    expect(viewport.isVertical()).toBe(true);

    const style = viewport.getContainerStyle();
    expect(style.writingMode).toBe('vertical-rl');
    expect(style.textOrientation).toBe('upright');
    expect(style.direction).toBe('rtl');

    const classes = viewport.getContainerClasses();
    expect(classes).toContain('cm-vertical');
    expect(classes).toContain('writing-mode-vertical');
  });

  it('toggles writing mode between vertical and horizontal', () => {
    const viewport = new VerticalViewport();
    const newMode = viewport.toggleWritingMode();

    expect(newMode).toBe('horizontal-tb');
    expect(viewport.isVertical()).toBe(false);

    const style = viewport.getContainerStyle();
    expect(style.writingMode).toBe('horizontal-tb');
    expect(style.textOrientation).toBe('mixed');
    expect(style.direction).toBe('ltr');

    const classes = viewport.getContainerClasses();
    expect(classes).toContain('cm-horizontal');
  });

  it('clamps font size and line pitch within safe typography ranges', () => {
    const viewport = new VerticalViewport();

    viewport.setFontSize(5); // below min
    expect(viewport.getSettings().fontSize).toBe(10);

    viewport.setFontSize(100); // above max
    expect(viewport.getSettings().fontSize).toBe(36);

    viewport.setLinePitch(0.5); // below min
    expect(viewport.getSettings().linePitch).toBe(1.2);

    viewport.setLinePitch(5.0); // above max
    expect(viewport.getSettings().linePitch).toBe(3.0);
  });

  it('renders inline appearance bar without modals', () => {
    const viewport = new VerticalViewport();
    const bar = viewport.renderInlineAppearanceBar();

    expect(bar).toContain('inline-appearance-bar');
    expect(bar).toContain('toggle-mode-btn');
    expect(bar).toContain('縦書き');
    expect(bar).not.toContain('modal');
  });

  it('notifies subscribers on configuration change', () => {
    const viewport = new VerticalViewport();
    const subscriber = vi.fn();

    const unsubscribe = viewport.subscribe(subscriber);
    viewport.setFontSize(18);

    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(subscriber).toHaveBeenCalledWith(expect.objectContaining({ fontSize: 18 }));

    unsubscribe();
    viewport.setFontSize(20);
    expect(subscriber).toHaveBeenCalledTimes(1);
  });
});
