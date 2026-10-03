import { describe, it, expect } from 'vitest';
import { MultiSiteNovelFormatter, escapeXml } from '../src/core/exporters/multisite-novel-formatter.js';

describe('MultiSiteNovelFormatter - Kakuyomu, Narou & Denshokyo EPUB3 Exporter', () => {
  const sampleMarkdown = `
# 第一章　旅立ちの夜

彼は｜夜神《ライト》を見つめ、静かに呟いた。

「これこそが《《真実》》なのだ」

***

彼女は漢字《かんじ》の練習を続けた。
`.trim();

  describe('Kakuyomu Platform Formatting', () => {
    it('formats ruby and bouten compliant with Kakuyomu specs', () => {
      const result = MultiSiteNovelFormatter.format(sampleMarkdown, {
        platform: 'kakuyomu',
        title: 'テスト小説',
        author: '作者名',
      });

      expect(result.platform).toBe('kakuyomu');
      expect(result.formattedContent).toContain('# 第一章　旅立ちの夜');
      expect(result.formattedContent).toContain('｜夜神《ライト》');
      expect(result.formattedContent).toContain('《《真実》》');
      expect(result.formattedContent).toContain('「これこそが《《真実》》なのだ」');
      expect(result.stats.rubyCount).toBeGreaterThanOrEqual(1);
      expect(result.stats.boutenCount).toBe(1);
    });
  });

  describe('Shousetsuka ni Narou Platform Formatting', () => {
    it('formats ruby with parentheses and bouten with sesame dot rubies', () => {
      const result = MultiSiteNovelFormatter.format(sampleMarkdown, {
        platform: 'narou',
        convertBoutenToNarouDots: true,
      });

      expect(result.platform).toBe('narou');
      expect(result.formattedContent).toContain('【第一章　旅立ちの夜】');
      expect(result.formattedContent).toContain('｜夜神(ライト)');
      // Emulated bouten using dot rubies per character: ｜真(・)｜実(・)
      expect(result.formattedContent).toContain('｜真(・)｜実(・)');
      expect(result.formattedContent).toContain('――――――――――――――――');
      expect(result.stats.rubyCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Denshokyo EPUB3 XHTML Formatting', () => {
    it('formats semantic XHTML with ruby, sesame emphasis tags and XML boilerplate', () => {
      const result = MultiSiteNovelFormatter.format(sampleMarkdown, {
        platform: 'denshokyo_epub',
        title: '電書協テスト & 作品',
        includeXhtmlBoilerplate: true,
      });

      expect(result.platform).toBe('denshokyo_epub');
      expect(result.formattedContent).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(result.formattedContent).toContain('<html xmlns="http://www.w3.org/1999/xhtml"');
      expect(result.formattedContent).toContain('<ruby>夜神<rt>ライト</rt></ruby>');
      expect(result.formattedContent).toContain('<em class="emphasis-sesame">真実</em>');
      expect(result.formattedContent).toContain('<p class="dialogue">「これこそが<em class="emphasis-sesame">真実</em>なのだ」</p>');
      expect(result.formattedContent).toContain('<hr class="scene-break" />');
      expect(result.formattedContent).toContain('電書協テスト &amp; 作品');
    });

    it('escapes XML special characters strictly', () => {
      expect(escapeXml('<script>alert("test & \'fun\'")</script>')).toBe(
        '&lt;script&gt;alert(&quot;test &amp; &apos;fun&apos;&quot;)&lt;/script&gt;'
      );
    });
  });
});
