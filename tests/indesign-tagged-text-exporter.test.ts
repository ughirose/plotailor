import { describe, it, expect } from 'vitest';
import {
  InDesignTaggedTextExporter,
  type InDesignChapterInput,
} from '../src/core/export/InDesignTaggedTextExporter.js';

describe('InDesignTaggedTextExporter (<UNICODE-WIN>)', () => {
  it('generates compliant <UNICODE-WIN> header with paragraph style definitions', () => {
    const header = InDesignTaggedTextExporter.generateStyleDefinitions({
      bodyFontSize: 13,
      bodyLeading: 22,
    });

    expect(header).toContain('<UNICODE-WIN>');
    expect(header).toContain('<DefineParaStyle:タイトル=');
    expect(header).toContain('<DefineParaStyle:大見出し=');
    expect(header).toContain('<DefineParaStyle:本文=');
    expect(header).toContain('<DefineParaStyle:会話文=');
    expect(header).toContain('<cFont:A-OTF リュウミン Pr6N>');
  });

  it('transforms ruby into InDesign <cr:1><crst:るび>親文字<cr:> tags', () => {
    const content = '彼の名は｜星辰《せいしん》の守護者。';
    const result = InDesignTaggedTextExporter.formatContentToInDesign(content);

    expect(result).toContain('<cr:1><crst:せいしん>星辰<cr:>');
  });

  it('transforms bouten into InDesign <cKentenKind:1> tags', () => {
    const content = '絶対に《《許さない》》。';
    const result = InDesignTaggedTextExporter.formatContentToInDesign(content);

    expect(result).toContain('<cKentenKind:1><cKentenPosition:0>許さない<cKentenKind:0>');
  });

  it('transforms 2-digit numbers into InDesign Tatechuyoko <ct:1> tags', () => {
    const content = '第24巻の結末！';
    const result = InDesignTaggedTextExporter.formatContentToInDesign(content, { enableTcy: true });

    expect(result).toContain('<ct:1>24<ct:0>');
  });

  it('differentiates dialogues from body paragraphs', () => {
    const content = '夜が明けた。\n「おはよう」と少女は微笑んだ。';
    const result = InDesignTaggedTextExporter.formatContentToInDesign(content);

    expect(result).toContain('<ParaStyle:本文>夜が明けた。');
    expect(result).toContain('<ParaStyle:会話文>「おはよう」と少女は微笑んだ。');
  });

  it('escapes literal angle brackets in text', () => {
    const content = '数式 3 < 5 かつ 10 > 2';
    const result = InDesignTaggedTextExporter.formatContentToInDesign(content);

    expect(result).toContain('\\< 5');
    expect(result).toContain('\\> 2');
  });

  it('exports full multi-chapter manuscript with title and author', () => {
    const chapters: InDesignChapterInput[] = [
      {
        title: '第一章 星の目覚め',
        content: '遠くで鐘が鳴った。\n「急ぎましょう」',
      },
      {
        title: '第二章 静寂の回廊',
        content: '回廊は暗かった。',
      },
    ];

    const full = InDesignTaggedTextExporter.exportFullText('星辰の夜', chapters, {
      author: '宮沢賢治',
    });

    expect(full).toContain('<UNICODE-WIN>');
    expect(full).toContain('<ParaStyle:タイトル>星辰の夜');
    expect(full).toContain('<ParaStyle:著者>宮沢賢治');
    expect(full).toContain('<ParaStyle:大見出し>第一章 星の目覚め');
    expect(full).toContain('<ParaStyle:大見出し>第二章 静寂の回廊');
    expect(full).toContain('<ParaStyle:会話文>「急ぎましょう」');
  });
});
