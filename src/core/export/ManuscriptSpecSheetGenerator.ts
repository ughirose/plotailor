/**
 * Manuscript Specification & Typesetting Layout Sheet Generator
 * (原稿仕様書・割付指示書 ジェネレータ)
 * 
 * Automatically analyzes manuscript volume, ruby/bouten frequency, chapter structures,
 * and generates a professional specification sheet for editors and printing presses.
 */

import type { LoreEntity } from '../lore/LoreEntityManager.js';

export interface ManuscriptSpecChapter {
  id?: string;
  title: string;
  content: string;
}

export interface ManuscriptSpecInput {
  title: string;
  author?: string;
  chapters: ManuscriptSpecChapter[];
  loreEntities?: LoreEntity[];
}

export interface ExtractedRubyItem {
  base: string;
  ruby: string;
  count: number;
}

export interface ManuscriptMetrics {
  totalCharsWithSpaces: number;
  totalCharsNoSpaces: number;
  totalParagraphs: number;
  totalLines: number;
  dialogueCount: number;
  dialogueRatioPercent: number;
  manuscriptSheetCount: number; // 400字詰原稿用紙換算
  rubyTotalCount: number;
  boutenTotalCount: number;
  rubyItems: ExtractedRubyItem[];
  boutenItems: { text: string; count: number }[];
  chapterMetrics: {
    index: number;
    title: string;
    chars: number;
    sheets: number;
  }[];
}

export class ManuscriptSpecSheetGenerator {
  /**
   * Analyzes all chapters and extracts detailed quantitative metrics.
   */
  public static analyzeMetrics(chapters: ManuscriptSpecChapter[]): ManuscriptMetrics {
    let totalCharsWithSpaces = 0;
    let totalCharsNoSpaces = 0;
    let totalParagraphs = 0;
    let totalLines = 0;
    let dialogueCount = 0;
    let totalParaCount = 0;

    const rubyMap = new Map<string, ExtractedRubyItem>();
    const boutenMap = new Map<string, number>();

    const chapterMetrics: ManuscriptMetrics['chapterMetrics'] = [];

    chapters.forEach((ch, idx) => {
      const content = ch.content || '';
      const lines = content.split(/\r?\n/);
      totalLines += lines.length;

      let chapterChars = 0;

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          totalParaCount++;
          if (/^([「『（【]|<)/.test(trimmed)) {
            dialogueCount++;
          }
        }
      }

      // Strip ruby tags for raw character count
      // Remove 《...》 and ｜
      const rawText = content
        .replace(/［＃.*?］/g, '')
        .replace(/《《(.*?)》》/g, '$1')
        .replace(/｜/g, '')
        .replace(/《.*?》/g, '');

      totalCharsWithSpaces += rawText.length;
      const noSpace = rawText.replace(/\s+/g, '');
      totalCharsNoSpaces += noSpace.length;
      chapterChars = noSpace.length;

      chapterMetrics.push({
        index: idx + 1,
        title: ch.title,
        chars: chapterChars,
        sheets: Math.ceil(chapterChars / 400),
      });

      // Extract Ruby: ｜親文字《るび》 or 漢字《るび》
      const rubyRegex = /(?:｜([^《\n]+?)|([\u4E00-\u9FFF々ヶ〆仝\u30A1-\u30FAー]+))《([^》\n]+?)》/g;
      let rMatch: RegExpExecArray | null;
      while ((rMatch = rubyRegex.exec(content)) !== null) {
        const base = rMatch[1] || rMatch[2];
        const ruby = rMatch[3];
        const key = `${base}:${ruby}`;
        const existing = rubyMap.get(key);
        if (existing) {
          existing.count++;
        } else {
          rubyMap.set(key, { base, ruby, count: 1 });
        }
      }

      // Extract Bouten: 《《...》》 or ［＃傍点］...［＃傍点終わり］
      const boutenRegex = /《《([^》\n]+?)》》|［＃傍点］(.*?)［＃傍点終わり］/g;
      let bMatch: RegExpExecArray | null;
      while ((bMatch = boutenRegex.exec(content)) !== null) {
        const text = bMatch[1] || bMatch[2];
        boutenMap.set(text, (boutenMap.get(text) || 0) + 1);
      }
    });

    totalParagraphs = totalParaCount;
    const dialogueRatioPercent = totalParagraphs > 0
      ? Math.round((dialogueCount / totalParagraphs) * 1000) / 10
      : 0;

    const manuscriptSheetCount = Math.ceil(totalCharsNoSpaces / 400);

    const rubyItems = Array.from(rubyMap.values()).sort((a, b) => b.count - a.count);
    const rubyTotalCount = rubyItems.reduce((acc, r) => acc + r.count, 0);

    const boutenItems = Array.from(boutenMap.entries())
      .map(([text, count]) => ({ text, count }))
      .sort((a, b) => b.count - a.count);
    const boutenTotalCount = boutenItems.reduce((acc, b) => acc + b.count, 0);

    return {
      totalCharsWithSpaces,
      totalCharsNoSpaces,
      totalParagraphs,
      totalLines,
      dialogueCount,
      dialogueRatioPercent,
      manuscriptSheetCount,
      rubyTotalCount,
      boutenTotalCount,
      rubyItems,
      boutenItems,
      chapterMetrics,
    };
  }

  /**
   * Generates a complete text/markdown manuscript specification sheet.
   */
  public static generateSpecSheet(input: ManuscriptSpecInput): string {
    const title = input.title || '無題';
    const author = input.author || '作者不詳';
    const metrics = this.analyzeMetrics(input.chapters);
    const now = new Date().toLocaleString('ja-JP');

    const lines: string[] = [
      '================================================================================',
      `商業原稿仕様書・割付指示書 (Manuscript Specification Sheet)`,
      `作品名: 『${title}』`,
      `著　者: ${author}`,
      `作　成: ${now}`,
      `組　版: Plotailor 文芸執筆統合環境 (Commercial Packaging Engine)`,
      '================================================================================',
      '',
      '【1. 原稿総量および分量集計】',
      `・総文字数 (空白含む):      ${metrics.totalCharsWithSpaces.toLocaleString()} 文字`,
      `・実文字数 (空白・改行除く): ${metrics.totalCharsNoSpaces.toLocaleString()} 文字`,
      `・総段落数:                 ${metrics.totalParagraphs.toLocaleString()} 段落`,
      `・総行数:                   ${metrics.totalLines.toLocaleString()} 行`,
      `・会話文比率:               ${metrics.dialogueRatioPercent}% (${metrics.dialogueCount} / ${metrics.totalParagraphs} 段落)`,
      `・400字詰原稿用紙換算枚数:   約 ${metrics.manuscriptSheetCount.toLocaleString()} 枚`,
      '',
      '【2. 推奨DTP基本版面設計（四六判 / A5判 標準縦書き）】',
      '・推奨判型:                 四六判 (127mm × 188mm) または A5判 (148mm × 210mm)',
      '・基本版面:                 1行40字 × 17行 (1ページあたり680字)',
      '・基本文字サイズ:           13級 (9.25pt) / 行送り 22H (5.5mm)',
      '・基本フォント:             リュウミン L-KL / 游明朝体',
      `・想定仕上がりページ数:     約 ${Math.ceil(metrics.totalCharsNoSpaces / 550)} ページ (扉・目次・奥付除く)`,
      '',
      '【3. 章構成・分量内訳】',
    ];

    metrics.chapterMetrics.forEach((cm) => {
      lines.push(
        `  第${cm.index}章: ${cm.title.padEnd(24, ' ')} | ${cm.chars.toLocaleString().padStart(7, ' ')} 文字 (原稿用紙 約${cm.sheets.toString().padStart(4, ' ')}枚)`
      );
    });

    lines.push('');
    lines.push('【4. ルビ指定対照一覧（親文字 ➔ 読み）】');
    lines.push(`・ルビ指定総数: ${metrics.rubyTotalCount} 箇所 (${metrics.rubyItems.length} 語種)`);
    if (metrics.rubyItems.length === 0) {
      lines.push('  （指定なし）');
    } else {
      metrics.rubyItems.slice(0, 50).forEach((r, idx) => {
        lines.push(`  ${(idx + 1).toString().padStart(2, ' ')}. ${r.base} ➔ 《${r.ruby}》 (${r.count}回)`);
      });
      if (metrics.rubyItems.length > 50) {
        lines.push(`  ...他 ${metrics.rubyItems.length - 50} 語種 省略`);
      }
    }

    lines.push('');
    lines.push('【5. 圏点・傍点指定一覧】');
    lines.push(`・傍点指定総数: ${metrics.boutenTotalCount} 箇所`);
    if (metrics.boutenItems.length === 0) {
      lines.push('  （指定なし）');
    } else {
      metrics.boutenItems.forEach((b) => {
        lines.push(`  ・「${b.text}」 (${b.count}回)`);
      });
    }

    if (input.loreEntities && input.loreEntities.length > 0) {
      lines.push('');
      lines.push('【6. 登録キャラクター・主要固有名詞】');
      const characters = input.loreEntities.filter((e) => e.category === 'character');
      const terms = input.loreEntities.filter((e) => e.category === 'term');
      lines.push(`・登場人物 (${characters.length}名): ${characters.map((c) => c.name).join('、') || 'なし'}`);
      lines.push(`・重要用語 (${terms.length}項目): ${terms.map((t) => t.name).join('、') || 'なし'}`);
    }

    lines.push('');
    lines.push('================================================================================');
    lines.push('【入稿・組版担当者様へ】');
    lines.push('本原稿は Plotailor により自動構造化されています。');
    lines.push('同梱の InDesign タグ付きテキスト（<UNICODE-WIN>）を読み込むことで、');
    lines.push('ルビ・圏点・縦中横・段落スタイルが自動適用されます。');
    lines.push('================================================================================');

    return lines.join('\r\n');
  }
}
