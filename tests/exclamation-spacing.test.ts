import { describe, it, expect } from 'vitest';
import {
  ExclamationSpacingFormatter,
  ThreePaneWorkspace,
} from '../src/index.js';

describe('ExclamationSpacingFormatter', () => {
  const formatter = new ExclamationSpacingFormatter();

  describe('Detection / Linting (lint)', () => {
    it('detects missing full-width space after full-width ！ and ？', () => {
      const text = '本当か！それなら急ごう。どうして？教えてほしい。';
      const diagnostics = formatter.lint(text);

      expect(diagnostics.length).toBe(2);
      expect(diagnostics[0].char).toBe('！');
      expect(diagnostics[0].message).toContain('全角空白（　）がありません');
      expect(diagnostics[1].char).toBe('？');
      expect(diagnostics[1].message).toContain('全角空白（　）がありません');
    });

    it('detects half-width space after ！ and ？ as a violation needing full-width space', () => {
      const text = '本当か！ それなら急ごう。';
      const diagnostics = formatter.lint(text);

      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].message).toContain('半角空白ではなく全角空白');
    });

    it('does not flag when full-width space is already present', () => {
      const text = '本当か！　それなら急ごう。どうして？　教えてほしい。';
      const diagnostics = formatter.lint(text);

      expect(diagnostics.length).toBe(0);
    });

    it('exempts exclamation/question marks immediately preceding closing brackets', () => {
      const text = '「本当か！」と彼は叫んだ。「何故だ！？」';
      const diagnostics = formatter.lint(text);

      expect(diagnostics.length).toBe(0);
    });

    it('handles consecutive exclamation and question marks properly', () => {
      // 1. Followed by text without space -> violation after sequence
      const text1 = 'なんだって！？それなら大変だ。';
      const diag1 = formatter.lint(text1);
      expect(diag1.length).toBe(1);
      expect(diag1[0].char).toBe('！？');

      // 2. Followed by full-width space -> valid
      const text2 = 'なんだって！？　それなら大変だ。';
      const diag2 = formatter.lint(text2);
      expect(diag2.length).toBe(0);
    });

    it('exempts exclamation/question marks at line ends and end of document (EOF)', () => {
      const text = '第一章　始まり！\n本当か！\r\n行末の疑問符？';
      const diagnostics = formatter.lint(text);

      expect(diagnostics.length).toBe(0);
    });

    it('bypasses linting during IME composition', () => {
      const text = '本当か！それなら';
      const diagnostics = formatter.lint(text, { isComposing: true });

      expect(diagnostics.length).toBe(0);
    });
  });

  describe('Formatting / Auto-Fix (format)', () => {
    it('automatically inserts full-width spaces where missing', () => {
      const input = '本当か！それなら急ごう。どうして？教えて。';
      const { formattedText, fixesApplied } = formatter.format(input);

      expect(fixesApplied).toBe(2);
      expect(formattedText).toBe('本当か！　それなら急ごう。どうして？　教えて。');
    });

    it('replaces half-width spaces with full-width spaces after ！ and ？', () => {
      const input = '本当か！ それなら急ごう。';
      const { formattedText, fixesApplied } = formatter.format(input);

      expect(fixesApplied).toBe(1);
      expect(formattedText).toBe('本当か！　それなら急ごう。');
    });

    it('converts half-width ! and ? to full-width ！ and ？ and adds spacing', () => {
      const input = '本当か!それなら急ごう。どうして?教えて。';
      const { formattedText, fixesApplied } = formatter.format(input);

      // Conversions + spacing insertions
      expect(fixesApplied).toBeGreaterThan(0);
      expect(formattedText).toBe('本当か！　それなら急ごう。どうして？　教えて。');
    });

    it('preserves closing brackets without inserting spaces', () => {
      const input = '「本当か！」と彼は叫んだ。「何故だ！？」';
      const { formattedText, fixesApplied } = formatter.format(input);

      expect(fixesApplied).toBe(0);
      expect(formattedText).toBe('「本当か！」と彼は叫んだ。「何故だ！？」');
    });

    it('preserves line breaks and EOF without inserting trailing spaces', () => {
      const input = '静寂！\n「何故だ！」';
      const { formattedText, fixesApplied } = formatter.format(input);

      expect(fixesApplied).toBe(0);
      expect(formattedText).toBe('静寂！\n「何故だ！」');
    });

    it('skips formatting when IME composition is active', () => {
      const input = '本当か！それなら';
      const { formattedText, fixesApplied } = formatter.format(input, { isComposing: true });

      expect(fixesApplied).toBe(0);
      expect(formattedText).toBe(input);
    });
  });

  describe('Integration with ThreePaneWorkspace', () => {
    it('runs exclamation spacing diagnostics on text change', () => {
      const workspace = new ThreePaneWorkspace({
        initialText: '本当か！それなら急ごう。',
      });

      const state = workspace.getState();
      expect(state.exclamationDiagnostics.length).toBe(1);
      expect(state.exclamationDiagnostics[0].char).toBe('！');
    });

    it('allows batch auto-formatting exclamation spacing via formatExclamationSpacing', () => {
      const workspace = new ThreePaneWorkspace({
        initialText: '本当か！それなら急ごう。どうして？教えて。',
      });

      const result = workspace.formatExclamationSpacing();
      expect(result.fixesApplied).toBe(2);

      const state = workspace.getState();
      expect(state.rawText).toBe('本当か！　それなら急ごう。どうして？　教えて。');
      expect(state.exclamationDiagnostics.length).toBe(0);
    });

    it('auto-formats exclamation spacing upon autoSave when option is enabled', async () => {
      const workspace = new ThreePaneWorkspace({
        initialText: '何故だ！教えてくれ。',
      });

      const saved = await workspace.autoSave({ autoFormatExclamationSpacing: true });
      expect(saved).toBe(true);

      const state = workspace.getState();
      expect(state.rawText).toBe('何故だ！　教えてくれ。');
    });
  });
});
