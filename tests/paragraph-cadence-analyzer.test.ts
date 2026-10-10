import { describe, it, expect } from 'vitest';
import { ParagraphCadenceAnalyzer } from '../src/core/editor/ParagraphCadenceAnalyzer.js';

describe('ParagraphCadenceAnalyzer', () => {
  const analyzer = new ParagraphCadenceAnalyzer();

  describe('Aozora Bunko markup stripping', () => {
    it('strips ruby annotations and Aozora command tags accurately', () => {
      const raw = '彼は｜黒炎の剣《こくえんのけん》を構えた。［＃ここから１字下げ］《《決戦》》の時が迫る。〔注釈〕';
      const stripped = ParagraphCadenceAnalyzer.stripAozoraMarkup(raw);

      expect(stripped).toBe('彼は黒炎の剣を構えた。決戦の時が迫る。');
      expect(stripped).not.toContain('《こくえんのけん》');
      expect(stripped).not.toContain('［＃');
      expect(stripped).not.toContain('〔注釈〕');
    });
  });

  describe('Paragraph parsing & basic stats', () => {
    it('calculates paragraph character counts, line counts, and moving averages correctly', () => {
      const manuscript = [
        '第一段落です。文章の出だしです。',
        '第二段落は少し長めの説明文になります。文字数を計算します。',
        '',
        '「会話文が入ります」',
      ].join('\n');

      const result = analyzer.analyze(manuscript);

      expect(result.totalParagraphs).toBe(4);
      expect(result.charCounts[0]).toBe(16);
      expect(result.charCounts[1]).toBe(29);
      expect(result.charCounts[2]).toBe(0);  // empty line
      expect(result.charCounts[3]).toBe(10); // dialogue

      expect(result.emptyLineCount).toBe(1);
      expect(result.dialogueCount).toBe(1);
      expect(result.movingAverages.length).toBe(4);
    });
  });

  describe('Cadence pattern detection', () => {
    it('detects Black Wall (黒い壁: > 300 characters) pattern and issues warning', () => {
      const longParagraph = 'あ'.repeat(305);
      const manuscript = `短いイントロ段落。\n\n${longParagraph}\n\n締めくくりの段落。`;

      const result = analyzer.analyze(manuscript);

      expect(result.blackWallCount).toBe(1);
      expect(result.paragraphs[2].pattern).toBe('black_wall');
      expect(result.paragraphs[2].charCount).toBe(305);
      expect(result.paragraphs[2].depthIntensity).toBe(1.0);
      expect(result.paragraphs[2].colorDepthCode).toBe('#800026');

      expect(result.rhythmHealthScore).toBeLessThan(100);
      expect(result.advice.some((a) => a.message.includes('黒い壁警告'))).toBe(true);
    });

    it('identifies 1-line empty paragraphs (1行空き段落) for pacing pauses', () => {
      const manuscript = '第一幕の終わり。\n\n\n第二幕の始まり。';
      const result = analyzer.analyze(manuscript);

      expect(result.emptyLineCount).toBe(2);
      expect(result.paragraphs[1].pattern).toBe('empty_line');
      expect(result.paragraphs[1].charCount).toBe(0);
      expect(result.paragraphs[1].depthIntensity).toBe(0);
      expect(result.paragraphs[1].colorDepthCode).toBe('#f8f9fa');
    });

    it('identifies short contrast paragraphs (短い対比段落) following long narrative blocks', () => {
      const longBlock = '王国の歴史は古く、千年前の竜王戦役において勇者ヴァルディスが聖剣を以て封印を施したとされる伝説が色濃く残る土地であった。人々はその恩恵を忘れ、平和に倦んでいた。';
      const shortPunchy = 'だが、闇は醒めた。';
      const manuscript = `${longBlock}\n${shortPunchy}\n${longBlock}`;

      const result = analyzer.analyze(manuscript);

      expect(result.shortContrastCount).toBe(1);
      expect(result.paragraphs[1].pattern).toBe('short_contrast');
      expect(result.paragraphs[1].charCount).toBe(9);
    });
  });

  describe('UI Heatmap data and Rhythm Health Score', () => {
    it('generates visual color depth codes and depth intensity for UI rendering', () => {
      const manuscript = [
        '短文。',
        '中くらいの長さの段落です。文章の波をテストしています。',
        '「会話文も混ざります」',
        `長い段落のサンプルです。${'文字数を伸ばすための文章です。'.repeat(6)}`,
      ].join('\n');

      const result = analyzer.analyze(manuscript);

      expect(result.paragraphs.length).toBe(4);
      result.paragraphs.forEach((p) => {
        expect(p.colorDepthCode).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(p.depthIntensity).toBeGreaterThanOrEqual(0);
        expect(p.depthIntensity).toBeLessThanOrEqual(1.0);
      });
    });

    it('evaluates rhythm health score and gives positive encouragement for balanced pacing', () => {
      const manuscript = [
        '王国の夜空に星が瞬いていた。',
        '長めの背景描写文が続きます。静かな夜です。'.repeat(3),
        'だが、影が動いた。',
        '',
        '「誰だ！」',
      ].join('\n');

      const result = analyzer.analyze(manuscript);

      expect(result.rhythmHealthScore).toBeGreaterThanOrEqual(80);
      expect(result.advice.some((a) => a.message.includes('抑揚の波'))).toBe(true);
    });
  });

  describe('Edge cases and empty input', () => {
    it('handles empty input and whitespace gracefully', () => {
      const emptyResult = analyzer.analyze('');
      expect(emptyResult.totalParagraphs).toBe(0);
      expect(emptyResult.rhythmHealthScore).toBe(100);
      expect(emptyResult.advice[0].message).toContain('本文が入力されていません');

      const whitespaceResult = analyzer.analyze('   \n\n  ');
      expect(whitespaceResult.totalParagraphs).toBe(3);
      expect(whitespaceResult.emptyLineCount).toBe(3);
    });
  });
});
