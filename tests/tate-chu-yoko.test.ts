import { describe, it, expect } from 'vitest';
import { TateChuYokoParser } from '../src/core/editor/TateChuYokoParser';

describe('TateChuYokoParser', () => {
  describe('isTcyCandidate', () => {
    it('should return true for valid 2-digit ASCII numbers', () => {
      expect(TateChuYokoParser.isTcyCandidate('12')).toBe(true);
      expect(TateChuYokoParser.isTcyCandidate('03')).toBe(true);
      expect(TateChuYokoParser.isTcyCandidate('99')).toBe(true);
    });

    it('should return true for 2-character exclamation / question mark sequences', () => {
      expect(TateChuYokoParser.isTcyCandidate('!?')).toBe(true);
      expect(TateChuYokoParser.isTcyCandidate('!!')).toBe(true);
      expect(TateChuYokoParser.isTcyCandidate('?!')).toBe(true);
      expect(TateChuYokoParser.isTcyCandidate('??')).toBe(true);
      expect(TateChuYokoParser.isTcyCandidate('！？')).toBe(true);
      expect(TateChuYokoParser.isTcyCandidate('！！')).toBe(true);
    });

    it('should return false for single digit, 3+ digits, and full-width characters', () => {
      expect(TateChuYokoParser.isTcyCandidate('1')).toBe(false);
      expect(TateChuYokoParser.isTcyCandidate('5')).toBe(false);
      expect(TateChuYokoParser.isTcyCandidate('123')).toBe(false);
      expect(TateChuYokoParser.isTcyCandidate('2024')).toBe(false);
      expect(TateChuYokoParser.isTcyCandidate('１２')).toBe(false);
      expect(TateChuYokoParser.isTcyCandidate('０３')).toBe(false);
      expect(TateChuYokoParser.isTcyCandidate('ＡＢ')).toBe(false);
      expect(TateChuYokoParser.isTcyCandidate('')).toBe(false);
    });
  });

  describe('detectAutoTcy', () => {
    it('should automatically detect 2-digit numbers and 2-character punctuation', () => {
      const text = '第12話で、なに!?と叫んだ。03番の選手。';
      const matches = TateChuYokoParser.detectAutoTcy(text);

      expect(matches).toHaveLength(3);
      expect(matches[0]).toMatchObject({ type: 'number', text: '12', rawFrom: 1, rawTo: 3 });
      expect(matches[1]).toMatchObject({ type: 'punctuation', text: '!?', rawFrom: 8, rawTo: 10 });
      expect(matches[2]).toMatchObject({ type: 'number', text: '03', rawFrom: 15, rawTo: 17 });
    });

    it('should ignore 1-digit, 3+ digit numbers, and full-width numbers', () => {
      const text = '第1話、123ページ、2024年、１２月。';
      const matches = TateChuYokoParser.detectAutoTcy(text);

      expect(matches).toHaveLength(0);
    });

    it('should respect autoDetectDigits and autoDetectPunctuation options', () => {
      const text = '12!?';
      const noDigits = TateChuYokoParser.detectAutoTcy(text, { autoDetectDigits: false });
      expect(noDigits).toHaveLength(1);
      expect(noDigits[0].type).toBe('punctuation');

      const noPunc = TateChuYokoParser.detectAutoTcy(text, { autoDetectPunctuation: false });
      expect(noPunc).toHaveLength(1);
      expect(noPunc[0].type).toBe('number');
    });
  });

  describe('parseAozoraTcy & parseHtmlTcy', () => {
    it('should parse block Aozora notation ［＃縦中横］...［＃縦中横終わり］', () => {
      const text = '第［＃縦中横］12［＃縦中横終わり］話';
      const matches = TateChuYokoParser.parseAozoraTcy(text);

      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({
        type: 'aozora-markup',
        text: '12',
        raw: '［＃縦中横］12［＃縦中横終わり］',
        isExplicit: true,
      });
    });

    it('should parse inline Aozora notation ［＃「...」は縦中横］', () => {
      const text = '第［＃「12」は縦中横］話';
      const matches = TateChuYokoParser.parseAozoraTcy(text);

      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({
        type: 'aozora-markup',
        text: '12',
        raw: '［＃「12」は縦中横］',
        isExplicit: true,
      });
    });

    it('should parse HTML TCY tags', () => {
      const text = '第<span class="tcy">12</span>話';
      const matches = TateChuYokoParser.parseHtmlTcy(text);

      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({
        type: 'html-tag',
        text: '12',
        raw: '<span class="tcy">12</span>',
        isExplicit: true,
      });
    });
  });

  describe('parse', () => {
    it('should divide raw text into structured spans combining explicit and auto-detected TCY', () => {
      const text = '第［＃縦中横］12［＃縦中横終わり］話。なに!? 123ページ。';
      const result = TateChuYokoParser.parse(text);

      expect(result.spans).toHaveLength(5);

      // Span 0: "第"
      expect(result.spans[0]).toMatchObject({ type: 'text', text: '第' });

      // Span 1: explicit Aozora TCY "12"
      expect(result.spans[1]).toMatchObject({ type: 'tcy', text: '12', isAutoDetected: false });

      // Span 2: "話。なに"
      expect(result.spans[2]).toMatchObject({ type: 'text', text: '話。なに' });

      // Span 3: auto-detected TCY "!?"
      expect(result.spans[3]).toMatchObject({ type: 'tcy', text: '!?', isAutoDetected: true });

      // Span 4: " 123ページ。"
      expect(result.spans[4]).toMatchObject({ type: 'text', text: ' 123ページ。' });
    });
  });

  describe('autoMarkup', () => {
    it('should automatically wrap un-marked 2-digit numbers and punctuation pairs in Aozora notation', () => {
      const text = '第12話で、!?と叫ぶ。123ページ参照。';
      const marked = TateChuYokoParser.autoMarkup(text);

      expect(marked).toBe(
        '第［＃縦中横］12［＃縦中横終わり］話で、［＃縦中横］!?［＃縦中横終わり］と叫ぶ。123ページ参照。'
      );
    });

    it('should not double-wrap existing Aozora TCY markup', () => {
      const text = '第［＃縦中横］12［＃縦中横終わり］話で、03番。';
      const marked = TateChuYokoParser.autoMarkup(text);

      expect(marked).toBe(
        '第［＃縦中横］12［＃縦中横終わり］話で、［＃縦中横］03［＃縦中横終わり］番。'
      );
    });
  });

  describe('Format Conversions (toAozora, toHtml, toEpubHtml)', () => {
    it('toAozora converts HTML TCY tags and auto-candidates to Aozora notation', () => {
      const input = '第<span class="tcy">12</span>話と03番。';
      const output = TateChuYokoParser.toAozora(input);

      expect(output).toBe('第［＃縦中横］12［＃縦中横終わり］話と［＃縦中横］03［＃縦中横終わり］番。');
    });

    it('toHtml converts text to standard HTML <span class="tcy">...</span>', () => {
      const input = '第［＃縦中横］12［＃縦中横終わり］話で、なに!?';
      const output = TateChuYokoParser.toHtml(input);

      expect(output).toBe('第<span class="tcy">12</span>話で、なに<span class="tcy">!?</span>');
    });

    it('toEpubHtml converts text to EPUB3 inline CSS style span', () => {
      const input = '第［＃縦中横］12［＃縦中横終わり］話';
      const output = TateChuYokoParser.toEpubHtml(input);

      expect(output).toBe(
        '第<span style="text-combine-upright: all; -webkit-text-combine: horizontal;">12</span>話'
      );
    });
  });

  describe('removeTcyMarkup', () => {
    it('should strip Aozora TCY tags and HTML TCY spans, leaving pure content text', () => {
      const input = '第［＃縦中横］12［＃縦中横終わり］話［＃「03」は縦中横］<span class="tcy">!?</span>';
      const plain = TateChuYokoParser.removeTcyMarkup(input);

      expect(plain).toBe('第12話03!?');
    });
  });
});
