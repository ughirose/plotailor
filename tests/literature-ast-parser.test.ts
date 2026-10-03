import { describe, it, expect } from 'vitest';
import {
  LiteratureASTParser,
  parseLiteratureMarkdown,
  validateLiteratureAST,
} from '../src/lib/ast/literature-ast-parser.js';
import {
  CalloutBlockNodeSchema,
  LetterBlockNodeSchema,
  RubyNodeSchema,
  EmphasisNodeSchema,
  ShoutNodeSchema,
  EntityLinkNodeSchema,
  LiteratureASTSchema,
  type DocumentNode,
  type CalloutBlockNode,
  type LetterBlockNode,
  type ParagraphNode,
  type RubyNode,
  type EmphasisNode,
  type EntityLinkNode,
  type ShoutNode,
} from '../src/types/literature-ast.js';

describe('Literature AST Parser & Zod Validation', () => {
  describe('Block Parsing', () => {
    it('parses headings and paragraphs correctly', () => {
      const markdown = `# 章タイトル\n\nここからは本文です。`;
      const ast = parseLiteratureMarkdown(markdown);

      expect(ast.type).toBe('root');
      expect(ast.children.length).toBe(2);

      const heading = ast.children[0] as any;
      expect(heading.type).toBe('heading');
      expect(heading.level).toBe(1);
      expect(heading.children[0].value).toBe('章タイトル');

      const paragraph = ast.children[1] as ParagraphNode;
      expect(paragraph.type).toBe('paragraph');
      expect((paragraph.children[0] as any).value).toBe('ここからは本文です。');
    });

    it('parses callout blocks (> [!NOTE] Title)', () => {
      const markdown = `> [!NOTE] 編集メモ\n> これは注記です。`;
      const ast = parseLiteratureMarkdown(markdown);

      expect(ast.children.length).toBe(1);
      const callout = ast.children[0] as CalloutBlockNode;
      expect(callout.type).toBe('callout');
      expect(callout.kind).toBe('NOTE');
      expect(callout.title).toBe('編集メモ');
      expect(callout.children.length).toBeGreaterThan(0);

      const parsedSchema = CalloutBlockNodeSchema.safeParse(callout);
      expect(parsedSchema.success).toBe(true);
    });

    it('parses letter blocks (> [!LETTER] 拝啓)', () => {
      const markdown = `> [!LETTER] 手紙のタイトル\n> 拝啓、元気にしていますか。`;
      const ast = parseLiteratureMarkdown(markdown);

      expect(ast.children.length).toBe(1);
      const letter = ast.children[0] as LetterBlockNode;
      expect(letter.type).toBe('letter');
      expect(letter.title).toBe('手紙のタイトル');
      expect(letter.children.length).toBeGreaterThan(0);

      const parsedSchema = LetterBlockNodeSchema.safeParse(letter);
      expect(parsedSchema.success).toBe(true);
    });

    it('parses standard blockquotes when non-callout > line is used', () => {
      const markdown = `> 通常の引用テキストです。`;
      const ast = parseLiteratureMarkdown(markdown);

      expect(ast.children.length).toBe(1);
      const bq = ast.children[0] as any;
      expect(bq.type).toBe('blockquote');
    });
  });

  describe('Inline Parsing', () => {
    it('parses explicit ruby markup (｜親文字《るび》)', () => {
      const markdown = `｜真実《しんじつ》を求める。`;
      const ast = parseLiteratureMarkdown(markdown);

      const para = ast.children[0] as ParagraphNode;
      const ruby = para.children[0] as RubyNode;

      expect(ruby.type).toBe('ruby');
      expect(ruby.parent).toBe('真実');
      expect(ruby.ruby).toBe('しんじつ');
      expect(ruby.isExplicit).toBe(true);

      const parsedSchema = RubyNodeSchema.safeParse(ruby);
      expect(parsedSchema.success).toBe(true);
    });

    it('parses implicit kanji ruby (漢字《るび》)', () => {
      const markdown = `魔法《まほう》を唱える。`;
      const ast = parseLiteratureMarkdown(markdown);

      const para = ast.children[0] as ParagraphNode;
      const ruby = para.children[0] as RubyNode;

      expect(ruby.type).toBe('ruby');
      expect(ruby.parent).toBe('魔法');
      expect(ruby.ruby).toBe('まほう');
      expect(ruby.isExplicit).toBe(false);
    });

    it('parses bouten emphasis (《《傍点》》)', () => {
      const markdown = `《《強調箇所》》に注意。`;
      const ast = parseLiteratureMarkdown(markdown);

      const para = ast.children[0] as ParagraphNode;
      const emp = para.children[0] as EmphasisNode;

      expect(emp.type).toBe('emphasis');
      expect(emp.text).toBe('強調箇所');
      expect(emp.style).toBe('bouten');

      const parsedSchema = EmphasisNodeSchema.safeParse(emp);
      expect(parsedSchema.success).toBe(true);
    });

    it('parses entity links ([[Target]] and [[Target|Alias]])', () => {
      const markdown = `[[アルス]]と[[アルス|主人公]]が登場する。`;
      const ast = parseLiteratureMarkdown(markdown);

      const para = ast.children[0] as ParagraphNode;

      const link1 = para.children[0] as EntityLinkNode;
      expect(link1.type).toBe('entity_link');
      expect(link1.target).toBe('アルス');
      expect(link1.alias).toBeUndefined();

      const link2 = para.children[2] as EntityLinkNode;
      expect(link2.type).toBe('entity_link');
      expect(link2.target).toBe('アルス');
      expect(link2.alias).toBe('主人公');

      const parsedSchema = EntityLinkNodeSchema.safeParse(link1);
      expect(parsedSchema.success).toBe(true);
    });

    it('parses shout nodes (【叫び】 and ！！叫び！！)', () => {
      const markdown = `【大声で叫ぶ】そして！！助けて！！`;
      const ast = parseLiteratureMarkdown(markdown);

      const para = ast.children[0] as ParagraphNode;

      const shout1 = para.children[0] as ShoutNode;
      expect(shout1.type).toBe('shout');
      expect(shout1.text).toBe('大声で叫ぶ');

      const shout2 = para.children[2] as ShoutNode;
      expect(shout2.type).toBe('shout');
      expect(shout2.text).toBe('助けて');

      const parsedSchema = ShoutNodeSchema.safeParse(shout1);
      expect(parsedSchema.success).toBe(true);
    });

    it('handles mixed inline markup correctly', () => {
      const markdown = `｜親《ルビ》と《《傍点》》と[[Entity|Alias]]と【叫び】`;
      const ast = parseLiteratureMarkdown(markdown);

      const para = ast.children[0] as ParagraphNode;
      expect(para.children.map((c) => c.type)).toEqual([
        'ruby',
        'text',
        'emphasis',
        'text',
        'entity_link',
        'text',
        'shout',
      ]);
    });
  });

  describe('Edge Cases & Fallback Behavior', () => {
    it('handles empty markdown string gracefully', () => {
      const ast = parseLiteratureMarkdown('');
      expect(ast.type).toBe('root');
      expect(ast.children).toEqual([]);
    });

    it('handles unmatched brackets without throwing exceptions', () => {
      const markdown = `[[未完のリンク ｜未完のルビ《ルビ`;
      const ast = LiteratureASTParser.parse(markdown);

      expect(ast.type).toBe('root');
      expect(ast.children.length).toBeGreaterThan(0);
    });

    it('safely validates invalid AST and returns fallback root', () => {
      const invalidAST = {
        type: 'invalid_node',
        foo: 'bar',
      };

      const result = LiteratureASTParser.safeValidate(invalidAST);
      expect(result.success).toBe(false);
      expect(result.data).toEqual({
        type: 'root',
        children: [],
      });
    });

    it('throws ZodError on validate for malformed AST', () => {
      const malformed = { type: 'root', children: [{ type: 'unknown' }] };
      expect(() => validateLiteratureAST(malformed)).toThrow();
    });
  });

  describe('Zod Schema Full AST Validation', () => {
    it('validates a complete complex document against LiteratureASTSchema', () => {
      const markdown = `# 第1章 旅立ち\n\n> [!NOTE] 設定情報\n> 舞台は[[エリス王国]]である。\n\n｜主人公《アルス》は《《秘宝》》を手に【覚悟】を決めた。`;
      const ast = parseLiteratureMarkdown(markdown);

      const validated = LiteratureASTSchema.parse(ast);
      expect(validated.type).toBe('root');
      expect(validated.children.length).toBe(3);
    });
  });
});
