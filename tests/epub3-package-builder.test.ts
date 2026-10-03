import { describe, it, expect } from 'vitest';
import {
  Epub3PackageBuilder,
  escapeXml,
  generateUuid,
  type EpubPackageOptions,
} from '../src/core/export/Epub3PackageBuilder.js';

describe('Epub3PackageBuilder', () => {
  describe('escapeXml', () => {
    it('escapes special XML characters correctly', () => {
      const raw = 'Title & "Subtitle" <Author> \'Special\'';
      const escaped = escapeXml(raw);
      expect(escaped).toBe('Title &amp; &quot;Subtitle&quot; &lt;Author&gt; &apos;Special&apos;');
    });

    it('returns empty string for falsy input', () => {
      expect(escapeXml('')).toBe('');
    });
  });

  describe('generateUuid', () => {
    it('generates valid UUID v4 string pattern', () => {
      const uuid = generateUuid();
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });
  });

  describe('generateOpf', () => {
    it('generates valid package.opf XML with default rtl (vertical writing) metadata', () => {
      const options: EpubPackageOptions = {
        title: '銀河鉄道の夜',
        creator: '宮沢賢治',
        publisher: 'Plotailor Press',
        language: 'ja',
        direction: 'rtl',
        identifier: 'urn:uuid:12345678-1234-4234-8234-123456789abc',
        modified: '2026-10-03T12:00:00Z',
        items: [
          { id: 'ch1', href: 'text/ch1.xhtml', mediaType: 'application/xhtml+xml' },
        ],
      };

      const opf = Epub3PackageBuilder.generateOpf(options);

      expect(opf).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(opf).toContain('<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="ja" prefix="ebpaj: http://www.ebpaj.jp/">');
      expect(opf).toContain('<dc:identifier id="pub-id">urn:uuid:12345678-1234-4234-8234-123456789abc</dc:identifier>');
      expect(opf).toContain('<dc:title id="title">銀河鉄道の夜</dc:title>');
      expect(opf).toContain('<dc:creator id="creator">宮沢賢治</dc:creator>');
      expect(opf).toContain('<dc:publisher>Plotailor Press</dc:publisher>');
      expect(opf).toContain('<dc:language>ja</dc:language>');
      expect(opf).toContain('<meta property="dcterms:modified">2026-10-03T12:00:00Z</meta>');
      expect(opf).toContain('<meta property="ebpaj:guide-version">1.1.3</meta>');
      expect(opf).toContain('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />');
      expect(opf).toContain('<item id="ch1" href="text/ch1.xhtml" media-type="application/xhtml+xml" />');
      expect(opf).toContain('<spine page-progression-direction="rtl">');
      expect(opf).toContain('<itemref idref="nav" linear="no" />');
      expect(opf).toContain('<itemref idref="ch1" />');
    });

    it('supports ltr page progression direction for horizontal manuscripts', () => {
      const options: EpubPackageOptions = {
        title: 'Modern Science',
        direction: 'ltr',
        language: 'en',
      };

      const opf = Epub3PackageBuilder.generateOpf(options);
      expect(opf).toContain('<spine page-progression-direction="ltr">');
      expect(opf).toContain('xml:lang="en"');
    });

    it('escapes XML entities in metadata fields', () => {
      const options: EpubPackageOptions = {
        title: 'Alice & Bob\'s "Adventure" <Vol. 1>',
        creator: 'John & Jane <Doe>',
        publisher: 'A & B "Books"',
      };

      const opf = Epub3PackageBuilder.generateOpf(options);
      expect(opf).toContain('<dc:title id="title">Alice &amp; Bob&apos;s &quot;Adventure&quot; &lt;Vol. 1&gt;</dc:title>');
      expect(opf).toContain('<dc:creator id="creator">John &amp; Jane &lt;Doe&gt;</dc:creator>');
      expect(opf).toContain('<dc:publisher>A &amp; B &quot;Books&quot;</dc:publisher>');
    });

    it('includes cover image item when coverImageHref is provided', () => {
      const options: EpubPackageOptions = {
        title: 'Cover Book',
        coverImageHref: 'images/cover.jpg',
      };

      const opf = Epub3PackageBuilder.generateOpf(options);
      expect(opf).toContain('<item id="cover-image" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image" />');
    });

    it('handles Date object for modified property', () => {
      const testDate = new Date('2026-05-15T08:30:00Z');
      const options: EpubPackageOptions = {
        title: 'Date Test',
        modified: testDate,
      };

      const opf = Epub3PackageBuilder.generateOpf(options);
      expect(opf).toContain('<meta property="dcterms:modified">2026-05-15T08:30:00Z</meta>');
    });
  });

  describe('generateNavXhtml', () => {
    it('generates valid nav.xhtml with epub:type="toc" and epub:type="landmarks"', () => {
      const options: EpubPackageOptions = {
        title: '銀河鉄道の夜',
        navTitle: '目次',
        tocItems: [
          { title: '第一章 午後の授業', href: 'text/ch1.xhtml' },
          { title: '第二章 活版所', href: 'text/ch2.xhtml' },
        ],
        landmarks: [
          { type: 'toc', title: '目次', href: 'nav.xhtml' },
          { type: 'bodymatter', title: '本編', href: 'text/ch1.xhtml' },
        ],
      };

      const nav = Epub3PackageBuilder.generateNavXhtml(options);

      expect(nav).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(nav).toContain('<!DOCTYPE html>');
      expect(nav).toContain('<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ja" lang="ja">');
      expect(nav).toContain('<title>目次</title>');
      expect(nav).toContain('<nav epub:type="toc" id="toc">');
      expect(nav).toContain('<h1>目次</h1>');
      expect(nav).toContain('<li><a href="text/ch1.xhtml">第一章 午後の授業</a></li>');
      expect(nav).toContain('<li><a href="text/ch2.xhtml">第二章 活版所</a></li>');
      expect(nav).toContain('<nav epub:type="landmarks" id="landmarks" hidden="hidden">');
      expect(nav).toContain('<li><a epub:type="toc" href="nav.xhtml">目次</a></li>');
      expect(nav).toContain('<li><a epub:type="bodymatter" href="text/ch1.xhtml">本編</a></li>');
    });

    it('supports nested TOC structure with child chapters', () => {
      const options: EpubPackageOptions = {
        title: 'Nested Work',
        tocItems: [
          {
            title: '第一部',
            href: 'text/part1.xhtml',
            children: [
              { title: '第一章 序章', href: 'text/part1_ch1.xhtml' },
              { title: '第二章 旅立ち', href: 'text/part1_ch2.xhtml' },
            ],
          },
        ],
      };

      const nav = Epub3PackageBuilder.generateNavXhtml(options);

      expect(nav).toContain('<a href="text/part1.xhtml">第一部</a>');
      expect(nav).toContain('<a href="text/part1_ch1.xhtml">第一章 序章</a>');
      expect(nav).toContain('<a href="text/part1_ch2.xhtml">第二章 旅立ち</a>');
    });

    it('escapes XML characters in TOC titles and landmarks', () => {
      const options: EpubPackageOptions = {
        title: 'Escaped Nav',
        tocItems: [{ title: 'Chapter 1 & 2 <Special>', href: 'text/ch1.xhtml' }],
        landmarks: [{ type: 'bodymatter', title: 'Main & Content', href: 'text/ch1.xhtml' }],
      };

      const nav = Epub3PackageBuilder.generateNavXhtml(options);
      expect(nav).toContain('Chapter 1 &amp; 2 &lt;Special&gt;');
      expect(nav).toContain('Main &amp; Content');
    });
  });

  describe('buildPackage', () => {
    it('returns both opf and nav content in a single call', () => {
      const options: EpubPackageOptions = {
        title: 'Combined Build',
        creator: 'Tester',
      };

      const result = Epub3PackageBuilder.buildPackage(options);
      expect(result.opf).toContain('<dc:title id="title">Combined Build</dc:title>');
      expect(result.nav).toContain('<nav epub:type="toc" id="toc">');
    });
  });

  describe('fromChapters', () => {
    it('builds full EPUB3 OPF and Nav package from manuscript chapters', () => {
      const chapters = [
        { id: 'c1', title: '第一章 幻想の夜', content: '内容1' },
        { id: 'c2', title: '第二章 ジョバンニの切符', content: '内容2' },
      ];

      const { opf, nav, options } = Epub3PackageBuilder.fromChapters('銀河鉄道の夜', chapters, {
        creator: '宮沢賢治',
      });

      expect(options.direction).toBe('rtl');
      expect(options.language).toBe('ja');

      expect(opf).toContain('<dc:title id="title">銀河鉄道の夜</dc:title>');
      expect(opf).toContain('<dc:creator id="creator">宮沢賢治</dc:creator>');
      expect(opf).toContain('<item id="c1" href="text/ch1.xhtml" media-type="application/xhtml+xml" />');
      expect(opf).toContain('<item id="c2" href="text/ch2.xhtml" media-type="application/xhtml+xml" />');

      expect(nav).toContain('<a href="text/ch1.xhtml">第一章 幻想の夜</a>');
      expect(nav).toContain('<a href="text/ch2.xhtml">第二章 ジョバンニの切符</a>');
      expect(nav).toContain('<a epub:type="bodymatter" href="text/ch1.xhtml">本編</a>');
    });
  });
});
