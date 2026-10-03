/**
 * MultiSiteNovelFormatter - Export Formatter for Kakuyomu, Narou, and Denshokyo EPUB3 XHTML
 * 
 * Complies with 3-Pane Literature IDE Constitution:
 * - Pure, deterministic formatting pipeline (AST / Aozora text -> Platform-compliant output)
 * - Zero external HTTP requests (100% Local-First Web Worker compatible)
 * - Safe XML entity escaping and semantic typography tags for Denshokyo EPUB3
 */

import type { ExportTargetPlatform, MultiSiteExportOptions, MultiSiteExportResult } from '../types/multisite-export.js';
import type { LiteratureDocument, LiteratureNode } from '../../types/literature-ast.js';
import { LiteratureASTParser } from '../../lib/ast/literature-ast-parser.js';

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export class MultiSiteNovelFormatter {
  /**
   * Formats literature AST or raw text for specified platform.
   */
  public static format(
    input: LiteratureDocument | string,
    options: MultiSiteExportOptions
  ): MultiSiteExportResult {
    const doc = typeof input === 'string' ? LiteratureASTParser.parse(input) : input;

    switch (options.platform) {
      case 'kakuyomu':
        return this.formatForKakuyomu(doc, options);
      case 'narou':
        return this.formatForNarou(doc, options);
      case 'denshokyo_epub':
        return this.formatForDenshokyoEpub(doc, options);
      default:
        throw new Error(`Unsupported export platform: ${(options as any).platform}`);
    }
  }

  /**
   * Kakuyomu notation:
   * - Ruby: ｜漢字《るび》
   * - Bouten: 《《傍点》》
   */
  public static formatForKakuyomu(
    doc: LiteratureDocument,
    options?: Partial<MultiSiteExportOptions>
  ): MultiSiteExportResult {
    let rubyCount = 0;
    let boutenCount = 0;
    let characterCount = 0;
    let paragraphCount = 0;

    const formatNode = (node: LiteratureNode): string => {
      switch (node.type) {
        case 'root':
          return node.children.map(formatNode).join('\n\n');
        case 'paragraph': {
          paragraphCount++;
          const content = node.children.map(formatNode).join('');
          return content;
        }
        case 'heading': {
          const hashes = '#'.repeat(node.level);
          const title = node.children.map(formatNode).join('');
          return `${hashes} ${title}`;
        }
        case 'ruby': {
          rubyCount++;
          const parent = node.parent;
          characterCount += parent.length;
          return `｜${parent}《${node.ruby}》`;
        }
        case 'emphasis': {
          boutenCount++;
          const emText = node.text;
          characterCount += emText.length;
          return `《《${emText}》》`;
        }
        case 'text': {
          characterCount += node.value.length;
          return node.value;
        }
        case 'break':
          return '***';
        default:
          return '';
      }
    };

    const formattedContent = doc.children.map(formatNode).join('\n\n');

    return {
      platform: 'kakuyomu',
      formattedContent,
      stats: {
        rubyCount,
        boutenCount,
        characterCount,
        paragraphCount,
      },
      metadata: {
        title: options?.title,
        author: options?.author,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Shousetsuka ni Narou notation:
   * - Ruby: ｜漢字(るび) or 漢字(るび)
   * - Bouten: 1 char rubies with dots or 《《傍点》》
   */
  public static formatForNarou(
    doc: LiteratureDocument,
    options?: Partial<MultiSiteExportOptions>
  ): MultiSiteExportResult {
    let rubyCount = 0;
    let boutenCount = 0;
    let characterCount = 0;
    let paragraphCount = 0;

    const convertBoutenToDots = options?.convertBoutenToNarouDots ?? true;

    const formatNode = (node: LiteratureNode): string => {
      switch (node.type) {
        case 'root':
          return node.children.map(formatNode).join('\n\n');
        case 'paragraph': {
          paragraphCount++;
          const content = node.children.map(formatNode).join('');
          return content;
        }
        case 'heading': {
          const title = node.children.map(formatNode).join('');
          return `【${title}】`;
        }
        case 'ruby': {
          rubyCount++;
          const parent = node.parent;
          characterCount += parent.length;
          // Narou supports |漢字(るび)
          return `｜${parent}(${node.ruby})`;
        }
        case 'emphasis': {
          boutenCount++;
          const emText = node.text;
          characterCount += emText.length;
          if (convertBoutenToDots) {
            // Emulate bouten in Narou using dot rubies per character: ｜傍(・)｜点(・)
            return Array.from(emText)
              .map((ch) => `｜${ch}(・)`)
              .join('');
          }
          return `《《${emText}》》`;
        }
        case 'text': {
          characterCount += node.value.length;
          return node.value;
        }
        case 'break':
          return '――――――――――――――――';
        default:
          return '';
      }
    };

    const formattedContent = doc.children.map(formatNode).join('\n\n');

    return {
      platform: 'narou',
      formattedContent,
      stats: {
        rubyCount,
        boutenCount,
        characterCount,
        paragraphCount,
      },
      metadata: {
        title: options?.title,
        author: options?.author,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Denshokyo EPUB3 XHTML format:
   * - Strict XML escaping
   * - Semantic <ruby>漢字<rt>るび</rt></ruby>
   * - Denshokyo sesame bouten: <em class="emphasis-sesame">傍点</em>
   * - Vertical typesetting CSS class wrapper
   */
  public static formatForDenshokyoEpub(
    doc: LiteratureDocument,
    options?: Partial<MultiSiteExportOptions>
  ): MultiSiteExportResult {
    let rubyCount = 0;
    let boutenCount = 0;
    let characterCount = 0;
    let paragraphCount = 0;

    const headingLevel = options?.epubHeadingLevel ?? 2;

    const formatNode = (node: LiteratureNode): string => {
      switch (node.type) {
        case 'root':
          return node.children.map(formatNode).join('\n');
        case 'paragraph': {
          paragraphCount++;
          const content = node.children.map(formatNode).join('');
          const isDialogue = content.startsWith('「') && content.endsWith('」');
          return isDialogue ? `<p class="dialogue">${content}</p>` : `<p>${content}</p>`;
        }
        case 'heading': {
          const title = node.children.map(formatNode).join('');
          return `<h${headingLevel}>${title}</h${headingLevel}>`;
        }
        case 'ruby': {
          rubyCount++;
          const parent = node.parent;
          characterCount += parent.length;
          const baseEscaped = escapeXml(parent);
          const rubyEscaped = escapeXml(node.ruby);
          return `<ruby>${baseEscaped}<rt>${rubyEscaped}</rt></ruby>`;
        }
        case 'emphasis': {
          boutenCount++;
          const emText = node.text;
          characterCount += emText.length;
          const textEscaped = escapeXml(emText);
          return `<em class="emphasis-sesame">${textEscaped}</em>`;
        }
        case 'text': {
          characterCount += node.value.length;
          return escapeXml(node.value);
        }
        case 'break':
          return '<hr class="scene-break" />';
        default:
          return '';
      }
    };

    const innerHtml = doc.children.map(formatNode).join('\n');

    const fullXhtml = options?.includeXhtmlBoilerplate !== false
      ? `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ja" class="hltr">
<head>
  <meta charset="UTF-8" />
  <title>${escapeXml(options?.title ?? '無題')}</title>
  <link rel="stylesheet" type="text/css" href="../css/vertical-denshokyo.css" />
</head>
<body class="vrtl">
  <section class="chapter" epub:type="chapter">
${innerHtml.split('\n').map((line: string) => '    ' + line).join('\n')}
  </section>
</body>
</html>`
      : innerHtml;

    return {
      platform: 'denshokyo_epub',
      formattedContent: fullXhtml,
      stats: {
        rubyCount,
        boutenCount,
        characterCount,
        paragraphCount,
      },
      metadata: {
        title: options?.title,
        author: options?.author,
        generatedAt: new Date().toISOString(),
      },
    };
  }
}
