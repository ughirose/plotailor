import { describe, it, expect } from 'vitest';
import { BracketPairChecker } from '../src/core/editor/BracketPairChecker.js';

describe('BracketPairChecker', () => {
  const checker = new BracketPairChecker();

  it('passes cleanly for perfectly balanced brackets and quotes', () => {
    const text = '「こんにちは」、『本日の【要約】』をお伝えします。（詳細含む）';
    const diagnostics = checker.check(text);
    expect(diagnostics).toHaveLength(0);
  });

  it('handles properly nested brackets of different types', () => {
    const text = '「彼が『【伝説の武器】（紫電の剣）』を握りしめた。」';
    const diagnostics = checker.check(text);
    expect(diagnostics).toHaveLength(0);
  });

  it('detects unclosed opening brackets with exact line and column location', () => {
    const text = '1行目の文章。\n2行目で「未完の台詞\n3行目の文章。';
    const diagnostics = checker.check(text);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      line: 2,
      column: 5,
      bracket: '「',
      type: 'unclosed_open',
      expectedBracket: '」',
    });
  });

  it('detects unmatched excess closing brackets', () => {
    const text = '「台詞です」」';
    const diagnostics = checker.check(text);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      line: 1,
      column: 7,
      bracket: '」',
      type: 'unmatched_close',
      expectedBracket: '「',
    });
  });

  it('detects mismatched bracket pair types', () => {
    const text = '「間違えた括弧の閉じ方』';
    const diagnostics = checker.check(text);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      line: 1,
      column: 12,
      bracket: '』',
      type: 'mismatched_pair',
      expectedBracket: '」',
    });
  });

  it('handles multiple error types across multiple lines accurately', () => {
    const text = '「1行目の未閉じ\n『2行目のミスマッチ」\n3行目の過剰閉じ）';
    const diagnostics = checker.check(text);
    expect(diagnostics).toHaveLength(3);

    // Mismatched on line 2 ('『2行目のミスマッチ」') -> 『 is at col 1, 2(1), 行(2), 目(3), の(4), ミ(5), ス(6), マ(7), ッ(8), チ(9), 」 is at col 11
    expect(diagnostics.find((d) => d.type === 'mismatched_pair')).toMatchObject({
      line: 2,
      column: 11,
      bracket: '」',
      expectedBracket: '』',
    });

    // Unmatched close on line 3
    expect(diagnostics.find((d) => d.type === 'unmatched_close')).toMatchObject({
      line: 3,
      column: 9,
      bracket: '）',
      expectedBracket: '（',
    });

    // Unclosed open on line 1
    expect(diagnostics.find((d) => d.type === 'unclosed_open')).toMatchObject({
      line: 1,
      column: 1,
      bracket: '「',
      expectedBracket: '」',
    });
  });

  it('bypasses check when isComposing is true (IME input guard)', () => {
    const text = '「確定前の未完成テキスト';
    const diagnostics = checker.check(text, { isComposing: true });
    expect(diagnostics).toHaveLength(0);
  });

  it('returns empty diagnostics for empty strings or text without brackets', () => {
    expect(checker.check('')).toHaveLength(0);
    expect(checker.check('普通の日本語テキストです。')).toHaveLength(0);
  });
});
