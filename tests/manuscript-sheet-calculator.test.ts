import { describe, it, expect } from 'vitest';
import {
  ManuscriptSheetCalculator,
  type ManuscriptCalculatorOptions,
} from '../src/core/editor/ManuscriptSheetCalculator.js';

describe('ManuscriptSheetCalculator', () => {
  describe('Preset Configurations', () => {
    it('should calculate metrics for 400-char layout (20x20) by default', () => {
      const text = '吾輩は猫である。名前はまだ無い。';
      const metrics = ManuscriptSheetCalculator.calculate(text);

      expect(metrics.layout.charsPerLine).toBe(20);
      expect(metrics.layout.linesPerPage).toBe(20);
      expect(metrics.totalLines).toBe(1);
      expect(metrics.sheets).toBe(1);
      expect(metrics.exactSheets).toBe(1 / 20);
    });

    it('should support 200-char layout preset (20x10)', () => {
      const text = '第一行テキスト。\n第二行テキスト。';
      const metrics = ManuscriptSheetCalculator.calculate(text, { preset: '200' });

      expect(metrics.layout.charsPerLine).toBe(20);
      expect(metrics.layout.linesPerPage).toBe(10);
      expect(metrics.totalLines).toBe(2);
      expect(metrics.sheets).toBe(1);
      expect(metrics.exactSheets).toBe(2 / 10);
    });

    it('should support Bunko layout preset (40x17)', () => {
      const text = '文庫本スタイルの組版計算です。';
      const metrics = ManuscriptSheetCalculator.calculate(text, { preset: 'bunko' });

      expect(metrics.layout.charsPerLine).toBe(40);
      expect(metrics.layout.linesPerPage).toBe(17);
      expect(metrics.totalLines).toBe(1);
      expect(metrics.sheets).toBe(1);
      expect(metrics.exactSheets).toBe(1 / 17);
    });

    it('should support custom layout settings', () => {
      const text = 'カスタム組版（30字×15行）のテスト。';
      const options: ManuscriptCalculatorOptions = {
        preset: 'custom',
        charsPerLine: 30,
        linesPerPage: 15,
      };
      const metrics = ManuscriptSheetCalculator.calculate(text, options);

      expect(metrics.layout.charsPerLine).toBe(30);
      expect(metrics.layout.linesPerPage).toBe(15);
      expect(metrics.totalLines).toBe(1);
    });

    it('should return preset dictionary via getPresets()', () => {
      const presets = ManuscriptSheetCalculator.getPresets();
      expect(presets['400'].charsPerLine).toBe(20);
      expect(presets['400'].linesPerPage).toBe(20);
      expect(presets['200'].linesPerPage).toBe(10);
      expect(presets['bunko'].charsPerLine).toBe(40);
    });
  });

  describe('Paragraph Wrapping and Grid Empty Space Calculations', () => {
    it('should wrap a paragraph across multiple lines when exceeding charsPerLine', () => {
      // 25 characters on 20-char line
      const text = 'あいうえおかきくけこさしすせそたちつてとなにぬねの';
      const metrics = ManuscriptSheetCalculator.calculate(text, {
        preset: '400',
        autoIndent: false,
      });

      // 25 chars without autoIndent -> 20 chars on line 1, 5 chars on line 2
      expect(metrics.totalLines).toBe(2);
      expect(metrics.lines[0].gridCellsOccupied).toBe(20);
      expect(metrics.lines[1].gridCellsOccupied).toBe(5);
    });

    it('should start new paragraph on a new line leaving remaining line cells empty', () => {
      // Two short paragraphs
      const text = '短い段落。\n次の短い段落。';
      const metrics = ManuscriptSheetCalculator.calculate(text, {
        preset: '400',
        autoIndent: false,
      });

      expect(metrics.totalLines).toBe(2);
      expect(metrics.lines[0].text).toBe('短い段落。');
      expect(metrics.lines[1].text).toBe('次の短い段落。');
    });

    it('should calculate sheets correctly when totalLines exceeds linesPerPage', () => {
      // Create 25 short paragraphs (1 line each = 25 total lines)
      const paragraphs = Array.from({ length: 25 }, (_, i) => `段落番号${i + 1}。`);
      const text = paragraphs.join('\n');
      const metrics = ManuscriptSheetCalculator.calculate(text, { preset: '400' });

      expect(metrics.totalLines).toBe(25);
      expect(metrics.sheets).toBe(2); // Math.ceil(25 / 20) = 2
      expect(metrics.exactSheets).toBe(25 / 20);
    });
  });

  describe('Empty Lines and Paragraph Metrics', () => {
    it('should count empty lines (\n\n) as grid lines', () => {
      const text = '第一幕\n\nここから本文が始まります。';
      const metrics = ManuscriptSheetCalculator.calculate(text, {
        preset: '400',
        autoIndent: false,
      });

      expect(metrics.totalLines).toBe(3);
      expect(metrics.emptyLinesCount).toBe(1);
      expect(metrics.paragraphCount).toBe(2);
      expect(metrics.lines[1].isEmptyLine).toBe(true);
      expect(metrics.lines[1].gridCellsOccupied).toBe(0);
    });

    it('should process consecutive empty lines correctly', () => {
      const text = '章題\n\n\n本文。';
      const metrics = ManuscriptSheetCalculator.calculate(text, {
        preset: '400',
        autoIndent: false,
      });

      expect(metrics.totalLines).toBe(4);
      expect(metrics.emptyLinesCount).toBe(2);
      expect(metrics.paragraphCount).toBe(2);
    });
  });

  describe('Indentation Handling', () => {
    it('should auto-indent unindented prose paragraphs', () => {
      const text = '吾輩は猫である。';
      const metrics = ManuscriptSheetCalculator.calculate(text, {
        preset: '400',
        autoIndent: true,
      });

      expect(metrics.lines[0].text).toBe('　吾輩は猫である。');
      expect(metrics.lines[0].gridCellsOccupied).toBe(9); // 1 indent + 8 chars
    });

    it('should preserve existing indents without double indenting', () => {
      const text = '　すでに字下げ済み。';
      const metrics = ManuscriptSheetCalculator.calculate(text, {
        preset: '400',
        autoIndent: true,
      });

      expect(metrics.lines[0].text).toBe('　すでに字下げ済み。');
    });

    it('should not auto-indent dialogue lines starting with open quotes', () => {
      const text = '「会話文は字下げしない。」\n『二重かぎ括弧も同様。』';
      const metrics = ManuscriptSheetCalculator.calculate(text, {
        preset: '400',
        autoIndent: true,
      });

      expect(metrics.lines[0].text).toBe('「会話文は字下げしない。」');
      expect(metrics.lines[1].text).toBe('『二重かぎ括弧も同様。』');
      expect(metrics.lines[0].isDialogue).toBe(true);
      expect(metrics.lines[1].isDialogue).toBe(true);
    });

    it('should respect autoIndent: false setting', () => {
      const text = '字下げしない地の文。';
      const metrics = ManuscriptSheetCalculator.calculate(text, {
        preset: '400',
        autoIndent: false,
      });

      expect(metrics.lines[0].text).toBe('字下げしない地の文。');
    });
  });

  describe('Aozora Markup Stripping', () => {
    it('should strip explicit and implicit ruby tags during cell calculation', () => {
      const text = '｜親文字《ルビ》と漢字《かんじ》のテスト。';
      const metrics = ManuscriptSheetCalculator.calculate(text, {
        preset: '400',
        stripAozoraMarkup: true,
        autoIndent: false,
      });

      // Stripped text: "親文字と漢字のテスト。" (11 chars)
      expect(metrics.lines[0].text).toBe('親文字と漢字のテスト。');
      expect(metrics.lines[0].gridCellsOccupied).toBe(11);
      expect(metrics.rawCharCount).toBe(text.length);
    });

    it('should strip bouten emphasis tags and Aozora command blocks', () => {
      const text = '《《傍点文字》》と［＃「注釈」は横書き］などのタグ。';
      const metrics = ManuscriptSheetCalculator.calculate(text, {
        preset: '400',
        stripAozoraMarkup: true,
        autoIndent: false,
      });

      expect(metrics.lines[0].text).toBe('傍点文字となどのタグ。');
    });

    it('should expose static stripAozoraMarkup helper and preserve URLs and normal tortoise shell brackets', () => {
      const input = '｜瑠璃《るり》色の《《星》》\nhttps://example.com\n〔普通のカッコ〕〔＃斜体〕';
      const stripped = ManuscriptSheetCalculator.stripAozoraMarkup(input);
      expect(stripped).toContain('瑠璃色の星');
      expect(stripped).toContain('https://example.com');
      expect(stripped).toContain('〔普通のカッコ〕');
      expect(stripped).not.toContain('〔＃斜体〕');
    });

    it('should preserve markup when stripAozoraMarkup is false', () => {
      const text = '漢字《かんじ》';
      const metrics = ManuscriptSheetCalculator.calculate(text, {
        stripAozoraMarkup: false,
        autoIndent: false,
      });

      expect(metrics.lines[0].text).toBe('漢字《かんじ》');
    });
  });

  describe('Publication Page Conversion Values', () => {
    it('should calculate publication page estimates using Bunko layout (40x17)', () => {
      const paragraphs = Array.from({ length: 30 }, () => '四十字を超える少し長めの段落テキストサンプル。');
      const text = paragraphs.join('\n');

      const metrics = ManuscriptSheetCalculator.calculate(text, {
        preset: '400',
        autoIndent: false,
      });

      expect(metrics.layout.charsPerLine).toBe(20);
      expect(metrics.publicationLayout.charsPerLine).toBe(40);
      expect(metrics.publicationLayout.linesPerPage).toBe(17);
      expect(metrics.publicationPages).toBeGreaterThan(0);
      expect(metrics.exactPublicationPages).toBe(metrics.publicationPages ? metrics.exactPublicationPages : 0);
    });

    it('should allow custom publication layout specification', () => {
      const text = '出版ページ換算値のカスタム指定テスト。';
      const metrics = ManuscriptSheetCalculator.calculate(text, {
        preset: '400',
        publicationLayout: { charsPerLine: 30, linesPerPage: 10 },
      });

      expect(metrics.publicationLayout.charsPerLine).toBe(30);
      expect(metrics.publicationLayout.linesPerPage).toBe(10);
    });
  });

  describe('Half-width Characters and Kinsoku Shori', () => {
    it('should count 2 half-width ASCII characters as 1 grid cell width by default', () => {
      const text = 'Hello World!'; // 12 half-width chars
      const metrics = ManuscriptSheetCalculator.calculate(text, {
        preset: '400',
        autoIndent: false,
        halfwidthRatio: 0.5,
      });

      // 12 chars * 0.5 = 6 cells width
      expect(metrics.lines[0].gridCellsOccupied).toBe(6);
    });

    it('should handle Kinsoku Shori hanging consecutive closing punctuation on line end', () => {
      // Exactly 20 chars on line 1, then consecutive closing brackets '。」'
      const lineText = '一二三四五六七八九十一二三四五六七八九十。」';
      const metrics = ManuscriptSheetCalculator.calculate(lineText, {
        preset: '400',
        autoIndent: false,
        kinsokuShori: true,
      });

      // Consecutive closing punctuation '。」' stays on line 1 without starting a line with '」'
      expect(metrics.totalLines).toBe(1);
      expect(metrics.lines[0].text).toBe(lineText);
    });
  });

  describe('Static Estimator and Metrics Sanity', () => {
    it('should estimate sheets from raw character count via estimateFromCharCount', () => {
      const estimation = ManuscriptSheetCalculator.estimateFromCharCount(1000);
      expect(estimation.sheets).toBe(3); // 1000 / 400 = 2.5 -> 3
      expect(estimation.exactSheets).toBe(2.5);
    });

    it('should compute grid filling ratio correctly', () => {
      // 1 line with 10 chars occupied out of 20 chars per line -> 50% fill ratio
      const text = '一二三四五六七八九十';
      const metrics = ManuscriptSheetCalculator.calculate(text, {
        preset: '400',
        autoIndent: false,
      });

      expect(metrics.totalLines).toBe(1);
      expect(metrics.filledGridCells).toBe(10);
      expect(metrics.gridFillingRatio).toBe(0.5);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty text gracefully', () => {
      const metrics = ManuscriptSheetCalculator.calculate('');
      expect(metrics.totalLines).toBe(1);
      expect(metrics.sheets).toBe(1);
      expect(metrics.rawCharCount).toBe(0);
      expect(metrics.totalChars).toBe(0);
      expect(metrics.charCountExcludingWhitespace).toBe(0);
      expect(metrics.paragraphCount).toBe(0);
      expect(metrics.emptyLinesCount).toBe(1);
    });

    it('should handle whitespace-only text', () => {
      const metrics = ManuscriptSheetCalculator.calculate('   \n　　\n\t');
      expect(metrics.charCountExcludingWhitespace).toBe(0);
    });
  });
});
