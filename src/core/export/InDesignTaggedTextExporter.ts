/**
 * InDesign Tagged Text Exporter
 * 
 * Generates Adobe InDesign Tagged Text (<UNICODE-WIN>) for professional DTP,
 * commercial publishing, and offset/digital printing presses.
 * 
 * Supports:
 * - Paragraph styles: タイトル (Title), 大見出し (Heading 1), 本文 (Body), 会話文 (Dialogue)
 * - InDesign Ruby tags: <cr:1><crst:るび>親文字<cr:>
 * - InDesign Kenten / Bouten tags: <cKentenKind:1><cKentenPosition:0>傍点<cKentenKind:0>
 * - InDesign Tatechuyoko (TCY): <ct:1>12<ct:0>
 * - Automatic dialogue indent bypass and body 1-em indent
 * - Page breaks and scene breaks
 */

import { normalizeAozoraMarkup } from './LiteraryExporter.js';

export interface InDesignChapterInput {
  title: string;
  content: string;
}

export interface InDesignExportOptions {
  author?: string;
  fontFamily?: string;
  bodyFontSize?: number;
  bodyLeading?: number;
  enableTcy?: boolean;
  kentenKind?: 'sesame' | 'dot';
}

export class InDesignTaggedTextExporter {
  /**
   * Escapes literal angle brackets and backslashes for InDesign Tagged Text.
   */
  public static escapeInDesignText(text: string): string {
    if (!text) return '';
    return text
      .replace(/\\/g, '\\\\')
      .replace(/</g, '\\<')
      .replace(/>/g, '\\>');
  }

  /**
   * Generates header style definitions for <UNICODE-WIN>.
   */
  public static generateStyleDefinitions(options: InDesignExportOptions = {}): string {
    const font = options.fontFamily || 'A-OTF リュウミン Pr6N';
    const bodySize = (options.bodyFontSize || 13).toFixed(6);
    const bodyLeading = (options.bodyLeading || 22).toFixed(6);

    const lines: string[] = [
      '<UNICODE-WIN>',
      `<DefineParaStyle:タイトル=<Nextstyle:本文><cSize:24.000000><cLeading:34.000000><cFont:${font}><cTypeface:B-KL><pAlignment:Center>>`,
      `<DefineParaStyle:著者=<Nextstyle:本文><cSize:14.000000><cLeading:24.000000><cFont:${font}><cTypeface:M-KL><pAlignment:Center>>`,
      `<DefineParaStyle:大見出し=<Nextstyle:本文><cSize:16.000000><cLeading:26.000000><cFont:${font}><cTypeface:B-KL><pPageBreakBefore:1>>`,
      `<DefineParaStyle:中見出し=<Nextstyle:本文><cSize:14.000000><cLeading:24.000000><cFont:${font}><cTypeface:M-KL>>`,
      `<DefineParaStyle:本文=<Nextstyle:本文><cSize:${bodySize}><cLeading:${bodyLeading}><cFont:${font}><cTypeface:L-KL><pFirstLineIndent:${bodySize}>>`,
      `<DefineParaStyle:会話文=<Nextstyle:会話文><cSize:${bodySize}><cLeading:${bodyLeading}><cFont:${font}><cTypeface:L-KL><pFirstLineIndent:0.000000>>`,
      `<DefineParaStyle:区切り=<Nextstyle:本文><cSize:12.000000><cLeading:20.000000><cFont:${font}><cTypeface:L-KL><pAlignment:Center>>`,
      '',
    ];

    return lines.join('\r\n');
  }

  /**
   * Converts manuscript content into InDesign tagged paragraphs and inline tags.
   */
  public static formatContentToInDesign(
    content: string,
    options: InDesignExportOptions = {}
  ): string {
    if (!content) return '';

    // 1. Normalize Aozora markup
    let working = normalizeAozoraMarkup(content);

    // 2. Identify ruby, bouten, tcy, breaks with placeholders before escaping
    const kentenCode = options.kentenKind === 'dot' ? 2 : 1; // 1: sesame (ゴマ点), 2: small dot (黒丸点)

    // Bouten: ［＃傍点］...［＃傍点終わり］
    working = working.replace(/［＃傍点］(.*?)［＃傍点終わり］/g, (_, text) => {
      return `\uE001KENTEN_START\uE001${text}\uE001KENTEN_END\uE001`;
    });
    working = working.replace(/［＃「([^」\n]+)」に傍点］/g, (_, text) => {
      return `\uE001KENTEN_START\uE001${text}\uE001KENTEN_END\uE001`;
    });

    // Ruby: ｜親文字《るび》
    working = working.replace(/｜([^《\n]+?)《([^》\n]+?)》/g, (_, base, ruby) => {
      return `\uE001RUBY_START:${ruby}\uE001${base}\uE001RUBY_END\uE001`;
    });
    working = working.replace(/([\u4E00-\u9FFF々ヶ〆仝\u30A1-\u30FAー]+)《([^》\n]+?)》/g, (_, base, ruby) => {
      return `\uE001RUBY_START:${ruby}\uE001${base}\uE001RUBY_END\uE001`;
    });

    // TCY (Tate-Chu-Yoko)
    if (options.enableTcy !== false) {
      working = working.replace(/(^|[^\d])(\d{2})([^\d]|$)/g, '$1\uE001TCY_START\uE001$2\uE001TCY_END\uE001$3');
      working = working.replace(/([!?！？]{2})/g, '\uE001TCY_START\uE001$1\uE001TCY_END\uE001');
    }

    // Escape raw text
    let escaped = this.escapeInDesignText(working);

    // Rehydrate placeholders to InDesign tags
    escaped = escaped.replace(/\uE001KENTEN_START\uE001(.*?)\uE001KENTEN_END\uE001/g, `<cKentenKind:${kentenCode}><cKentenPosition:0>$1<cKentenKind:0>`);
    escaped = escaped.replace(/\uE001RUBY_START:(.*?)\uE001(.*?)\uE001RUBY_END\uE001/g, '<cr:1><crst:$1>$2<cr:>');
    escaped = escaped.replace(/\uE001TCY_START\uE001(.*?)\uE001TCY_END\uE001/g, '<ct:1>$1<ct:0>');

    // Process line-by-line paragraph styles
    const lines = escaped.split(/\r?\n/);
    const resultLines: string[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        resultLines.push('<ParaStyle:本文>');
        continue;
      }

      // Check for page break / scene break
      if (/［＃改[ペ丁]ージ?］/.test(line)) {
        resultLines.push('<ParaStyle:大見出し>');
        continue;
      }
      if (line === '***' || line === '---' || line === '◆◆◆' || line === '◆　◆　◆') {
        resultLines.push('<ParaStyle:区切り>◆　◆　◆');
        continue;
      }

      // Check for dialogue
      const isDialogue = /^([「『（【]|\\<)/.test(line);
      if (isDialogue) {
        resultLines.push(`<ParaStyle:会話文>${line}`);
      } else {
        resultLines.push(`<ParaStyle:本文>${line}`);
      }
    }

    return resultLines.join('\r\n');
  }

  /**
   * Generates a complete InDesign Tagged Text manuscript file.
   */
  public static exportFullText(
    title: string,
    chapters: InDesignChapterInput[],
    options: InDesignExportOptions = {}
  ): string {
    const parts: string[] = [];

    // 1. Style definitions
    parts.push(this.generateStyleDefinitions(options));

    // 2. Title and Author
    parts.push(`<ParaStyle:タイトル>${this.escapeInDesignText(title)}\r\n`);
    if (options.author) {
      parts.push(`<ParaStyle:著者>${this.escapeInDesignText(options.author)}\r\n\r\n`);
    }

    // 3. Chapters
    chapters.forEach((ch, idx) => {
      parts.push(`<ParaStyle:大見出し>${this.escapeInDesignText(ch.title)}\r\n`);
      const body = this.formatContentToInDesign(ch.content, options);
      parts.push(body);
      parts.push('\r\n');
    });

    return parts.join('\r\n');
  }

  /**
   * Generates a single chapter InDesign Tagged Text file.
   */
  public static exportChapter(
    chapterTitle: string,
    content: string,
    options: InDesignExportOptions = {}
  ): string {
    const parts: string[] = [
      this.generateStyleDefinitions(options),
      `<ParaStyle:大見出し>${this.escapeInDesignText(chapterTitle)}\r\n`,
      this.formatContentToInDesign(content, options),
    ];
    return parts.join('\r\n');
  }
}
