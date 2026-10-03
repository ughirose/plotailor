import { describe, it, expect } from 'vitest';
import {
  BoutenSyntaxTransformer,
  type BoutenType,
  type BoutenFormat,
} from '../src/core/editor/BoutenSyntaxTransformer.js';

describe('BoutenSyntaxTransformer - Multi-Type Emphasis Mark Parser & Converter', () => {
  describe('Abstract Representation & Definitions', () => {
    it('defines labels and CSS maps for all 5 bouten mark types', () => {
      const marks: BoutenType[] = ['sesame', 'bullet', 'circle', 'double-circle', 'triangle'];

      for (const mark of marks) {
        expect(BoutenSyntaxTransformer.MARK_LABELS[mark]).toBeDefined();
        expect(BoutenSyntaxTransformer.CSS_MARK_MAP[mark]).toBeDefined();
        expect(typeof BoutenSyntaxTransformer.toCss(mark)).toBe('string');

        const style = BoutenSyntaxTransformer.getCssStyle(mark);
        expect(style['text-emphasis-style']).toBe(BoutenSyntaxTransformer.toCss(mark));
        expect(style['-webkit-text-emphasis-style']).toBe(BoutenSyntaxTransformer.toCss(mark));
      }
    });
  });

  describe('Parsing Various Bouten Syntaxes', () => {
    it('parses Kakuyomu notation 《《...》》', () => {
      const text = 'これは《《最重要》》な作戦である。';
      const result = BoutenSyntaxTransformer.parse(text);

      expect(result.extractedSpans.length).toBe(1);
      expect(result.extractedSpans[0]).toMatchObject({
        type: 'bouten',
        text: '最重要',
        mark: 'sesame',
        syntaxFormat: 'kakuyomu',
        raw: '《《最重要》》',
        rawFrom: 3,
        rawTo: 10,
      });

      expect(result.spans.length).toBe(3);
      expect(result.spans[0]).toEqual({ type: 'text', raw: 'これは', rawFrom: 0, rawTo: 3 });
      expect(result.spans[1].type).toBe('bouten');
      expect(result.spans[2]).toEqual({ type: 'text', raw: 'な作戦である。', rawFrom: 10, rawTo: 17 });
    });

    it('parses Aozora inline mark notations for all bouten types', () => {
      const text =
        '［＃「ごま」に傍点］［＃「黒丸」に黒丸傍点］［＃「白丸」に白丸傍点］［＃「二重丸」に蛇の目傍点］［＃「三角」に三角傍点］';
      const result = BoutenSyntaxTransformer.parse(text);

      expect(result.extractedSpans.length).toBe(5);
      expect(result.extractedSpans[0].mark).toBe('sesame');
      expect(result.extractedSpans[1].mark).toBe('bullet');
      expect(result.extractedSpans[2].mark).toBe('circle');
      expect(result.extractedSpans[3].mark).toBe('double-circle');
      expect(result.extractedSpans[4].mark).toBe('triangle');
    });

    it('parses Aozora block tag notations', () => {
      const text = '［＃傍点］基本［＃傍点終わり］と［＃傍点（白丸）］応用［＃傍点終わり］';
      const result = BoutenSyntaxTransformer.parse(text);

      expect(result.extractedSpans.length).toBe(2);
      expect(result.extractedSpans[0]).toMatchObject({
        text: '基本',
        mark: 'sesame',
        syntaxFormat: 'aozora',
      });
      expect(result.extractedSpans[1]).toMatchObject({
        text: '応用',
        mark: 'circle',
        syntaxFormat: 'aozora',
      });
    });

    it('parses Narou / Syosetu HTML span and em tags', () => {
      const htmlText =
        '<span class="bouten">第一</span>と<span class="bouten bouten-bullet">第二</span>、<span style="text-emphasis-style: open circle;">第三</span>';
      const result = BoutenSyntaxTransformer.parse(htmlText);

      expect(result.extractedSpans.length).toBe(3);
      expect(result.extractedSpans[0]).toMatchObject({
        text: '第一',
        mark: 'sesame',
      });
      expect(result.extractedSpans[1]).toMatchObject({
        text: '第二',
        mark: 'bullet',
      });
      expect(result.extractedSpans[2]).toMatchObject({
        text: '第三',
        mark: 'circle',
      });
    });

    it('parses four-angle bracket notation <<<<...>>>>', () => {
      const text = '秘奥義<<<<天地無双>>>>の一撃';
      const result = BoutenSyntaxTransformer.parse(text);

      expect(result.extractedSpans.length).toBe(1);
      expect(result.extractedSpans[0]).toMatchObject({
        text: '天地無双',
        mark: 'sesame',
        syntaxFormat: 'angle',
      });
    });
  });

  describe('Extraction, Stripping & Custom Replacement APIs', () => {
    it('extracts all bouten spans directly with extract()', () => {
      const text = '《《光》》と［＃「影」に黒丸傍点］';
      const extracted = BoutenSyntaxTransformer.extract(text);

      expect(extracted.length).toBe(2);
      expect(extracted[0].text).toBe('光');
      expect(extracted[1].text).toBe('影');
    });

    it('strips all bouten markup tags into pure plain text with strip()', () => {
      const mixedText =
        '彼は《《剣》》を抜き、［＃「魔法」に白丸傍点］を唱え、<span class="bouten bouten-double-circle">結界</span>を展開した。';
      const plain = BoutenSyntaxTransformer.strip(mixedText);

      expect(plain).toBe('彼は剣を抜き、魔法を唱え、結界を展開した。');
    });

    it('replaces bouten spans with custom replacer callback using replace()', () => {
      const text = '《《赤》》と［＃「青」に傍点］';
      const replaced = BoutenSyntaxTransformer.replace(text, (span) => `【${span.text}:${span.mark}】`);

      expect(replaced).toBe('【赤:sesame】と【青:sesame】');
    });

    it('transforms mark types across document with transformMark()', () => {
      const text = '［＃「星」にごま傍点］と［＃「月」に白丸傍点］';
      const transformed = BoutenSyntaxTransformer.transformMark(text, 'double-circle');

      expect(transformed).toBe('［＃「星」に蛇の目傍点］と［＃「月」に蛇の目傍点］');
    });
  });

  describe('Inter-Conversion between Platforms & Formats', () => {
    const textWithBouten = '《《強調》》と［＃「黒丸」に黒丸傍点］';

    it('converts to Kakuyomu format', () => {
      const converted = BoutenSyntaxTransformer.convertFormat(textWithBouten, 'kakuyomu');
      expect(converted).toBe('《《強調》》と《《黒丸》》');
    });

    it('converts to Aozora Bunko format', () => {
      const converted = BoutenSyntaxTransformer.convertFormat(textWithBouten, 'aozora');
      expect(converted).toBe('［＃「強調」に傍点］と［＃「黒丸」に黒丸傍点］');
    });

    it('converts to Narou / HTML format with CSS classes', () => {
      const converted = BoutenSyntaxTransformer.convertFormat(textWithBouten, 'narou');
      expect(converted).toBe(
        '<span class="bouten">強調</span>と<span class="bouten bouten-bullet">黒丸</span>'
      );
    });

    it('converts to HTML with inline CSS styles when requested', () => {
      const converted = BoutenSyntaxTransformer.toHtml(textWithBouten, { useCssInline: true });
      expect(converted).toBe(
        '<span style="text-emphasis-style: sesame; -webkit-text-emphasis-style: sesame;">強調</span>と<span style="text-emphasis-style: filled circle; -webkit-text-emphasis-style: filled circle;">黒丸</span>'
      );
    });

    it('converts to CSS emphasis representation', () => {
      const converted = BoutenSyntaxTransformer.convertFormat(textWithBouten, 'css-emphasis');
      expect(converted).toBe('強調 [CSS: sesame]と黒丸 [CSS: filled circle]');
    });
  });
});
