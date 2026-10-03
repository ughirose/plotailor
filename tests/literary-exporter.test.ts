import { describe, it, expect } from 'vitest';
import {
  LiteraryExporter,
  normalizeAozoraMarkup,
  convertAozoraToHtml,
} from '../src/core/export/LiteraryExporter.js';
import type { LoreEntity } from '../src/core/lore/LoreEntityManager.js';

describe('LiteraryExporter & Markup Converter', () => {
  it('should normalize bouten and double angle bracket rubies to Aozora Bunko format', () => {
    const raw = '千年の古より受け継がれし<<<<星辰の盟約>>>>を巡る、衛星<<セレネ>>の光。';
    const normalized = normalizeAozoraMarkup(raw);

    expect(normalized).toContain('［＃傍点］星辰の盟約［＃傍点終わり］');
    expect(normalized).toContain('《セレネ》');
  });

  it('should preserve and add boundary markers for kanji rubies', () => {
    const text = '第一衛星《セレネ》と北方《ほっぽう》の砦';
    const normalized = normalizeAozoraMarkup(text);
    expect(normalized).toContain('｜第一衛星《セレネ》');
    expect(normalized).toContain('｜北方《ほっぽう》');
  });

  it('should convert Aozora markup into semantic HTML with <ruby> and bouten spans', () => {
    const aozora = '｜星辰《せいしん》の空に［＃傍点］凶兆［＃傍点終わり］が現れた。\n二行目の文章。';
    const html = convertAozoraToHtml(aozora);

    expect(html).toContain('<ruby>星辰<rt>せいしん</rt></ruby>');
    expect(html).toMatch(/<span class="bouten(?:\s+bouten-dot)?">凶兆<\/span>/);
    expect(html).toContain('<p>');
  });

  it('should generate complete publication-ready Aozora full text for multiple chapters', () => {
    const chapters = [
      { id: 'ch1', title: '第一章 黎明', content: '夜が明ける。' },
      { id: 'ch2', title: '第二章 動乱', content: '兵が動く。' },
    ];

    const result = LiteraryExporter.exportAozoraFullText('運命の円環', chapters, {
      author: 'テスト作家',
      usePageBreak: true,
    });

    expect(result).toContain('運命の円環');
    expect(result).toContain('テスト作家');
    expect(result).toContain('［＃大見出し］第一章 黎明［＃大見出し終わり］');
    expect(result).toContain('［＃改ページ］');
    expect(result).toContain('［＃大見出し］第二章 動乱［＃大見出し終わり］');
  });

  it('should export structured Lore Bible Markdown document', () => {
    const entities: LoreEntity[] = [
      {
        id: 'char-1',
        name: 'ヴァレリウス',
        category: 'character',
        role: '帝国将軍',
        status: 'alive',
        description: '冷静沈着な指揮官。',
        aliases: ['白銀の将'],
        relations: [{ targetId: 'char-2', label: '主従' }],
      },
      {
        id: 'char-2',
        name: 'セレネ',
        category: 'character',
        role: '巫女',
        status: 'active',
        description: '星辰の声を聴く者。',
      },
      {
        id: 'item-1',
        name: '天球儀の鍵',
        category: 'item',
        description: '世界樹の扉を開く古の鍵。',
      },
    ];

    const md = LiteraryExporter.exportLoreBibleMarkdown('運命の円環', entities);

    expect(md).toContain('# 『運命の円環』世界観・設定資料集 (Lore Bible)');
    expect(md).toContain('## 人物・キャラクター (2 件)');
    expect(md).toContain('### ヴァレリウス');
    expect(md).toContain('- **役割/肩書**: 帝国将軍');
    expect(md).toContain('- **表記ゆれ・異名**: 白銀の将');
    expect(md).toContain('主従 ➔ セレネ');
    expect(md).toContain('## 武具・アーティファクト (1 件)');
    expect(md).toContain('天球儀の鍵');
  });

  it('should export print-ready vertical HTML with CSS @page rules', () => {
    const chapters = [
      { id: 'ch1', title: '第一章 黎明', content: '夜が明ける。｜太陽《たいよう》が昇る。' },
    ];

    const html = LiteraryExporter.exportPrintHtml('運命の円環', chapters, {
      author: 'テスト作家',
      isVertical: true,
    });

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('writing-mode: vertical-rl');
    expect(html).toContain('@page');
    expect(html).toContain('運命の円環');
    expect(html).toContain('<ruby>太陽<rt>たいよう</rt></ruby>');
  });

  it('TASK-439: should convert Kakuyomu bouten and official Aozora bouten into HTML bouten spans without leaking symbols', () => {
    const raw = '彼は《《真実》》を知り、［＃「奇跡」に傍点］を目撃した。親文字<<るび>>も展開される。';
    const html = convertAozoraToHtml(raw);

    expect(html).toContain('<span class="bouten bouten-dot">真実</span>');
    expect(html).toContain('<span class="bouten bouten-dot">奇跡</span>');
    expect(html).toContain('<ruby>親文字<rt>るび</rt></ruby>');
    expect(html).not.toContain('《《');
    expect(html).not.toContain('》》');
    expect(html).not.toContain('［＃');
    expect(html).not.toContain('<<');
  });

  it('TASK-439: exportPrintPreview should generate self-contained vertical manuscript preview with bouten-dot CSS', () => {
    const chapters = [
      { id: 'ch1', title: '序章', content: '《《始まり》》の鐘が鳴る。' },
    ];
    const previewHtml = LiteraryExporter.exportPrintPreview('星霜の書', chapters, { isVertical: true });

    expect(previewHtml).toContain('<span class="bouten bouten-dot">始まり</span>');
    expect(previewHtml).toContain('.bouten, .bouten-dot');
    expect(previewHtml).toContain('text-emphasis: filled dot');
    expect(previewHtml).toContain('writing-mode: vertical-rl');
  });
});
