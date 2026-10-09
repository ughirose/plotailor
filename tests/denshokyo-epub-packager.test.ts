import { describe, it, expect } from 'vitest';
import {
  Epub3BinaryPackager,
  type EpubBinaryChapter,
  type EpubBinaryOptions,
} from '../src/core/export/Epub3BinaryPackager.js';

describe('Epub3BinaryPackager (Denshokyo EBPAJ EPUB3)', () => {
  describe('convertTextToXhtmlBody', () => {
    it('converts ruby and bouten markup to semantic EBPAJ elements', () => {
      const input = '彼の名は｜星辰《せいしん》の《《守護者》》。';
      const output = Epub3BinaryPackager.convertTextToXhtmlBody(input);

      expect(output).toContain('<ruby>星辰<rt>せいしん</rt></ruby>');
      expect(output).toContain('<em class="emphasis-sesame">守護者</em>');
    });

    it('wraps dialogues in p.dialogue and normal text in p', () => {
      const input = '地の文の始まり。\n「喋った言葉」\n『心の声』';
      const output = Epub3BinaryPackager.convertTextToXhtmlBody(input);

      expect(output).toContain('<p>地の文の始まり。</p>');
      expect(output).toContain('<p class="dialogue">「喋った言葉」</p>');
      expect(output).toContain('<p class="dialogue">『心の声』</p>');
    });

    it('applies vertical tate-chu-yoko (tcy) to 2-digit numbers and double exclamation marks', () => {
      const input = '第12章の結末は本当か！？';
      const output = Epub3BinaryPackager.convertTextToXhtmlBody(input, { enableTcy: true });

      expect(output).toContain('<span class="tcy">12</span>');
      expect(output).toContain('<span class="tcy">！？</span>');
    });

    it('transforms scene breaks into semantic hr elements', () => {
      const input = '前編の終わり。\n［＃改ページ］\n後編の始まり。';
      const output = Epub3BinaryPackager.convertTextToXhtmlBody(input);

      expect(output).toContain('<hr class="scene-break" />');
    });
  });

  describe('createPackage', () => {
    it('builds a binary EPUB3 package conforming to EBPAJ reflow specifications', () => {
      const chapters: EpubBinaryChapter[] = [
        {
          title: '第一章 黎明の兆し',
          content: '静かな夜だった。\n「誰かいるのか？」\n彼は立ち上がった。',
        },
        {
          title: '第二章 遥かなる旅路',
          content: '旅立ちの朝が来た。24頭の駿馬が駆け抜ける。',
        },
      ];

      const options: EpubBinaryOptions = {
        title: '星辰の年代記',
        author: 'プロテイラー作家',
        publisher: '電書協文庫',
        direction: 'rtl',
        enableTcy: true,
      };

      const epubBytes = Epub3BinaryPackager.createPackage(chapters, options);
      expect(epubBytes).toBeInstanceOf(Uint8Array);
      expect(epubBytes.length).toBeGreaterThan(500);

      const decoder = new TextDecoder();
      const rawText = decoder.decode(epubBytes);

      // Verify essential EPUB container items are in the binary archive
      expect(rawText).toContain('mimetype');
      expect(rawText).toContain('application/epub+zip');
      expect(rawText).toContain('META-INF/container.xml');
      expect(rawText).toContain('item/standard.opf');
      expect(rawText).toContain('item/navigation-documents.xhtml');
      expect(rawText).toContain('item/style/vertical-denshokyo.css');
      expect(rawText).toContain('item/xhtml/p-title.xhtml');
      expect(rawText).toContain('item/xhtml/p-001.xhtml');
      expect(rawText).toContain('item/xhtml/p-002.xhtml');
      expect(rawText).toContain('item/xhtml/p-colophon.xhtml');

      // Verify EBPAJ OPF metadata
      expect(rawText).toContain('prefix="ebpaj: http://www.ebpaj.jp/"');
      expect(rawText).toContain('page-progression-direction="rtl"');
      expect(rawText).toContain('<dc:title id="title">星辰の年代記</dc:title>');
      expect(rawText).toContain('<dc:creator id="creator">プロテイラー作家</dc:creator>');
      expect(rawText).toContain('<meta property="ebpaj:guide-version">1.1.3</meta>');

      // Verify CSS vertical styles
      expect(rawText).toContain('writing-mode: vertical-rl');
      expect(rawText).toContain('-epub-text-emphasis-style: filled sesame');
      expect(rawText).toContain('text-combine-upright: all');
    });
  });
});
