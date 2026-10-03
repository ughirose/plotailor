/**
 * EPUB3 Package & Navigation Document Auto-Builder
 *
 * Compliant with IDPF EPUB 3.0.1 & Denshokyo (EBPAJ) standards.
 */

export interface EpubManifestItem {
  id: string;
  href: string;
  mediaType: string;
  properties?: string;
  fallback?: string;
}

export interface EpubTocItem {
  id?: string;
  title: string;
  href: string;
  children?: EpubTocItem[];
}

export interface EpubLandmarkItem {
  type: 'toc' | 'bodymatter' | 'cover' | 'titlepage' | 'frontmatter' | 'backmatter' | string;
  title: string;
  href: string;
}

export interface EpubPackageOptions {
  identifier?: string;
  title: string;
  creator?: string;
  publisher?: string;
  language?: string;
  modified?: string | Date;
  direction?: 'rtl' | 'ltr';
  coverImageHref?: string;
  items?: EpubManifestItem[];
  spine?: string[];
  tocItems?: EpubTocItem[];
  landmarks?: EpubLandmarkItem[];
  navTitle?: string;
}

export interface ChapterInput {
  id: string;
  title: string;
  content?: string;
}

/**
 * Utility to escape special XML characters in string content and attributes.
 */
export function escapeXml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates a pseudo-UUID v4 string for EPUB identifier fallback.
 */
export function generateUuid(): string {
  const hexDigits = '0123456789abcdef';
  let uuid = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      uuid += '-';
    } else if (i === 14) {
      uuid += '4';
    } else if (i === 19) {
      uuid += hexDigits[(Math.random() * 16 | 0) & 0x3 | 0x8];
    } else {
      uuid += hexDigits[Math.random() * 16 | 0];
    }
  }
  return uuid;
}

export class Epub3PackageBuilder {
  /**
   * Generates standard EPUB3 package.opf XML string.
   */
  public static generateOpf(options: EpubPackageOptions): string {
    const title = options.title || '無題';
    const lang = options.language || 'ja';
    const direction = options.direction || 'rtl';
    const identifier = options.identifier || `urn:uuid:${generateUuid()}`;

    let modifiedStr: string;
    if (options.modified instanceof Date) {
      modifiedStr = options.modified.toISOString().replace(/\.\d{3}Z$/, 'Z');
    } else if (typeof options.modified === 'string' && options.modified.trim().length > 0) {
      modifiedStr = options.modified.trim();
    } else {
      modifiedStr = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    }

    const items: EpubManifestItem[] = [...(options.items || [])];

    // Ensure nav item exists in manifest
    const hasNav = items.some((item) => item.properties && item.properties.split(' ').includes('nav'));
    if (!hasNav) {
      const existingNav = items.find((item) => item.id === 'nav' || item.href === 'nav.xhtml');
      if (existingNav) {
        existingNav.properties = existingNav.properties ? `${existingNav.properties} nav` : 'nav';
      } else {
        items.unshift({
          id: 'nav',
          href: 'nav.xhtml',
          mediaType: 'application/xhtml+xml',
          properties: 'nav',
        });
      }
    }

    // Cover image item if provided
    if (options.coverImageHref) {
      const hasCover = items.some((item) => item.properties && item.properties.split(' ').includes('cover-image'));
      if (!hasCover) {
        const coverExt = options.coverImageHref.split('.').pop()?.toLowerCase();
        let mediaType = 'image/jpeg';
        if (coverExt === 'png') mediaType = 'image/png';
        if (coverExt === 'gif') mediaType = 'image/gif';
        if (coverExt === 'webp') mediaType = 'image/webp';
        if (coverExt === 'svg') mediaType = 'image/svg+xml';

        items.push({
          id: 'cover-image',
          href: options.coverImageHref,
          mediaType,
          properties: 'cover-image',
        });
      }
    }

    // Spine items
    let spineIds: string[] = options.spine ? [...options.spine] : [];
    if (spineIds.length === 0) {
      // Fallback: derive spine from manifest items (excluding nav if linear=no or including nav first)
      spineIds = items
        .filter((item) => item.mediaType === 'application/xhtml+xml')
        .map((item) => item.id);
    }

    // Build XML string
    const lines: string[] = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push('<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="' + escapeXml(lang) + '" prefix="ebpaj: http://www.ebpaj.jp/">');
    lines.push('  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">');
    lines.push(`    <dc:identifier id="pub-id">${escapeXml(identifier)}</dc:identifier>`);
    lines.push(`    <dc:title id="title">${escapeXml(title)}</dc:title>`);
    lines.push(`    <dc:language>${escapeXml(lang)}</dc:language>`);
    lines.push(`    <meta property="dcterms:modified">${escapeXml(modifiedStr)}</meta>`);

    if (options.creator) {
      lines.push(`    <dc:creator id="creator">${escapeXml(options.creator)}</dc:creator>`);
      lines.push('    <meta refines="#creator" property="role" scheme="marc:relators">aut</meta>');
    }

    if (options.publisher) {
      lines.push(`    <dc:publisher>${escapeXml(options.publisher)}</dc:publisher>`);
    }

    lines.push('    <meta property="ebpaj:guide-version">1.1.3</meta>');
    lines.push('  </metadata>');

    lines.push('  <manifest>');
    for (const item of items) {
      let attr = `id="${escapeXml(item.id)}" href="${escapeXml(item.href)}" media-type="${escapeXml(item.mediaType)}"`;
      if (item.properties) {
        attr += ` properties="${escapeXml(item.properties)}"`;
      }
      if (item.fallback) {
        attr += ` fallback="${escapeXml(item.fallback)}"`;
      }
      lines.push(`    <item ${attr} />`);
    }
    lines.push('  </manifest>');

    lines.push(`  <spine page-progression-direction="${escapeXml(direction)}">`);
    for (const id of spineIds) {
      const item = items.find((it) => it.id === id);
      const isNav = item && item.properties && item.properties.split(' ').includes('nav');
      if (isNav) {
        lines.push(`    <itemref idref="${escapeXml(id)}" linear="no" />`);
      } else {
        lines.push(`    <itemref idref="${escapeXml(id)}" />`);
      }
    }
    lines.push('  </spine>');

    lines.push('</package>');

    return lines.join('\n');
  }

  /**
   * Generates EPUB3 nav.xhtml Navigation Document XML string.
   */
  public static generateNavXhtml(options: EpubPackageOptions): string {
    const lang = options.language || 'ja';
    const navTitle = options.navTitle || '目次';
    const tocItems = options.tocItems || [];
    const landmarks = options.landmarks || [];

    const lines: string[] = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push('<!DOCTYPE html>');
    lines.push(
      `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(lang)}" lang="${escapeXml(lang)}">`
    );
    lines.push('<head>');
    lines.push('  <meta charset="UTF-8" />');
    lines.push(`  <title>${escapeXml(navTitle)}</title>`);
    lines.push('  <style type="text/css">');
    lines.push('    nav ol { list-style-type: none; padding-left: 0; }');
    lines.push('    nav li { margin: 0.5em 0; }');
    lines.push('    nav a { text-decoration: none; color: inherit; }');
    lines.push('  </style>');
    lines.push('</head>');
    lines.push('<body>');

    // Table of Contents <nav epub:type="toc">
    lines.push('  <nav epub:type="toc" id="toc">');
    lines.push(`    <h1>${escapeXml(navTitle)}</h1>`);
    lines.push(this.renderTocOl(tocItems, 2));
    lines.push('  </nav>');

    // Landmarks <nav epub:type="landmarks">
    if (landmarks.length > 0) {
      lines.push('  <nav epub:type="landmarks" id="landmarks" hidden="hidden">');
      lines.push('    <h2>ランドマーク</h2>');
      lines.push('    <ol>');
      for (const lm of landmarks) {
        lines.push(
          `      <li><a epub:type="${escapeXml(lm.type)}" href="${escapeXml(lm.href)}">${escapeXml(lm.title)}</a></li>`
        );
      }
      lines.push('    </ol>');
      lines.push('  </nav>');
    }

    lines.push('</body>');
    lines.push('</html>');

    return lines.join('\n');
  }

  /**
   * Helper to render nested <ol> structure for TOC.
   */
  private static renderTocOl(items: EpubTocItem[], indentLevel: number): string {
    const indent = '  '.repeat(indentLevel);
    if (items.length === 0) {
      return `${indent}<ol>\n${indent}  <li><a href="text/ch1.xhtml">本文</a></li>\n${indent}</ol>`;
    }

    const lines: string[] = [];
    lines.push(`${indent}<ol>`);

    for (const item of items) {
      const idAttr = item.id ? ` id="${escapeXml(item.id)}"` : '';
      if (item.children && item.children.length > 0) {
        lines.push(`${indent}  <li${idAttr}>`);
        lines.push(`${indent}    <a href="${escapeXml(item.href)}">${escapeXml(item.title)}</a>`);
        lines.push(this.renderTocOl(item.children, indentLevel + 2));
        lines.push(`${indent}  </li>`);
      } else {
        lines.push(`${indent}  <li${idAttr}><a href="${escapeXml(item.href)}">${escapeXml(item.title)}</a></li>`);
      }
    }

    lines.push(`${indent}</ol>`);
    return lines.join('\n');
  }

  /**
   * Helper to build both package.opf and nav.xhtml together.
   */
  public static buildPackage(options: EpubPackageOptions): { opf: string; nav: string } {
    return {
      opf: this.generateOpf(options),
      nav: this.generateNavXhtml(options),
    };
  }

  /**
   * Convenience helper to create OPF & Nav from a list of manuscript chapters.
   */
  public static fromChapters(
    title: string,
    chapters: ChapterInput[],
    options: Partial<EpubPackageOptions> = {}
  ): { opf: string; nav: string; options: EpubPackageOptions } {
    const items: EpubManifestItem[] = [
      {
        id: 'nav',
        href: 'nav.xhtml',
        mediaType: 'application/xhtml+xml',
        properties: 'nav',
      },
    ];

    const spine: string[] = [];
    const tocItems: EpubTocItem[] = [];

    chapters.forEach((ch, idx) => {
      const itemId = ch.id || `item-ch-${idx + 1}`;
      const href = `text/ch${idx + 1}.xhtml`;

      items.push({
        id: itemId,
        href,
        mediaType: 'application/xhtml+xml',
      });

      spine.push(itemId);

      tocItems.push({
        id: `toc-${itemId}`,
        title: ch.title,
        href,
      });
    });

    const defaultLandmarks: EpubLandmarkItem[] = [
      { type: 'toc', title: '目次', href: 'nav.xhtml' },
    ];
    if (tocItems.length > 0) {
      defaultLandmarks.push({ type: 'bodymatter', title: '本編', href: tocItems[0].href });
    }

    const fullOptions: EpubPackageOptions = {
      title,
      direction: 'rtl',
      language: 'ja',
      items,
      spine,
      tocItems,
      landmarks: defaultLandmarks,
      ...options,
    };

    const pkg = this.buildPackage(fullOptions);
    return {
      opf: pkg.opf,
      nav: pkg.nav,
      options: fullOptions,
    };
  }
}
