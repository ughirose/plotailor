import { describe, it, expect } from 'vitest';
import { KanjiHiraganaRatioEngine } from '../src/core/editor/KanjiHiraganaRatioEngine.js';

describe('KanjiHiraganaRatioEngine', () => {
  const engine = new KanjiHiraganaRatioEngine();

  describe('Character classification & counts', () => {
    it('classifies kanji, hiragana, katakana, alphanumeric, and symbols correctly', () => {
      const text = '漢字ひらがなカタカナABC123！。';
      const analysis = engine.analyze(text);

      expect(analysis.counts.kanji).toBe(2);         // 漢字
      expect(analysis.counts.hiragana).toBe(4);      // ひらがな
      expect(analysis.counts.katakana).toBe(4);      // カタカナ
      expect(analysis.counts.alphanumeric).toBe(6);  // ABC123
      expect(analysis.counts.symbols).toBe(2);       // ！。
      expect(analysis.counts.total).toBe(18);
    });

    it('calculates ratio percentages accurately', () => {
      // 10 characters: 3 Kanji (30%), 7 Hiragana (70%)
      const text = '漢字山ひらがなそして';
      const analysis = engine.analyze(text);

      expect(analysis.ratios.kanjiRatio).toBe(30.0);
      expect(analysis.ratios.hiraganaRatio).toBe(70.0);
      expect(analysis.ratios.katakanaRatio).toBe(0.0);
      expect(analysis.ratios.alphanumericRatio).toBe(0.0);
      expect(analysis.ratios.symbolsRatio).toBe(0.0);
    });
  });

  describe('Aozora Bunko markup stripping', () => {
    it('strips explicit ruby notation ｜親文字《るび》 before calculation', () => {
      const raw = '｜王都《おうと》の夜空';
      const stripped = KanjiHiraganaRatioEngine.stripAozoraMarkup(raw);
      expect(stripped).toBe('王都の夜空');

      const analysis = engine.analyze(raw);
      // 王(1), 都(1), の(1), 夜(1), 空(1) -> 4 Kanji, 1 Hiragana = Total 5
      expect(analysis.counts.total).toBe(5);
      expect(analysis.counts.kanji).toBe(4);
      expect(analysis.counts.hiragana).toBe(1);
    });

    it('strips implicit kanji ruby notation 漢字《るび》 before calculation', () => {
      const raw = '将軍《しょうぐん》';
      const stripped = KanjiHiraganaRatioEngine.stripAozoraMarkup(raw);
      expect(stripped).toBe('将軍');

      const analysis = engine.analyze(raw);
      expect(analysis.counts.total).toBe(2);
      expect(analysis.counts.kanji).toBe(2);
    });

    it('strips bouten 《《...》》 and ［＃...］ commands', () => {
      const raw = '《《予言の夜》》［＃「予言」に傍点］〔注釈〕';
      const stripped = KanjiHiraganaRatioEngine.stripAozoraMarkup(raw);
      expect(stripped).toBe('予言の夜注釈');
    });
  });

  describe('Literary Golden Ratio Evaluation', () => {
    it('detects optimal ratio (Kanji 25-35%, Hiragana 60-70%)', () => {
      // 100 characters: 30 Kanji, 65 Hiragana, 5 Katakana
      const kanjiStr = '漢'.repeat(30);
      const hiraganaStr = 'あ'.repeat(65);
      const katakanaStr = 'ア'.repeat(5);
      const text = kanjiStr + hiraganaStr + katakanaStr;

      const analysis = engine.analyze(text);
      expect(analysis.ratios.kanjiRatio).toBe(30.0);
      expect(analysis.ratios.hiraganaRatio).toBe(65.0);
      expect(analysis.evaluation.kanjiStatus).toBe('optimal');
      expect(analysis.evaluation.hiraganaStatus).toBe('optimal');
      expect(analysis.evaluation.isGoldenRatio).toBe(true);
      expect(analysis.evaluation.messages[0]).toContain('黄金比率');
    });

    it('warns when Kanji ratio is too high (> 35%)', () => {
      // 10 characters: 5 Kanji (50%), 5 Hiragana (50%)
      const text = '漢字文章構造あいうえお';
      const analysis = engine.analyze(text);

      expect(analysis.evaluation.kanjiStatus).toBe('too_high');
      expect(analysis.evaluation.isGoldenRatio).toBe(false);
      expect(analysis.evaluation.messages.some((m) => m.includes('高すぎます'))).toBe(true);
    });

    it('warns when Kanji ratio is too low (< 25%)', () => {
      // 10 characters: 1 Kanji (10%), 9 Hiragana (90%)
      const text = '漢あいうえおかきくけ';
      const analysis = engine.analyze(text);

      expect(analysis.evaluation.kanjiStatus).toBe('too_low');
      expect(analysis.evaluation.isGoldenRatio).toBe(false);
      expect(analysis.evaluation.messages.some((m) => m.includes('低すぎます'))).toBe(true);
    });

    it('warns when Hiragana ratio is too low (< 60%)', () => {
      // 10 characters: 3 Kanji (30%), 2 Hiragana (20%), 5 Katakana (50%)
      const text = '漢字山あいアイウエオ';
      const analysis = engine.analyze(text);

      expect(analysis.evaluation.hiraganaStatus).toBe('too_low');
      expect(analysis.evaluation.isGoldenRatio).toBe(false);
      expect(analysis.evaluation.messages.some((m) => m.includes('ひらがな比率が低すぎます'))).toBe(true);
    });

    it('warns when Hiragana ratio is too high (> 70%)', () => {
      // 100 characters: 10 Kanji (10%), 85 Hiragana (85%), 5 Katakana
      const text = '漢'.repeat(10) + 'あ'.repeat(85) + 'ア'.repeat(5);
      const analysis = engine.analyze(text);

      expect(analysis.evaluation.hiraganaStatus).toBe('too_high');
      expect(analysis.evaluation.isGoldenRatio).toBe(false);
      expect(analysis.evaluation.messages.some((m) => m.includes('ひらがな比率が高すぎます'))).toBe(true);
    });

    it('handles empty input gracefully', () => {
      const analysis = engine.analyze('');
      expect(analysis.counts.total).toBe(0);
      expect(analysis.ratios.kanjiRatio).toBe(0);
      expect(analysis.ratios.hiraganaRatio).toBe(0);
      expect(analysis.evaluation.isGoldenRatio).toBe(false);
      expect(analysis.evaluation.messages[0]).toBe('本文を入力してください。');
    });
  });
});
