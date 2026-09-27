import { describe, it, expect } from 'vitest';
import {
  ParagraphIndenter,
  type ParagraphIndentOptions,
} from '../src/core/editor/ParagraphIndenter.js';
import { ThreePaneWorkspace } from '../src/core/workspace/ThreePaneWorkspace.js';

describe('ParagraphIndenter Utility Module', () => {
  describe('isDialogueLine', () => {
    it('should detect standard Japanese open quotes as dialogue lines', () => {
      expect(ParagraphIndenter.isDialogueLine('「こんにちは」')).toBe(true);
      expect(ParagraphIndenter.isDialogueLine('『二重かぎ括弧』')).toBe(true);
      expect(ParagraphIndenter.isDialogueLine('（補足コメント）')).toBe(true);
      expect(ParagraphIndenter.isDialogueLine('【見出し】')).toBe(true);
      expect(ParagraphIndenter.isDialogueLine('“ダブルクォート”')).toBe(true);
    });

    it('should ignore leading whitespace when checking for dialogue open quotes', () => {
      expect(ParagraphIndenter.isDialogueLine('   「スペース付き会話文」')).toBe(true);
      expect(ParagraphIndenter.isDialogueLine('　『全角スペース付き会話文』')).toBe(true);
    });

    it('should return false for standard prose lines', () => {
      expect(ParagraphIndenter.isDialogueLine('吾輩は猫である。')).toBe(false);
      expect(ParagraphIndenter.isDialogueLine('　名前はまだ無い。')).toBe(false);
      expect(ParagraphIndenter.isDialogueLine('1. ナンバリングテキスト')).toBe(false);
    });

    it('should support custom quoteStartChars options', () => {
      const options: ParagraphIndentOptions = { quoteStartChars: ['[', '<'] };
      expect(ParagraphIndenter.isDialogueLine('[Custom Quote]', options.quoteStartChars)).toBe(true);
      expect(ParagraphIndenter.isDialogueLine('<Tag Quote>', options.quoteStartChars)).toBe(true);
      expect(ParagraphIndenter.isDialogueLine('「標準かぎ括弧」', options.quoteStartChars)).toBe(false);
    });
  });

  describe('analyze and detectUnindentedLines', () => {
    it('should correctly classify line statuses and line positions', () => {
      const text = [
        '吾輩は猫である。',                   // line 1: missing-indent
        '　名前はまだ無い。',                 // line 2: already-indented
        '「どこで生れたかとんと見当がつかぬ。」',// line 3: dialogue
        '',                                   // line 4: empty
        ' 何でも薄暗いじめじめした所で泣いていた事だけは記憶している。', // line 5: half-width-indent
      ].join('\n');

      const diagnostics = ParagraphIndenter.analyze(text);
      expect(diagnostics).toHaveLength(5);

      expect(diagnostics[0].line).toBe(1);
      expect(diagnostics[0].status).toBe('missing-indent');
      expect(diagnostics[0].content).toBe('吾輩は猫である。');
      expect(diagnostics[0].formatted).toBe('　吾輩は猫である。');

      expect(diagnostics[1].line).toBe(2);
      expect(diagnostics[1].status).toBe('already-indented');

      expect(diagnostics[2].line).toBe(3);
      expect(diagnostics[2].status).toBe('dialogue');

      expect(diagnostics[3].line).toBe(4);
      expect(diagnostics[3].status).toBe('empty');

      expect(diagnostics[4].line).toBe(5);
      expect(diagnostics[4].status).toBe('half-width-indent');
      expect(diagnostics[4].formatted).toBe('　何でも薄暗いじめじめした所で泣いていた事だけは記憶している。');
    });

    it('should calculate accurate line byte offsets (from and to)', () => {
      const text = '第一行\n第二行';
      const diagnostics = ParagraphIndenter.analyze(text);

      expect(diagnostics[0].from).toBe(0);
      expect(diagnostics[0].to).toBe(3);

      expect(diagnostics[1].from).toBe(4);
      expect(diagnostics[1].to).toBe(7);
    });

    it('should return only unindented lines with detectUnindentedLines', () => {
      const text = [
        '冒頭の地名',
        '「会話文」',
        '　すでに字下げされている',
        '次の地の文',
      ].join('\n');

      const unindented = ParagraphIndenter.detectUnindentedLines(text);
      expect(unindented).toHaveLength(2);
      expect(unindented[0].line).toBe(1);
      expect(unindented[1].line).toBe(4);
    });
  });

  describe('applyIndent', () => {
    it('should batch insert full-width space at unindented prose paragraph starts', () => {
      const input = [
        '王都の夜空には二つの月が冷たく輝いていた。',
        '北の砦から帰還したヴァレリウス将軍は腰の剣に触れた。',
        '「近衛軍の動きが妙だ。停戦の誓いを破る気か」',
        '若き従卒のアーサーは恐れおののいた。',
      ].join('\n');

      const expected = [
        '　王都の夜空には二つの月が冷たく輝いていた。',
        '　北の砦から帰還したヴァレリウス将軍は腰の剣に触れた。',
        '「近衛軍の動きが妙だ。停戦の誓いを破る気か」',
        '　若き従卒のアーサーは恐れおののいた。',
      ].join('\n');

      const result = ParagraphIndenter.applyIndent(input);
      expect(result).toBe(expected);
    });

    it('should preserve existing full-width indents without double-indenting', () => {
      const input = '　すでに字下げ済み。';
      expect(ParagraphIndenter.applyIndent(input)).toBe('　すでに字下げ済み。');
    });

    it('should normalize leading half-width spaces to full-width space', () => {
      const input = '   半角スペースで始まる行。';
      expect(ParagraphIndenter.applyIndent(input)).toBe('　半角スペースで始まる行。');
    });

    it('should respect normalizeHalfWidthSpace: false option', () => {
      const input = '  半角スペース残し。';
      const result = ParagraphIndenter.applyIndent(input, { normalizeHalfWidthSpace: false });
      expect(result).toBe('　  半角スペース残し。');
    });

    it('should handle custom indentChar option', () => {
      const input = 'プログラミング言語';
      const result = ParagraphIndenter.applyIndent(input, { indentChar: '  ' });
      expect(result).toBe('  プログラミング言語');
    });
  });

  describe('removeIndent', () => {
    it('should batch remove full-width spaces from prose paragraph starts while preserving dialogue', () => {
      const input = [
        '　王都の夜空には二つの月が冷たく輝いていた。',
        '　北の砦から帰還したヴァレリウス将軍は腰の剣に触れた。',
        '「近衛軍の動きが妙だ。停戦の誓いを破る気か」',
        '　若き従卒のアーサーは恐れおののいた。',
      ].join('\n');

      const expected = [
        '王都の夜空には二つの月が冷たく輝いていた。',
        '北の砦から帰還したヴァレリウス将軍は腰の剣に触れた。',
        '「近衛軍の動きが妙だ。停戦の誓いを破る気か」',
        '若き従卒のアーサーは恐れおののいた。',
      ].join('\n');

      const result = ParagraphIndenter.removeIndent(input);
      expect(result).toBe(expected);
    });

    it('should remove leading half-width spaces from prose paragraphs', () => {
      const input = '   半角スペース行';
      expect(ParagraphIndenter.removeIndent(input)).toBe('半角スペース行');
    });

    it('should leave dialogue lines starting with quotes intact', () => {
      const input = '「会話文は字下げ解除対象外」';
      expect(ParagraphIndenter.removeIndent(input)).toBe('「会話文は字下げ解除対象外」');
    });
  });

  describe('toggleIndent', () => {
    it('should apply indents when unindented prose paragraphs exist', () => {
      const unindented = '地の文。';
      const result = ParagraphIndenter.toggleIndent(unindented);
      expect(result).toBe('　地の文。');
    });

    it('should remove indents when all prose paragraphs are already indented', () => {
      const indented = '　字下げ済みの地の文。';
      const result = ParagraphIndenter.toggleIndent(indented);
      expect(result).toBe('字下げ済みの地の文。');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty text gracefully', () => {
      expect(ParagraphIndenter.analyze('')).toHaveLength(1);
      expect(ParagraphIndenter.analyze('')[0].status).toBe('empty');
      expect(ParagraphIndenter.applyIndent('')).toBe('');
      expect(ParagraphIndenter.removeIndent('')).toBe('');
      expect(ParagraphIndenter.toggleIndent('')).toBe('');
    });

    it('should handle text with only blank lines and newlines', () => {
      const input = '\n  \n\t\n';
      expect(ParagraphIndenter.applyIndent(input)).toBe(input);
      expect(ParagraphIndenter.removeIndent(input)).toBe(input);
    });

    it('should handle single line texts without newline', () => {
      expect(ParagraphIndenter.applyIndent('単一行')).toBe('　単一行');
      expect(ParagraphIndenter.removeIndent('　単一行')).toBe('単一行');
    });
  });

  describe('ThreePaneWorkspace Integration', () => {
    it('should perform paragraph indentation operations via ThreePaneWorkspace methods', () => {
      const initialText = [
        '第一段落地の文',
        '「会話文」',
        '第二段落地の文',
      ].join('\n');

      const workspace = new ThreePaneWorkspace({ initialText });

      // 1. Detect unindented paragraphs
      const unindented = workspace.getUnindentedParagraphs();
      expect(unindented).toHaveLength(2);
      expect(unindented[0].line).toBe(1);
      expect(unindented[1].line).toBe(3);

      // 2. Apply indentation via workspace
      const applied = workspace.applyParagraphIndentation();
      expect(applied).toBe([
        '　第一段落地の文',
        '「会話文」',
        '　第二段落地の文',
      ].join('\n'));
      expect(workspace.getState().rawText).toBe(applied);

      // 3. Check unindented count after application
      expect(workspace.getUnindentedParagraphs()).toHaveLength(0);

      // 4. Remove indentation via workspace
      const removed = workspace.removeParagraphIndentation();
      expect(removed).toBe(initialText);
      expect(workspace.getState().rawText).toBe(initialText);

      // 5. Toggle indentation via workspace
      const toggled1 = workspace.toggleParagraphIndentation();
      expect(toggled1).toBe(applied);

      const toggled2 = workspace.toggleParagraphIndentation();
      expect(toggled2).toBe(initialText);
    });
  });
});
