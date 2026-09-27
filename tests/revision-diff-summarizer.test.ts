import { describe, it, expect } from 'vitest';
import {
  RevisionDiffSummarizer,
  diffArrays,
  diffInline,
} from '../src/core/editor/RevisionDiffSummarizer.js';

describe('RevisionDiffSummarizer', () => {
  describe('diffArrays', () => {
    it('returns empty array when both arrays are empty', () => {
      expect(diffArrays([], [])).toEqual([]);
    });

    it('identifies inserted elements when old array is empty', () => {
      const result = diffArrays([], ['a', 'b']);
      expect(result).toEqual([
        { op: 'insert', newIndex: 0, val: 'a' },
        { op: 'insert', newIndex: 1, val: 'b' },
      ]);
    });

    it('identifies deleted elements when new array is empty', () => {
      const result = diffArrays(['a', 'b'], []);
      expect(result).toEqual([
        { op: 'delete', oldIndex: 0, val: 'a' },
        { op: 'delete', oldIndex: 1, val: 'b' },
      ]);
    });

    it('identifies equal and modified elements accurately', () => {
      const oldArr = ['第一章', '昔々あるところに', 'おじいさんがいました'];
      const newArr = ['第一章', '昔々あるところに', 'おじいさんとおばあさんがいました'];
      const result = diffArrays(oldArr, newArr);

      expect(result[0]).toEqual({ op: 'equal', oldIndex: 0, newIndex: 0, val: '第一章' });
      expect(result[1]).toEqual({ op: 'equal', oldIndex: 1, newIndex: 1, val: '昔々あるところに' });
      expect(result[2]).toEqual({ op: 'delete', oldIndex: 2, val: 'おじいさんがいました' });
      expect(result[3]).toEqual({ op: 'insert', newIndex: 2, val: 'おじいさんとおばあさんがいました' });
    });
  });

  describe('diffInline', () => {
    it('generates inline diff tokens for character changes', () => {
      const oldStr = 'おじいさんがいました';
      const newStr = 'おじいさんとおばあさんがいました';
      const tokens = diffInline(oldStr, newStr);

      expect(tokens[0]).toEqual({ type: 'equal', value: 'おじいさん' });
      expect(tokens.find(t => t.type === 'insert')?.value).toBe('とおばあさん');
      expect(tokens[tokens.length - 1]).toEqual({ type: 'equal', value: 'がいました' });
    });
  });

  describe('diffLines', () => {
    const summarizer = new RevisionDiffSummarizer();

    it('handles identical multiline texts', () => {
      const text = '第一段落\n第二段落\n第三段落';
      const results = summarizer.diffLines(text, text);

      expect(results.length).toBe(3);
      expect(results.every(r => r.type === 'unchanged')).toBe(true);
      expect(results[0].charDelta).toBe(0);
    });

    it('detects modified paragraph with correct character delta and inline diffs', () => {
      const oldText = '第一段落\n昔々あるところに、おじいさんが住んでいました。\n第三段落';
      const newText = '第一段落\n昔々あるところに、おじいさんとおばあさんが住んでいました。\n第三段落';

      const results = summarizer.diffLines(oldText, newText);

      expect(results[0].type).toBe('unchanged');
      expect(results[1].type).toBe('modified');
      expect(results[1].oldLineIndex).toBe(1);
      expect(results[1].newLineIndex).toBe(1);
      expect(results[1].charDelta).toBe(6); // 「とおばあさん」(+6文字)
      expect(results[1].inlineDiffs).toBeDefined();
      expect(results[2].type).toBe('unchanged');
    });

    it('detects added and deleted paragraphs', () => {
      const oldText = '第1段落\n削除される段落\n第3段落';
      const newText = '第1段落\n追加された新規段落\n第3段落';

      const results = summarizer.diffLines(oldText, newText);

      expect(results[1].type).toBe('modified');
      expect(results[1].oldLine).toBe('削除される段落');
      expect(results[1].newLine).toBe('追加された新規段落');
    });
  });

  describe('summarize', () => {
    it('produces human-readable summary for paragraph modification matching task spec', () => {
      const oldText = 'タイトル\n\n第1段落です。\n第2段落の初期稿です。';
      const newText = 'タイトル\n\n第1段落です。\n第2段落修正: +15字 / 『初期稿』→『決定稿』';

      const summary = RevisionDiffSummarizer.summarize(oldText, newText);

      expect(summary.stats.oldCharCount).toBe(Array.from(oldText).length);
      expect(summary.stats.newCharCount).toBe(Array.from(newText).length);
      expect(summary.lineSummaries.length).toBe(1);
      expect(summary.lineSummaries[0]).toContain('第4段落修正:');
      expect(summary.summaryText).toContain('【執筆履歴 差分要約】');
      expect(summary.summaryText).toContain('修正: 1段落');
    });

    it('produces "差分はありません" summary for unchanged text', () => {
      const text = '同じ文章です。';
      const summary = RevisionDiffSummarizer.summarize(text, text);

      expect(summary.lineSummaries.length).toBe(0);
      expect(summary.summaryText).toContain('差分はありません');
    });

    it('respects custom snippet length option and line label', () => {
      const oldText = 'とても長い長い古い段落の文章です。';
      const newText = 'とても長い長い新しい段落の文章です。';

      const summary = RevisionDiffSummarizer.summarize(oldText, newText, {
        maxSnippetLength: 5,
        lineLabel: '行',
      });

      expect(summary.lineSummaries[0]).toContain('第1行修正:');
      expect(summary.lineSummaries[0]).toContain('『とても長い…』');
    });
  });
});
