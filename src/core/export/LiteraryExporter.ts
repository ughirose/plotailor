import type { LoreEntity } from '../lore/LoreEntityManager.js';

export interface ChapterExportInput {
  id: string;
  title: string;
  content: string;
}

export interface AozoraExportOptions {
  author?: string;
  usePageBreak?: boolean; // ［＃改ページ］
  headingLevel?: 'large' | 'medium'; // ［＃大見出し］or ［＃中見出し］
}

export interface PrintHtmlOptions {
  author?: string;
  isVertical?: boolean;
  fontSize?: string;
  fontFamily?: string;
}

/**
 * Converts internal Plotailor ruby & bouten markup into standard Aozora Bunko notation.
 * - `<<...>>` -> `《...》`
 * - `<<<<...>>>>` -> `［＃傍点］...［＃傍点終わり］`
 * - `漢字《るび》` without `｜` -> `｜漢字《るび》` when preceding characters need boundary.
 */
export function normalizeAozoraMarkup(text: string): string {
  if (!text) return '';

  // 1. Bouten: <<<<text>>>> -> ［＃傍点］text［＃傍点終わり］
  let result = text.replace(/<{4}(.+?)>{4}/g, '［＃傍点］$1［＃傍点終わり］');

  // 2. Double angle bracket ruby: <<ruby>> -> 《ruby》
  result = result.replace(/<<([^>]+?)>>/g, '《$1》');

  // 3. Ensure ruby has boundary mark ｜ if not already marked
  // Case A: Already has ｜ prefix -> leave as is
  // Case B: Pure kanji/katakana before 《 -> prefix that block with ｜
  result = result.replace(/(^|[^｜\u4E00-\u9FFF々ヶ〆仝\u30A1-\u30FAー])([\u4E00-\u9FFF々ヶ〆仝\u30A1-\u30FAー]+)《([^》]+?)》/g, (match, prefix, base, ruby) => {
    return `${prefix}｜${base}《${ruby}》`;
  });

  return result;
}

/**
 * Converts Aozora Bunko markup into clean HTML <ruby> tags.
 */
export function convertAozoraToHtml(text: string): string {
  if (!text) return '';

  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Bouten: ［＃傍点］...［＃傍点終わり］
  html = html.replace(/［＃傍点］(.*?)［＃傍点終わり］/g, '<span class="bouten">$1</span>');

  // Standard Aozora: ｜親文字《るび》
  html = html.replace(/｜([^《]+?)《([^》]+?)》/g, '<ruby>$1<rt>$2</rt></ruby>');

  // Fallback ruby without ｜
  html = html.replace(/([\u4E00-\u9FFF]+)《([^》]+?)》/g, '<ruby>$1<rt>$2</rt></ruby>');

  // Paragraphs
  const lines = html.split('\n');
  return lines.map((l) => `<p>${l || '&nbsp;'}</p>`).join('\n');
}

export class LiteraryExporter {
  /**
   * Generates a single, publication-ready Aozora Bunko plain text manuscript.
   */
  public static exportAozoraFullText(
    workTitle: string,
    chapters: ChapterExportInput[],
    options: AozoraExportOptions = {}
  ): string {
    const lines: string[] = [];
    const author = options.author || '作者不詳';
    const headingTag = options.headingLevel === 'medium' ? '中見出し' : '大見出し';
    const pageBreak = options.usePageBreak !== false;

    // Header metadata
    lines.push(workTitle);
    lines.push(author);
    lines.push('');
    lines.push('-------------------------------------------------------');
    lines.push('【本作品は Plotailor 文芸執筆統合環境により出力されました】');
    lines.push('-------------------------------------------------------');
    lines.push('');

    // Chapters
    chapters.forEach((ch, idx) => {
      if (idx > 0 && pageBreak) {
        lines.push('');
        lines.push('［＃改ページ］');
        lines.push('');
      }

      lines.push(`［＃${headingTag}］${ch.title}［＃${headingTag}終わり］`);
      lines.push('');

      const normalized = normalizeAozoraMarkup(ch.content || '');
      lines.push(normalized);
      lines.push('');
    });

    return lines.join('\r\n');
  }

  /**
   * Generates a structured Worldbuilding / Lore Bible Markdown document.
   */
  public static exportLoreBibleMarkdown(workTitle: string, entities: LoreEntity[]): string {
    const lines: string[] = [];
    const categoryLabels: Record<string, string> = {
      character: '人物・キャラクター',
      term: '世界観・重要用語',
      item: '武具・アーティファクト',
      foreshadowing: '伏線・因果プロット',
      location: '拠点・地理・領域',
    };

    lines.push(`# 『${workTitle}』世界観・設定資料集 (Lore Bible)`);
    lines.push(`- **総登録項目数**: ${entities.length} 件`);
    lines.push(`- **出力日時**: ${new Date().toLocaleString('ja-JP')}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    const categories = ['character', 'term', 'item', 'foreshadowing', 'location'];

    for (const cat of categories) {
      const group = entities.filter((e) => e.category === cat);
      if (group.length === 0) continue;

      lines.push(`## ${categoryLabels[cat] || cat} (${group.length} 件)`);
      lines.push('');

      for (const ent of group) {
        lines.push(`### ${ent.name}`);
        if (ent.role) lines.push(`- **役割/肩書**: ${ent.role}`);
        if (ent.status) lines.push(`- **状態**: \`${ent.status}\``);
        if (ent.aliases && ent.aliases.length > 0) {
          lines.push(`- **表記ゆれ・異名**: ${ent.aliases.join(', ')}`);
        }
        if (ent.relations && ent.relations.length > 0) {
          const rels = ent.relations
            .map((r) => {
              const target = entities.find((e) => e.id === r.targetId);
              return `${r.label} ➔ ${target ? target.name : r.targetId}`;
            })
            .join('; ');
          lines.push(`- **関係性**: ${rels}`);
        }
        lines.push('');
        lines.push(ent.description || '（詳細説明なし）');
        lines.push('');
      }

      lines.push('---');
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Generates a self-contained, print-ready HTML page with CSS @page rules.
   */
  public static exportPrintHtml(
    workTitle: string,
    chapters: ChapterExportInput[],
    options: PrintHtmlOptions = {}
  ): string {
    const isVertical = options.isVertical !== false;
    const author = options.author || '作者不詳';
    const fontFamily =
      options.fontFamily ||
      '"游明朝", "Yu Mincho", "Hiragino Mincho ProN", "BIZ UDPMincho", serif';
    const fontSize = options.fontSize || '10.5pt';

    const chaptersHtml = chapters
      .map((ch, idx) => {
        const bodyHtml = convertAozoraToHtml(ch.content || '');
        return `
      <section class="chapter ${idx > 0 ? 'page-break' : ''}">
        <h2 class="chapter-title">${ch.title}</h2>
        <div class="chapter-content">
          ${bodyHtml}
        </div>
      </section>
    `;
      })
      .join('\n');

    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>${workTitle} - 印刷・原稿プレビュー</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 25mm 20mm 25mm 20mm;
      @bottom-center {
        content: counter(page);
        font-family: ${fontFamily};
        font-size: 9pt;
      }
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 40px;
      font-family: ${fontFamily};
      font-size: ${fontSize};
      line-height: 1.85;
      color: #111;
      background: #fdfdfd;
      ${isVertical ? 'writing-mode: vertical-rl; text-orientation: mixed;' : ''}
    }
    .manuscript-header {
      margin-bottom: 60px;
      ${isVertical ? 'margin-left: 60px; margin-bottom: 0;' : ''}
      text-align: center;
    }
    .work-title {
      font-size: 20pt;
      font-weight: 700;
      letter-spacing: 0.1em;
      margin-bottom: 12px;
    }
    .work-author {
      font-size: 13pt;
      color: #444;
      margin-bottom: 40px;
    }
    .chapter {
      margin-bottom: 60px;
    }
    .page-break {
      break-before: page;
      page-break-before: always;
    }
    .chapter-title {
      font-size: 15pt;
      font-weight: 600;
      margin-bottom: 30px;
      letter-spacing: 0.08em;
    }
    .chapter-content p {
      margin: 0;
      text-indent: 1em;
      text-align: justify;
    }
    ruby {
      ruby-align: center;
    }
    rt {
      font-size: 0.55em;
      letter-spacing: 0;
    }
    .bouten {
      text-emphasis: filled dot;
      -webkit-text-emphasis: filled dot;
    }
    @media print {
      body {
        padding: 0;
        background: transparent;
      }
      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="manuscript-header">
    <div class="work-title">${workTitle}</div>
    <div class="work-author">${author}</div>
  </div>
  ${chaptersHtml}
</body>
</html>`;
  }

  /**
   * Helper to download text or data as a file in the browser.
   */
  public static downloadFile(filename: string, content: string, mimeType = 'text/plain;charset=utf-8'): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
