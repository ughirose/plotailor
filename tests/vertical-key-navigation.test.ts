import { describe, it, expect } from 'vitest';
import {
  VerticalKeyNavigationEngine,
  ArrowKey,
} from '../src/core/editor/VerticalKeyNavigationEngine.js';

describe('VerticalKeyNavigationEngine', () => {
  describe('computeVisualLines', () => {
    it('handles empty string', () => {
      const lines = VerticalKeyNavigationEngine.computeVisualLines('');
      expect(lines).toHaveLength(1);
      expect(lines[0]).toEqual({
        lineIndex: 0,
        startIndex: 0,
        endIndex: 0,
        text: '',
        isParagraphEnd: true,
      });
    });

    it('splits text by newlines', () => {
      const text = '吾輩は猫である。\n名前はまだ無い。';
      const lines = VerticalKeyNavigationEngine.computeVisualLines(text);
      expect(lines).toHaveLength(2);
      expect(lines[0]).toEqual({
        lineIndex: 0,
        startIndex: 0,
        endIndex: 8,
        text: '吾輩は猫である。',
        isParagraphEnd: true,
      });
      expect(lines[1]).toEqual({
        lineIndex: 1,
        startIndex: 9,
        endIndex: 17,
        text: '名前はまだ無い。',
        isParagraphEnd: true,
      });
    });

    it('soft wraps lines when maxCharsPerLine is set', () => {
      const text = '吾輩は猫である。名前はまだ無い。'; // 16 chars
      const lines = VerticalKeyNavigationEngine.computeVisualLines(text, 10);
      expect(lines).toHaveLength(2);
      expect(lines[0]).toEqual({
        lineIndex: 0,
        startIndex: 0,
        endIndex: 10,
        text: '吾輩は猫である。名前',
        isParagraphEnd: false,
      });
      expect(lines[1]).toEqual({
        lineIndex: 1,
        startIndex: 10,
        endIndex: 16,
        text: 'はまだ無い。',
        isParagraphEnd: true,
      });
    });
  });

  describe('findVisualLineIndex', () => {
    it('returns correct line index for given offsets', () => {
      const text = '一二三\n四五六';
      const lines = VerticalKeyNavigationEngine.computeVisualLines(text);
      expect(VerticalKeyNavigationEngine.findVisualLineIndex(lines, 0)).toBe(0);
      expect(VerticalKeyNavigationEngine.findVisualLineIndex(lines, 2)).toBe(0);
      expect(VerticalKeyNavigationEngine.findVisualLineIndex(lines, 3)).toBe(0); // newline char
      expect(VerticalKeyNavigationEngine.findVisualLineIndex(lines, 4)).toBe(1);
      expect(VerticalKeyNavigationEngine.findVisualLineIndex(lines, 7)).toBe(1);
    });
  });

  describe('calculateNavigation in vertical-rl mode', () => {
    const text = '吾輩は猫である。\n名前はまだ無い。';

    it('ArrowUp moves to previous character (upward in vertical line)', () => {
      const res = VerticalKeyNavigationEngine.calculateNavigation({
        text,
        cursorOffset: 3, // '猫'
        key: 'ArrowUp',
      });
      expect(res.newOffset).toBe(2);
      expect(res.charIndexInLine).toBe(2);
      expect(res.visualLineIndex).toBe(0);
    });

    it('ArrowUp clamps at document start (offset 0)', () => {
      const res = VerticalKeyNavigationEngine.calculateNavigation({
        text,
        cursorOffset: 0,
        key: 'ArrowUp',
      });
      expect(res.newOffset).toBe(0);
      expect(res.charIndexInLine).toBe(0);
      expect(res.visualLineIndex).toBe(0);
    });

    it('ArrowDown moves to next character (downward in vertical line)', () => {
      const res = VerticalKeyNavigationEngine.calculateNavigation({
        text,
        cursorOffset: 2,
        key: 'ArrowDown',
      });
      expect(res.newOffset).toBe(3);
      expect(res.charIndexInLine).toBe(3);
      expect(res.visualLineIndex).toBe(0);
    });

    it('ArrowDown clamps at document end', () => {
      const res = VerticalKeyNavigationEngine.calculateNavigation({
        text,
        cursorOffset: text.length,
        key: 'ArrowDown',
      });
      expect(res.newOffset).toBe(text.length);
      expect(res.visualLineIndex).toBe(1);
    });

    it('ArrowLeft moves to next column / next line (leftward column in vertical-rl)', () => {
      const res = VerticalKeyNavigationEngine.calculateNavigation({
        text,
        cursorOffset: 3, // '猫' in line 0 (char index 3)
        key: 'ArrowLeft',
      });
      expect(res.visualLineIndex).toBe(1);
      expect(res.charIndexInLine).toBe(3);
      expect(res.newOffset).toBe(9 + 3); // line 1 starts at index 9, so 12 ('ま')
      expect(res.goalCharIndex).toBe(3);
    });

    it('ArrowRight moves to previous column / right column in vertical-rl', () => {
      const res = VerticalKeyNavigationEngine.calculateNavigation({
        text,
        cursorOffset: 12, // 'ま' in line 1 (char index 3)
        key: 'ArrowRight',
      });
      expect(res.visualLineIndex).toBe(0);
      expect(res.charIndexInLine).toBe(3);
      expect(res.newOffset).toBe(3); // line 0 char index 3 ('猫')
      expect(res.goalCharIndex).toBe(3);
    });

    it('preserves sticky goalCharIndex when moving across short lines', () => {
      const multiLineText = '一二三四五六七八九十\nABC\n甲乙丙丁戊';
      // Start on line 0, char index 7
      let res = VerticalKeyNavigationEngine.calculateNavigation({
        text: multiLineText,
        cursorOffset: 7,
        key: 'ArrowLeft', // Move to line 1 ("ABC", length 3)
      });
      expect(res.visualLineIndex).toBe(1);
      expect(res.charIndexInLine).toBe(3); // Clamped to length of line 1
      expect(res.goalCharIndex).toBe(7); // Preserves goal of 7

      // Move left again to line 2 ("甲乙丙丁戊", length 5)
      res = VerticalKeyNavigationEngine.calculateNavigation({
        text: multiLineText,
        cursorOffset: res.newOffset,
        key: 'ArrowLeft',
        goalCharIndex: res.goalCharIndex,
      });
      expect(res.visualLineIndex).toBe(2);
      expect(res.charIndexInLine).toBe(5); // Clamped to line 2 length 5
      expect(res.goalCharIndex).toBe(7); // Goal 7 maintained
    });

    it('handles soft-wrapped visual lines seamlessly', () => {
      const longLine = '一二三四五六七八九十ABCDEFGHIJ';
      // Max 10 chars per line -> line 0: '一二三四五六七八九十', line 1: 'ABCDEFGHIJ'
      const res = VerticalKeyNavigationEngine.calculateNavigation({
        text: longLine,
        cursorOffset: 5, // '六' in line 0
        key: 'ArrowLeft', // move to line 1
        maxCharsPerLine: 10,
      });
      expect(res.visualLineIndex).toBe(1);
      expect(res.charIndexInLine).toBe(5);
      expect(res.newOffset).toBe(15); // 'F'
    });
  });
});
