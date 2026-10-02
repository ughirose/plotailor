import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import {
  calculateManuscriptMetrics,
  japaneseBeautifyExtension,
} from '../src/core/editor/JapaneseBeautifyExtension.js';

describe('Japanese Beautify Extension & Manuscript Counter (PR #737)', () => {
  describe('calculateManuscriptMetrics', () => {
    it('accurately calculates metrics for standard Japanese text', () => {
      // 10 chars, 2 spaces = 8 trimmed chars
      const text = '吾輩は 猫である。　';
      const metrics = calculateManuscriptMetrics(text);

      expect(metrics.rawCharacters).toBe(10);
      expect(metrics.trimmedCharacters).toBe(8);
      expect(metrics.genkoSheets).toBe(1); // ceil(8 / 400) = 1
      expect(metrics.estimatedReadingMinutes).toBe(0); // 8 / 500 = 0.016 -> 0
    });

    it('returns zeroes for empty text', () => {
      const metrics = calculateManuscriptMetrics('');
      expect(metrics.rawCharacters).toBe(0);
      expect(metrics.trimmedCharacters).toBe(0);
      expect(metrics.genkoSheets).toBe(0);
      expect(metrics.estimatedReadingMinutes).toBe(0);
    });

    it('calculates 400-char Genko Yoshi sheets correctly for large manuscripts', () => {
      // 850 non-whitespace chars -> ceil(850 / 400) = 3 sheets
      const text = 'あ'.repeat(850);
      const metrics = calculateManuscriptMetrics(text);
      expect(metrics.rawCharacters).toBe(850);
      expect(metrics.trimmedCharacters).toBe(850);
      expect(metrics.genkoSheets).toBe(3);
      expect(metrics.estimatedReadingMinutes).toBe(1.7); // 850 / 500 = 1.7
    });

    it('executes in < 5ms for 100,000 characters (performance constraint)', () => {
      const longManuscript = ('吾輩は猫である。名前はまだ無い。\nどこで生れたかとんと見当がつかぬ。　' + '……――「そうだね」').repeat(2500);
      expect(longManuscript.length).toBeGreaterThan(100000);

      const start = performance.now();
      const metrics = calculateManuscriptMetrics(longManuscript);
      const elapsed = performance.now() - start;

      expect(metrics.rawCharacters).toBe(longManuscript.length);
      expect(metrics.genkoSheets).toBeGreaterThan(200);
      expect(elapsed).toBeLessThan(5); // Must be strictly < 5ms
    });
  });

  describe('japaneseBeautifyExtension CodeMirror 6 Transactions', () => {
    function createState(doc: string, cursorPos = doc.length, options = {}) {
      return EditorState.create({
        doc,
        selection: { anchor: cursorPos },
        extensions: [japaneseBeautifyExtension(options)],
      });
    }

    it('snaps single ellipsis "…" to double "……"', () => {
      let state = createState('ここは');
      const tr = state.update({
        changes: { from: 3, to: 3, insert: '…' },
      });
      state = state.update(tr).state;
      expect(state.doc.toString()).toBe('ここは……');
      expect(state.selection.main.head).toBe(5);
    });

    it('snaps single dash "―" to double "――"', () => {
      let state = createState('彼は');
      const tr = state.update({
        changes: { from: 2, to: 2, insert: '―' },
      });
      state = state.update(tr).state;
      expect(state.doc.toString()).toBe('彼は――');
      expect(state.selection.main.head).toBe(4);
    });

    it('does not double-snap when inserting into already doubled ellipsis', () => {
      let state = createState('ここは……');
      const tr = state.update({
        changes: { from: 5, to: 5, insert: '…' },
      });
      state = state.update(tr).state;
      expect(state.doc.toString()).toBe('ここは………');
    });

    it('auto-closes Japanese brackets and places cursor inside', () => {
      let state = createState('言った。');
      const tr = state.update({
        changes: { from: 0, to: 0, insert: '「' },
      });
      state = state.update(tr).state;
      expect(state.doc.toString()).toBe('「」言った。');
      expect(state.selection.main.head).toBe(1); // Cursor between 「 and 」
    });

    it('wraps selected text with Japanese brackets', () => {
      const state = EditorState.create({
        doc: 'これは重要です',
        selection: { anchor: 3, head: 5 }, // '重要'
        extensions: [japaneseBeautifyExtension()],
      });
      const tr = state.update({
        changes: { from: 3, to: 5, insert: '『' },
      });
      const newState = state.update(tr).state;
      expect(newState.doc.toString()).toBe('これは『重要』です');
    });

    it('skips over closing bracket when typing identical closing bracket', () => {
      let state = createState('「」', 1); // cursor between 「 and 」
      const tr = state.update({
        changes: { from: 1, to: 1, insert: '」' },
      });
      state = state.update(tr).state;
      expect(state.doc.toString()).toBe('「」');
      expect(state.selection.main.head).toBe(2); // Cursor moved past 」
    });

    it('auto-indents newlines with full-width space', () => {
      let state = createState('第一段落。');
      const tr = state.update({
        changes: { from: 5, to: 5, insert: '\n' },
      });
      state = state.update(tr).state;
      expect(state.doc.toString()).toBe('第一段落。\n　');
      expect(state.selection.main.head).toBe(7);
    });

    it('removes leading full-width space when typing dialogue bracket at line start', () => {
      // Line begins with '　' and user types '「' right after it
      let state = createState('\n　', 2);
      const tr = state.update({
        changes: { from: 2, to: 2, insert: '「' },
      });
      state = state.update(tr).state;
      expect(state.doc.toString()).toBe('\n「」');
      expect(state.selection.main.head).toBe(2); // Positioned inside 「 and 」
    });

    it('respects configuration toggles (autoSnapYakumono: false)', () => {
      let state = createState('テスト', 3, { autoSnapYakumono: false });
      const tr = state.update({
        changes: { from: 3, to: 3, insert: '…' },
      });
      state = state.update(tr).state;
      expect(state.doc.toString()).toBe('テスト…'); // Not snapped
    });

    it('respects master enabled toggle (enabled: false)', () => {
      let state = createState('テスト', 3, { enabled: false });
      const tr = state.update({
        changes: { from: 3, to: 3, insert: '「' },
      });
      state = state.update(tr).state;
      expect(state.doc.toString()).toBe('テスト「'); // No auto-closing
    });
  });
});
