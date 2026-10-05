import { describe, it, expect } from 'vitest';
import {
  ReadingTimeEstimator,
  ReadingMode,
} from '../src/core/editor/ReadingTimeEstimator.js';

describe('ReadingTimeEstimator', () => {
  const estimator = new ReadingTimeEstimator();

  describe('Aozora Bunko Markup Cleaning', () => {
    it('returns empty string for empty input', () => {
      expect(ReadingTimeEstimator.stripAozoraMarkup('')).toBe('');
    });

    it('returns original text if no Aozora markup exists', () => {
      const text = '王都の夜空には二つの月が冷たく輝いていた。';
      expect(ReadingTimeEstimator.stripAozoraMarkup(text)).toBe(text);
    });

    it('strips explicit ruby markup (｜親文字《るび》)', () => {
      const explicit = '｜ヴァレリウス《ばれりうす》将軍';
      expect(ReadingTimeEstimator.stripAozoraMarkup(explicit)).toBe('ヴァレリウス将軍');
    });

    it('strips implicit kanji ruby markup (漢字《るび》)', () => {
      const implicit = '漢字《かんじ》の例';
      expect(ReadingTimeEstimator.stripAozoraMarkup(implicit)).toBe('漢字の例');
    });

    it('strips bouten, commands, and ruby sagari', () => {
      const complex = 'それは《《極めて重要》》な［＃「伏線」に傍点］部分である〔ルビ下がり〕。';
      expect(ReadingTimeEstimator.stripAozoraMarkup(complex)).toBe('それは極めて重要な部分である。');
    });
  });

  describe('Time Formatting', () => {
    it('formats seconds under one minute', () => {
      const formatted = ReadingTimeEstimator.formatSeconds(45);
      expect(formatted).toEqual({
        hours: 0,
        minutes: 0,
        seconds: 45,
        formattedText: '45秒',
      });
    });

    it('formats minutes and seconds', () => {
      const formatted = ReadingTimeEstimator.formatSeconds(125); // 2 min 5 sec
      expect(formatted).toEqual({
        hours: 0,
        minutes: 2,
        seconds: 5,
        formattedText: '2分5秒',
      });
    });

    it('formats hours, minutes, and seconds', () => {
      const formatted = ReadingTimeEstimator.formatSeconds(3665); // 1 hr 1 min 5 sec
      expect(formatted).toEqual({
        hours: 1,
        minutes: 1,
        seconds: 5,
        formattedText: '1時間1分5秒',
      });
    });

    it('handles zero seconds', () => {
      const formatted = ReadingTimeEstimator.formatSeconds(0);
      expect(formatted).toEqual({
        hours: 0,
        minutes: 0,
        seconds: 0,
        formattedText: '0秒',
      });
    });
  });

  describe('Reading Time Estimation Modes', () => {
    const text = 'あ'.repeat(1000); // 1,000 characters plain narrative

    it('calculates standard reading speed time (~500 cpm)', () => {
      const res = estimator.estimate(text, 'standard');
      expect(res.mode).toBe('standard');
      expect(res.baseCpm).toBe(500);
      expect(res.cleanedCharacterCount).toBe(1000);
      // 1000 chars / 500 cpm = 2 min = 120 seconds
      expect(res.rawReadingTimeSeconds).toBe(120);
      expect(res.rawFormattedTime.formattedText).toBe('2分0秒');
    });

    it('calculates speed reading mode (~1,000 cpm)', () => {
      const res = estimator.estimate(text, 'speed');
      expect(res.mode).toBe('speed');
      expect(res.baseCpm).toBe(1000);
      // 1000 chars / 1000 cpm = 1 min = 60 seconds
      expect(res.rawReadingTimeSeconds).toBe(60);
      expect(res.rawFormattedTime.formattedText).toBe('1分0秒');
    });

    it('calculates read-aloud mode (~300 cpm)', () => {
      const res = estimator.estimate(text, 'read_aloud');
      expect(res.mode).toBe('read_aloud');
      expect(res.baseCpm).toBe(300);
      // 1000 chars / 300 cpm = 3.333 min = 200 seconds
      expect(res.rawReadingTimeSeconds).toBe(200);
      expect(res.rawFormattedTime.formattedText).toBe('3分20秒');
    });
  });

  describe('Pacing Adjustments (Dialogue & Empty Lines)', () => {
    it('increases effective CPM when dialogue ratio is high', () => {
      // Pure dialogue: 100 chars
      const pureDialogue = '「' + 'あ'.repeat(98) + '」';
      const res = estimator.estimate(pureDialogue, 'standard');

      expect(res.dialogueCharacterCount).toBe(98);
      expect(res.dialogueRatio).toBeCloseTo(0.98, 2);
      // Effective CPM > 500
      expect(res.effectiveCpm).toBeGreaterThan(500);
      expect(res.adjustedReadingTimeSeconds).toBeLessThan(res.rawReadingTimeSeconds);
    });

    it('adds pause penalties for blank/empty lines', () => {
      const textWithEmptyLines = `
第一章

崩落の轟音が去り、封印の祭壇には静寂が訪れた。

「ここからが本番だな」
      `.trim();

      const res = estimator.estimate(textWithEmptyLines, 'standard');
      expect(res.emptyLineCount).toBe(2);
      // Added pause = 2 empty lines * 0.5s = +1.0 second pause
      expect(res.adjustedReadingTimeSeconds).toBeGreaterThan(res.rawReadingTimeSeconds);
    });
  });

  describe('Multi-Format Publication Page Calculation', () => {
    it('calculates Bunko, Shinsho, Tankobon, and Web novel estimates for 6,000 characters', () => {
      const manuscript = 'あ'.repeat(6000);
      const pub = estimator.calculatePublicationEstimate(manuscript.length);

      // Bunko: 6000 / 600 = 10 pages
      expect(pub.bunkoPages).toBe(10);
      expect(pub.exactBunkoPages).toBe(10.0);

      // Shinsho: 6000 / 700 = 8.571 -> ceil 9 pages
      expect(pub.shinshoPages).toBe(9);
      expect(pub.exactShinshoPages).toBe(8.6);

      // Tankobon: 6000 / 800 = 7.5 -> ceil 8 pages
      expect(pub.tankobonPages).toBe(8);
      expect(pub.exactTankobonPages).toBe(7.5);

      // Web Novel Episode: 6000 / 3000 = 2 episodes
      expect(pub.webNovelEpisodes).toBe(2);
      expect(pub.exactWebNovelEpisodes).toBe(2.0);
    });

    it('rounds page count up for fractional page requirements', () => {
      const pub = estimator.calculatePublicationEstimate(601);
      expect(pub.bunkoPages).toBe(2); // 601 / 600 -> 2 pages
    });
  });

  describe('Custom Configurations', () => {
    it('accepts custom reading speeds and page thresholds', () => {
      const customEstimator = new ReadingTimeEstimator(
        {
          standardCpm: 600,
          dialogueSpeedMultiplier: 1.5,
          pauseSecondsPerEmptyLine: 1.0,
        },
        {
          bunkoCharsPerPage: 500,
          webNovelCharsPerEpisode: 2000,
        }
      );

      const text = '「勝負だ！」\n\n「受けて立とう！」';
      const res = customEstimator.estimate(text, 'standard');

      expect(res.baseCpm).toBe(600);
      expect(res.publication.bunkoPages).toBe(1); // 12 chars / 500 chars/p -> 1 page
      expect(res.publication.webNovelEpisodes).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty manuscript gracefully', () => {
      const res = estimator.estimate('');

      expect(res.rawCharacterCount).toBe(0);
      expect(res.cleanedCharacterCount).toBe(0);
      expect(res.dialogueCharacterCount).toBe(0);
      expect(res.narrativeCharacterCount).toBe(0);
      expect(res.dialogueRatio).toBe(0);
      expect(res.rawReadingTimeSeconds).toBe(0);
      expect(res.adjustedReadingTimeSeconds).toBe(0);
      expect(res.publication.bunkoPages).toBe(0);
      expect(res.publication.webNovelEpisodes).toBe(0);
    });
  });
});
