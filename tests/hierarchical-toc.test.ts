import { describe, it, expect } from 'vitest';
import {
  HierarchicalTocEngine,
  TocNode,
  WEB_NOVEL_PRESET,
  BUNKO_PRESET,
  MARKDOWN_PRESET,
} from '../src/core/editor/HierarchicalTocEngine';

describe('HierarchicalTocEngine', () => {
  describe('Web Novel Preset Parsing', () => {
    it('should parse Web Novel structure (部, 章, 話, プロローグ, エピローグ, 幕間) into a tree', () => {
      const sampleText = `
第一部　異世界降臨編
プロローグ　始まりの予感
第一章　目覚めと仲間たち
第1話：見知らぬ天井
第2話：森の中の出会い
幕間　王都の動向
第二章　暗雲
第3話：忍び寄る影
エピローグ　去りゆく背中
`.trim();

      const tree = HierarchicalTocEngine.parse(sampleText, { preset: 'web-novel' });

      // Root should be 第一部 (level 1)
      expect(tree).toHaveLength(1);
      const rootPart = tree[0];
      expect(rootPart.type).toBe('part');
      expect(rootPart.label).toBe('第一部');
      expect(rootPart.title).toBe('異世界降臨編');
      expect(rootPart.level).toBe(1);

      // Children of 第一部: プロローグ, 第一章, 第二章, エピローグ (all level 2)
      expect(rootPart.children).toHaveLength(4);

      const prologue = rootPart.children[0];
      expect(prologue.type).toBe('prologue');
      expect(prologue.label).toBe('プロローグ');
      expect(prologue.title).toBe('始まりの予感');

      const ch1 = rootPart.children[1];
      expect(ch1.type).toBe('chapter');
      expect(ch1.label).toBe('第一章');
      expect(ch1.title).toBe('目覚めと仲間たち');

      // Children of 第一章: 第1話, 第2話, 幕間 (level 3)
      expect(ch1.children).toHaveLength(3);
      expect(ch1.children[0].label).toBe('第1話');
      expect(ch1.children[0].title).toBe('見知らぬ天井');
      expect(ch1.children[0].type).toBe('episode');

      expect(ch1.children[1].label).toBe('第2話');
      expect(ch1.children[1].title).toBe('森の中の出会い');

      expect(ch1.children[2].type).toBe('interlude');
      expect(ch1.children[2].label).toBe('幕間');

      const ch2 = rootPart.children[2];
      expect(ch2.label).toBe('第二章');

      // Children of 第二章: 第3話
      expect(ch2.children).toHaveLength(1);
      expect(ch2.children[0].label).toBe('第3話');

      const epilogue = rootPart.children[3];
      expect(epilogue.type).toBe('epilogue');
      expect(epilogue.label).toBe('エピローグ');
    });

    it('should correctly calculate line numbers and char offsets', () => {
      const text = `第一章 はじまり\n第1話 旅立ち\n\n第2話 街へ`;
      const tree = HierarchicalTocEngine.parse(text, { preset: 'web-novel' });

      const flat = HierarchicalTocEngine.flatten(tree);
      expect(flat).toHaveLength(3);

      expect(flat[0].lineNumber).toBe(1);
      expect(flat[0].charOffset).toBe(0);

      expect(flat[1].lineNumber).toBe(2);
      expect(flat[1].charOffset).toBe(9); // "第一章 はじまり\n" = 9 chars

      expect(flat[2].lineNumber).toBe(4);
      expect(flat[2].charOffset).toBe(18); // "第一章 はじまり\n第1話 旅立ち\n\n" = 9 + 8 + 1 = 18 chars
    });
  });

  describe('Bunko Preset Parsing', () => {
    it('should parse Bunko hierarchy (部, 巻, 章, 節) into nested nodes', () => {
      const text = `
第一部　創世記
第一巻　黎明
第一章　王都崩壊
第一節　夜明けの旋律
第二節　炎の中の騎士
第二章　決意
第二巻　飛翔
`.trim();

      const tree = HierarchicalTocEngine.parse(text, { preset: 'bunko' });

      expect(tree).toHaveLength(1);
      const part = tree[0];
      expect(part.type).toBe('part');
      expect(part.label).toBe('第一部');

      // Part contains Volume 1 and Volume 2
      expect(part.children).toHaveLength(2);
      const vol1 = part.children[0];
      expect(vol1.type).toBe('volume');
      expect(vol1.label).toBe('第一巻');

      const vol2 = part.children[1];
      expect(vol2.type).toBe('volume');
      expect(vol2.label).toBe('第二巻');

      // Volume 1 contains Chapter 1 and Chapter 2
      expect(vol1.children).toHaveLength(2);
      const ch1 = vol1.children[0];
      expect(ch1.label).toBe('第一章');

      // Chapter 1 contains Section 1 and Section 2
      expect(ch1.children).toHaveLength(2);
      expect(ch1.children[0].type).toBe('section');
      expect(ch1.children[0].label).toBe('第一節');
      expect(ch1.children[1].type).toBe('section');
      expect(ch1.children[1].label).toBe('第二節');
    });
  });

  describe('Markdown Preset Parsing', () => {
    it('should parse Markdown headers (#, ##, ###, ####)', () => {
      const text = `
# Part 1
## Chapter 1
### Section 1.1
#### Episode 1.1.1
## Chapter 2
`.trim();

      const tree = HierarchicalTocEngine.parse(text, { preset: 'markdown' });

      expect(tree).toHaveLength(1);
      const h1 = tree[0];
      expect(h1.level).toBe(1);
      expect(h1.title).toBe('Part 1');

      expect(h1.children).toHaveLength(2);
      expect(h1.children[0].title).toBe('Chapter 1');
      expect(h1.children[0].children[0].title).toBe('Section 1.1');
      expect(h1.children[0].children[0].children[0].title).toBe('Episode 1.1.1');

      expect(h1.children[1].title).toBe('Chapter 2');
    });
  });

  describe('Auto Preset Detection', () => {
    it('should detect Web Novel preset when episode headings (話) predominate', () => {
      const text = `
第一章 冒険の始まり
第1話 出会い
第2話 再会
第3話 旅立ち
`.trim();

      const preset = HierarchicalTocEngine.detectPreset(text);
      expect(preset).toBe('web-novel');
    });

    it('should detect Bunko preset when section headings (節) or volumes (巻) predominate', () => {
      const text = `
第一章 城下町
第一節 雑踏
第二節 追撃
第三節 脱出
`.trim();

      const preset = HierarchicalTocEngine.detectPreset(text);
      expect(preset).toBe('bunko');
    });

    it('should detect Markdown preset when # headers predominate', () => {
      const text = `
# Title
## Chapter 1
### Section 1
`.trim();

      const preset = HierarchicalTocEngine.detectPreset(text);
      expect(preset).toBe('markdown');
    });

    it('should parse automatically when preset option is set to "auto"', () => {
      const text = `
第一章 冒険の始まり
第1話 出会い
第2話 再会
`.trim();

      const tree = HierarchicalTocEngine.parse(text, { preset: 'auto' });
      expect(tree[0].children).toHaveLength(2);
      expect(tree[0].children[0].type).toBe('episode');
    });
  });

  describe('Helper Utilities', () => {
    const text = `
第一部 序曲
第一章 旅立ち
第1話 始まり
第2話 遭遇
第二章 暗雲
`.trim();

    const tree = HierarchicalTocEngine.parse(text, { preset: 'web-novel' });

    it('findNodeByLine should return correct active TOC node for given line number', () => {
      // Line 1: 第一部 序曲
      // Line 2: 第一章 旅立ち
      // Line 3: 第1話 始まり
      // Line 4: 第2話 遭遇
      // Line 5: 第二章 暗雲

      expect(HierarchicalTocEngine.findNodeByLine(tree, 1)?.label).toBe('第一部');
      expect(HierarchicalTocEngine.findNodeByLine(tree, 2)?.label).toBe('第一章');
      expect(HierarchicalTocEngine.findNodeByLine(tree, 3)?.label).toBe('第1話');
      expect(HierarchicalTocEngine.findNodeByLine(tree, 4)?.label).toBe('第2話');
      expect(HierarchicalTocEngine.findNodeByLine(tree, 5)?.label).toBe('第二章');
    });

    it('getTocStats should compute heading stats accurately', () => {
      const stats = HierarchicalTocEngine.getTocStats(tree);
      expect(stats.totalHeadings).toBe(5);
      expect(stats.countsByType.part).toBe(1);
      expect(stats.countsByType.chapter).toBe(2);
      expect(stats.countsByType.episode).toBe(2);
      expect(stats.maxDepth).toBe(3);
    });

    it('format should export TOC tree to Markdown, Text, and HTML', () => {
      const md = HierarchicalTocEngine.format(tree, { formatStyle: 'markdown' });
      expect(md).toContain('# 第一部 序曲');
      expect(md).toContain('## 第一章 旅立ち');
      expect(md).toContain('### 第1話 始まり');

      const plain = HierarchicalTocEngine.format(tree, { formatStyle: 'text', indentString: '  ' });
      expect(plain).toContain('第一部 序曲');
      expect(plain).toContain('  第一章 旅立ち');
      expect(plain).toContain('    第1話 始まり');

      const html = HierarchicalTocEngine.format(tree, { formatStyle: 'html' });
      expect(html).toContain('<ul class="toc-list">');
      expect(html).toContain('第一部 序曲');
      expect(html).toContain('type-part');
    });

    it('convertPreset should remap node levels according to target preset', () => {
      const flatConverted = HierarchicalTocEngine.convertPreset(tree, 'bunko');
      expect(flatConverted).toHaveLength(5);
      // Chapter level in Bunko is level 3 (part=1, volume=2, chapter=3)
      const ch1Converted = flatConverted.find((n) => n.label === '第一章');
      expect(ch1Converted?.level).toBe(3);
    });
  });

  describe('Edge Cases', () => {
    it('should ignore long body paragraphs that mention chapter names inline', () => {
      const text = `
第一章 旅立ち
主人公は第一章で語られた伝説を思い出していたが、それは遠い昔の出来事であった。
第1話 出会い
`.trim();

      const tree = HierarchicalTocEngine.parse(text, { preset: 'web-novel', maxHeadingLength: 20 });
      const flat = HierarchicalTocEngine.flatten(tree);
      expect(flat).toHaveLength(2); // Only "第一章 旅立ち" and "第1話 出会い"
    });

    it('should parse full-width numbers and kanji numerals in Japanese headings', () => {
      const text = `
第１話 フルサイズ数字
第百二十三話 漢数字
`.trim();

      const tree = HierarchicalTocEngine.parse(text, { preset: 'web-novel' });
      const flat = HierarchicalTocEngine.flatten(tree);
      expect(flat).toHaveLength(2);
      expect(flat[0].label).toBe('第１話');
      expect(flat[1].label).toBe('第百二十三話');
    });
  });
});
