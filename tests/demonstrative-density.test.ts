import { describe, it, expect } from 'vitest';
import {
  DemonstrativeDensityLinter,
  DEFAULT_DEMONSTRATIVES,
  AozoraParser,
} from '../src/index.js';

describe('DemonstrativeDensityLinter', () => {
  it('initializes with default options and DEFAULT_DEMONSTRATIVES', () => {
    const linter = new DemonstrativeDensityLinter();
    expect(linter).toBeDefined();

    const scoreInfo = linter.calculateDensityScore('これはそれである。');
    expect(scoreInfo.count).toBe(2);
    expect(scoreInfo.totalChars).toBe(9);
    expect(scoreInfo.densityScore).toBeCloseTo(2 / 9);
  });

  it('detects high demonstrative count within a single paragraph exceeding paragraphCountThreshold', () => {
    const linter = new DemonstrativeDensityLinter({
      paragraphCountThreshold: 3,
      paragraphDensityThreshold: 0.05,
    });

    const text = 'これはそれであり、アレもまたソレなのだ。それにしても、これについてのあれこれの議論は絶えない。';
    // 'これ', 'それ', 'それ', 'これ' -> demonstratives in paragraph: 4 matches
    const diagnostics = linter.lint(text);

    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0].triggerReason).toBe('paragraph_count');
    expect(diagnostics[0].countInSegment).toBeGreaterThanOrEqual(3);
    expect(diagnostics[0].severity).toBe('warning');
    expect(diagnostics[0].message).toContain('段落内で指示語');
    expect(diagnostics[0].suggestions.length).toBeGreaterThan(0);
  });

  it('detects high demonstrative density within a short paragraph exceeding paragraphDensityThreshold', () => {
    const linter = new DemonstrativeDensityLinter({
      paragraphCountThreshold: 10, // high count threshold
      paragraphDensityThreshold: 0.1, // 10% threshold
    });

    // Short text with multiple demonstratives
    const text = 'これとそれ。'; // 6 chars, 2 demonstratives => density 2/6 = 33.3%
    const diagnostics = linter.lint(text);

    expect(diagnostics.length).toBe(2);
    expect(diagnostics[0].triggerReason).toBe('paragraph_density');
    expect(diagnostics[0].densityScore).toBeGreaterThanOrEqual(0.1);
  });

  it('detects demonstrative proximity duplicate in consecutive sentences', () => {
    const linter = new DemonstrativeDensityLinter({
      paragraphCountThreshold: 100, // prevent paragraph threshold trigger
      paragraphDensityThreshold: 1.0,
      consecutiveSentenceCountThreshold: 2,
      sentenceWindowSize: 2,
    });

    // Two consecutive sentences containing demonstratives
    const text = 'あの人物が事件の鍵を握っていた。それについて彼は何も語らなかった。';
    const diagnostics = linter.lint(text);

    expect(diagnostics.length).toBe(2);
    expect(diagnostics[0].demonstrative).toBe('あの');
    expect(diagnostics[1].demonstrative).toBe('それ');
    expect(diagnostics[0].triggerReason).toBe('consecutive_sentences');
    expect(diagnostics[0].message).toContain('【指示語近接重複】');
  });

  it('bypasses linting when Japanese IME composition is active (isComposing: true)', () => {
    const linter = new DemonstrativeDensityLinter({
      paragraphCountThreshold: 2,
    });

    const text = 'これはそれであり、あれもまたそれだ。';
    const composingDiagnostics = linter.lint(text, { isComposing: true });

    expect(composingDiagnostics).toEqual([]);
  });

  it('correctly maps character offsets when Aozora ruby markup is present in text', () => {
    const linter = new DemonstrativeDensityLinter({
      paragraphCountThreshold: 2,
    });

    // raw text with Aozora ruby: ｜親文字《るび》
    const raw = '｜これ《指示語》は｜それ《指示語》である。';
    const { map } = AozoraParser.parse(raw);

    const diagnostics = linter.lint(raw, { displayMap: map });
    expect(diagnostics.length).toBe(2);

    // Display offsets should be remapped appropriately
    expect(diagnostics[0].from).toBeLessThan(diagnostics[0].to);
  });

  it('supports updating configuration options dynamically with setOptions', () => {
    const linter = new DemonstrativeDensityLinter();

    linter.setOptions({
      demonstratives: ['魔導', '秘宝'],
      paragraphCountThreshold: 2,
      paragraphDensityThreshold: 0.1,
      consecutiveSentenceCountThreshold: 2,
      sentenceWindowSize: 2,
    });

    const text = '魔導の書と秘宝を求める。';
    const score = linter.calculateDensityScore(text);
    expect(score.count).toBe(2);

    const diagnostics = linter.lint(text);
    expect(diagnostics.length).toBe(2);
    expect(diagnostics[0].demonstrative).toBe('魔導');
    expect(diagnostics[1].demonstrative).toBe('秘宝');
  });

  it('returns empty diagnostics for text without demonstratives or below thresholds', () => {
    const linter = new DemonstrativeDensityLinter();
    const cleanText = 'ヴァレリウス将軍は北方砦から静かに帰還した。王都の夜空には二つの月が輝いていた。';

    const diagnostics = linter.lint(cleanText);
    expect(diagnostics).toEqual([]);
  });

  it('handles empty string, null/undefined inputs gracefully', () => {
    const linter = new DemonstrativeDensityLinter();

    expect(linter.lint('')).toEqual([]);
    expect(linter.calculateDensityScore('')).toEqual({
      densityScore: 0,
      count: 0,
      totalChars: 0,
    });
  });
});
