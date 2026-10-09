/**
 * Denshokyo (EBPAJ) EPUB 3 Binary Packager
 * 
 * Generates production-ready, reflowable EPUB 3.0.1 binaries (.epub)
 * adhering strictly to the Japan Electronic Publishers Association (EBPAJ / 電書協) guidelines.
 * 
 * Container structure:
 * - mimetype (STORE, 20 bytes)
 * - META-INF/container.xml
 * - item/standard.opf
 * - item/navigation-documents.xhtml
 * - item/style/vertical-denshokyo.css
 * - item/xhtml/p-title.xhtml (扉)
 * - item/xhtml/p-001.xhtml ... (各章XHTML)
 * - item/xhtml/p-colophon.xhtml (奥付)
 */

import { ZipArchiveBuilder } from './ZipArchiveBuilder.js';
import { escapeXml, generateUuid } from './Epub3PackageBuilder.js';
import { normalizeAozoraMarkup } from './LiteraryExporter.js';

export interface EpubBinaryChapter {
  id?: string;
  title: string;
  content: string;
}

export interface EpubBinaryOptions {
  title: string;
  author?: string;
  publisher?: string;
  language?: string;
  direction?: 'rtl' | 'ltr';
  identifier?: string;
  modifiedDate?: Date | string;
  publishedDate?: string;
  enableTcy?: boolean; // 自動縦中横変換 (2桁数字・!?記号)
  tocTitle?: string;
}

export class Epub3BinaryPackager {
  /**
   * Transforms manuscript text (Aozora / Markdown / plain) into EBPAJ-compliant body XHTML.
   */
  public static convertTextToXhtmlBody(text: string, options: { enableTcy?: boolean } = {}): string {
    if (!text) return '';

    // 1. First normalize Aozora ruby and bouten markup
    let working = normalizeAozoraMarkup(text);

    // 2. Escape XML entities (&, <, >, ", ')
    working = working
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // 3. Convert Bouten to EBPAJ <em class="emphasis-sesame">...</em>
    working = working.replace(/［＃傍点］(.*?)［＃傍点終わり］/g, '<em class="emphasis-sesame">$1</em>');
    working = working.replace(/［＃「([^」\n]+)」に傍点］/g, '<em class="emphasis-sesame">$1</em>');

    // 4. Convert Aozora ruby to <ruby>...<rt>...</rt></ruby>
    // ｜親文字《るび》
    working = working.replace(/｜([^《\n]+?)《([^》\n]+?)》/g, '<ruby>$1<rt>$2</rt></ruby>');
    // Fallback: 親文字《るび》
    working = working.replace(/([\u4E00-\u9FFF々ヶ〆仝\u30A1-\u30FAー]+)《([^》\n]+?)》/g, '<ruby>$1<rt>$2</rt></ruby>');

    // 5. Convert Scene breaks (***, ---, ［＃改丁］, ［＃改ページ］)
    working = working.replace(/［＃改[ペ丁]ージ?］/g, '<hr class="scene-break" />');

    // 6. Optional: Tate-Chu-Yoko (TCY) for 2-digit numbers and !? / !!
    if (options.enableTcy !== false) {
      // 2-digit ASCII numbers surrounded by non-digits
      working = working.replace(/(^|[^\d])(\d{2})([^\d]|$)/g, '$1<span class="tcy">$2</span>$3');
      // Double exclamation / question marks
      working = working.replace(/([!?！？]{2})/g, '<span class="tcy">$1</span>');
    }

    // 7. Format Paragraphs & Dialogues
    const lines = working.split('\n');
    return lines
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return '<p><br /></p>';
        }
        if (trimmed.startsWith('<hr class="scene-break"')) {
          return trimmed;
        }
        // Dialogue detection: starts with bracket
        const isDialogue = /^([「『（【]|&lt;)/.test(trimmed);
        if (isDialogue) {
          return `<p class="dialogue">${trimmed}</p>`;
        }
        return `<p>${trimmed}</p>`;
      })
      .join('\n');
  }

  /**
   * Generates Denshokyo vertical CSS stylesheet.
   */
  public static generateDenshokyoCss(direction: 'rtl' | 'ltr' = 'rtl'): string {
    const isVertical = direction === 'rtl';
    return `@charset "UTF-8";
/**
 * EBPAJ (電書協) EPUB 3 Reflow Stylesheet
 * Standard Vertical / Horizontal Typesetting for Literature
 */
html {
  font-family: "游明朝", "Yu Mincho", "Hiragino Mincho ProN", "BIZ UDPMincho", serif;
  ${isVertical ? '-webkit-writing-mode: vertical-rl; writing-mode: vertical-rl;' : '-webkit-writing-mode: horizontal-tb; writing-mode: horizontal-tb;'}
  line-height: 1.85;
}

body {
  margin: 0;
  padding: ${isVertical ? '2em 1.5em' : '1.5em 2em'};
  text-orientation: ${isVertical ? 'mixed' : 'upright'};
}

h1, h2, h3 {
  font-weight: 700;
  line-height: 1.4;
  page-break-before: always;
  break-before: page;
}

h1.work-title {
  font-size: 2.2em;
  margin: 2em 0 1em 0;
  letter-spacing: 0.1em;
}

h2.chapter-title {
  font-size: 1.5em;
  margin: 1.5em 0 1.2em 0;
  letter-spacing: 0.08em;
}

p {
  margin: 0;
  padding: 0;
  text-indent: 1em;
  text-align: justify;
}

p.dialogue {
  text-indent: 0;
}

ruby {
  -epub-ruby-position: over;
  ruby-position: over;
  ruby-align: center;
}

rt {
  font-size: 0.5em;
  letter-spacing: 0;
}

/* 傍点・圏点 (ゴマ点 / 丸点) */
em.emphasis-sesame, .em-sesame {
  -epub-text-emphasis-style: filled sesame;
  -webkit-text-emphasis-style: filled sesame;
  text-emphasis: filled sesame;
  font-style: normal;
}

em.emphasis-dot, .em-dot {
  -epub-text-emphasis-style: filled dot;
  -webkit-text-emphasis-style: filled dot;
  text-emphasis: filled dot;
  font-style: normal;
}

/* 縦中横 */
span.tcy {
  -epub-text-combine: horizontal;
  -webkit-text-combine: horizontal;
  text-combine-upright: all;
  letter-spacing: 0;
}

/* シーン区切り */
hr.scene-break {
  border: none;
  margin: 2em 0;
  text-align: center;
  height: 1.5em;
}

hr.scene-break::before {
  content: "◆　◆　◆";
  font-size: 0.8em;
  color: #666;
  letter-spacing: 0.2em;
}

/* 扉ページ */
.titlepage-container {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  height: 100%;
}

.titlepage-author {
  font-size: 1.3em;
  color: #444;
  margin-top: 3em;
}

.titlepage-publisher {
  font-size: 1em;
  color: #777;
  margin-top: 4em;
}

/* 奥付 */
.colophon-container {
  margin-top: 4em;
  padding-top: 2em;
  border-top: 1px solid #aaa;
  font-size: 0.9em;
  line-height: 1.8;
}

.colophon-title {
  font-size: 1.3em;
  font-weight: bold;
  margin-bottom: 1em;
}
`;
  }

  /**
   * Assembles a complete EBPAJ EPUB3 binary package (.epub).
   */
  public static createPackage(
    chapters: EpubBinaryChapter[],
    options: EpubBinaryOptions
  ): Uint8Array {
    const builder = new ZipArchiveBuilder();
    const title = options.title || '無題';
    const author = options.author || '作者不詳';
    const publisher = options.publisher || 'Plotailor Press';
    const lang = options.language || 'ja';
    const direction = options.direction || 'rtl';
    const identifier = options.identifier || `urn:uuid:${generateUuid()}`;
    const tocTitle = options.tocTitle || '目次';

    let modifiedStr: string;
    if (options.modifiedDate instanceof Date) {
      modifiedStr = options.modifiedDate.toISOString().replace(/\.\d{3}Z$/, 'Z');
    } else if (typeof options.modifiedDate === 'string' && options.modifiedDate.trim().length > 0) {
      modifiedStr = options.modifiedDate.trim();
    } else {
      modifiedStr = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    }

    // 1. Mandatory EPUB mimetype as first entry (STORE / 20 bytes)
    builder.addFile('mimetype', 'application/epub+zip');

    // 2. META-INF/container.xml pointing to item/standard.opf
    const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="item/standard.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
    builder.addFile('META-INF/container.xml', containerXml);

    // 3. Stylesheet: item/style/vertical-denshokyo.css
    const cssContent = this.generateDenshokyoCss(direction);
    builder.addFile('item/style/vertical-denshokyo.css', cssContent);

    // 4. Generate Chapter XHTML files: item/xhtml/p-001.xhtml ...
    const manifestItems: { id: string; href: string; mediaType: string; properties?: string }[] = [
      { id: 'style', href: 'style/vertical-denshokyo.css', mediaType: 'text/css' },
      { id: 'nav', href: 'navigation-documents.xhtml', mediaType: 'application/xhtml+xml', properties: 'nav' },
      { id: 'p-title', href: 'xhtml/p-title.xhtml', mediaType: 'application/xhtml+xml' },
    ];

    const spineItemIds: string[] = ['p-title', 'nav'];
    const tocEntries: { title: string; href: string }[] = [
      { title: '扉', href: 'xhtml/p-title.xhtml' },
    ];

    // 4.1. Title page: item/xhtml/p-title.xhtml
    const titlePageXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(lang)}" lang="${escapeXml(lang)}">
<head>
  <meta charset="UTF-8" />
  <title>${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="../style/vertical-denshokyo.css" />
</head>
<body class="${direction === 'rtl' ? 'vrtl' : 'hltr'}">
  <section class="titlepage-container" epub:type="titlepage">
    <h1 class="work-title">${escapeXml(title)}</h1>
    <div class="titlepage-author">${escapeXml(author)}</div>
    <div class="titlepage-publisher">${escapeXml(publisher)}</div>
  </section>
</body>
</html>`;
    builder.addFile('item/xhtml/p-title.xhtml', titlePageXhtml);

    // 4.2. Chapter pages
    chapters.forEach((ch, idx) => {
      const numStr = String(idx + 1).padStart(3, '0');
      const itemId = `p-${numStr}`;
      const href = `xhtml/p-${numStr}.xhtml`;
      const bodyHtml = this.convertTextToXhtmlBody(ch.content, { enableTcy: options.enableTcy });

      manifestItems.push({
        id: itemId,
        href,
        mediaType: 'application/xhtml+xml',
      });
      spineItemIds.push(itemId);
      tocEntries.push({
        title: ch.title,
        href,
      });

      const chapterXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(lang)}" lang="${escapeXml(lang)}">
<head>
  <meta charset="UTF-8" />
  <title>${escapeXml(ch.title)}</title>
  <link rel="stylesheet" type="text/css" href="../style/vertical-denshokyo.css" />
</head>
<body class="${direction === 'rtl' ? 'vrtl' : 'hltr'}">
  <section class="chapter" epub:type="chapter">
    <h2 class="chapter-title">${escapeXml(ch.title)}</h2>
    <div class="chapter-body">
${bodyHtml.split('\n').map((l) => '      ' + l).join('\n')}
    </div>
  </section>
</body>
</html>`;
      builder.addFile(`item/${href}`, chapterXhtml);
    });

    // 4.3. Colophon: item/xhtml/p-colophon.xhtml
    const colophonItemId = 'p-colophon';
    manifestItems.push({
      id: colophonItemId,
      href: 'xhtml/p-colophon.xhtml',
      mediaType: 'application/xhtml+xml',
    });
    spineItemIds.push(colophonItemId);
    tocEntries.push({
      title: '奥付',
      href: 'xhtml/p-colophon.xhtml',
    });

    const colophonDate = options.publishedDate || new Date().toISOString().split('T')[0];
    const colophonXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(lang)}" lang="${escapeXml(lang)}">
<head>
  <meta charset="UTF-8" />
  <title>奥付</title>
  <link rel="stylesheet" type="text/css" href="../style/vertical-denshokyo.css" />
</head>
<body class="${direction === 'rtl' ? 'vrtl' : 'hltr'}">
  <section class="colophon-container" epub:type="colophon">
    <div class="colophon-title">${escapeXml(title)}</div>
    <p>著　者：${escapeXml(author)}</p>
    <p>発行所：${escapeXml(publisher)}</p>
    <p>発行日：${escapeXml(colophonDate)}</p>
    <p>組　版：Plotailor 文芸執筆統合環境 (EBPAJ EPUB3 Engine)</p>
    <p>識別子：${escapeXml(identifier)}</p>
  </section>
</body>
</html>`;
    builder.addFile('item/xhtml/p-colophon.xhtml', colophonXhtml);

    // 5. item/navigation-documents.xhtml (Navigation document)
    const navLines: string[] = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE html>',
      `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(lang)}" lang="${escapeXml(lang)}">`,
      '<head>',
      '  <meta charset="UTF-8" />',
      `  <title>${escapeXml(tocTitle)}</title>`,
      '  <link rel="stylesheet" type="text/css" href="style/vertical-denshokyo.css" />',
      '</head>',
      `<body>`,
      '  <nav epub:type="toc" id="toc">',
      `    <h1>${escapeXml(tocTitle)}</h1>`,
      '    <ol>',
    ];

    for (const toc of tocEntries) {
      navLines.push(`      <li><a href="${escapeXml(toc.href)}">${escapeXml(toc.title)}</a></li>`);
    }

    navLines.push('    </ol>');
    navLines.push('  </nav>');
    navLines.push('  <nav epub:type="landmarks" id="landmarks" hidden="hidden">');
    navLines.push('    <h2>ランドマーク</h2>');
    navLines.push('    <ol>');
    navLines.push('      <li><a epub:type="titlepage" href="xhtml/p-title.xhtml">扉</a></li>');
    navLines.push('      <li><a epub:type="toc" href="navigation-documents.xhtml">目次</a></li>');
    if (chapters.length > 0) {
      navLines.push('      <li><a epub:type="bodymatter" href="xhtml/p-001.xhtml">本編</a></li>');
    }
    navLines.push('      <li><a epub:type="colophon" href="xhtml/p-colophon.xhtml">奥付</a></li>');
    navLines.push('    </ol>');
    navLines.push('  </nav>');
    navLines.push('</body>');
    navLines.push('</html>');

    builder.addFile('item/navigation-documents.xhtml', navLines.join('\n'));

    // 6. item/standard.opf (Package Document)
    const opfLines: string[] = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="${escapeXml(lang)}" prefix="ebpaj: http://www.ebpaj.jp/">`,
      '  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">',
      `    <dc:identifier id="pub-id">${escapeXml(identifier)}</dc:identifier>`,
      `    <dc:title id="title">${escapeXml(title)}</dc:title>`,
      `    <dc:creator id="creator">${escapeXml(author)}</dc:creator>`,
      `    <dc:publisher>${escapeXml(publisher)}</dc:publisher>`,
      `    <dc:language>${escapeXml(lang)}</dc:language>`,
      `    <meta property="dcterms:modified">${escapeXml(modifiedStr)}</meta>`,
      '    <meta property="ebpaj:guide-version">1.1.3</meta>',
      '  </metadata>',
      '  <manifest>',
    ];

    for (const it of manifestItems) {
      let attr = `id="${escapeXml(it.id)}" href="${escapeXml(it.href)}" media-type="${escapeXml(it.mediaType)}"`;
      if (it.properties) {
        attr += ` properties="${escapeXml(it.properties)}"`;
      }
      opfLines.push(`    <item ${attr} />`);
    }

    opfLines.push('  </manifest>');
    opfLines.push(`  <spine page-progression-direction="${escapeXml(direction)}">`);
    for (const spineId of spineItemIds) {
      if (spineId === 'nav') {
        opfLines.push(`    <itemref idref="${escapeXml(spineId)}" linear="no" />`);
      } else {
        opfLines.push(`    <itemref idref="${escapeXml(spineId)}" />`);
      }
    }
    opfLines.push('  </spine>');
    opfLines.push('</package>');

    builder.addFile('item/standard.opf', opfLines.join('\n'));

    // Build and return final ZIP binary
    return builder.buildUint8Array();
  }
}
