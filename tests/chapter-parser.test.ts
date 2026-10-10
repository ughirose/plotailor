import { describe, it, expect } from 'vitest';
import { ChapterParser } from '../src/core/export/ChapterParser.js';

describe('ChapterParser', () => {
  it('should extract foreword and afterword and leave content', () => {
    const raw = `[前書き]
これは前書きのテストです。
[前書き終わり]

ここは本文です。
// これはメモです。

本文の続き。

[後書き]
これは後書きのテストです。
[後書き終わり]`;

    const parsed = ChapterParser.parse(raw);

    expect(parsed.foreword).toBe('これは前書きのテストです。');
    expect(parsed.afterword).toBe('これは後書きのテストです。');
    expect(parsed.content).toContain('ここは本文です。');
    expect(parsed.content).toContain('本文の続き。');
    // Ensure comments are removed
    expect(parsed.content).not.toContain('これはメモです。');
  });

  it('should completely remove block comments', () => {
    const raw = `本文です。%% 伏線メモ %%`;
    const parsed = ChapterParser.parse(raw);

    expect(parsed.content).toBe('本文です。');
    expect(parsed.content).not.toContain('伏線メモ');
  });

  it('should handle text with no foreword/afterword', () => {
    const raw = `ただの本文です。`;
    const parsed = ChapterParser.parse(raw);

    expect(parsed.foreword).toBe('');
    expect(parsed.afterword).toBe('');
    expect(parsed.content).toBe('ただの本文です。');
  });
});
