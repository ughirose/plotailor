import { describe, it, expect } from 'vitest';
import {
  DemonstrativeOveruseDetector,
  DEFAULT_DEMONSTRATIVE_TERMS,
} from '../src/core/editor/DemonstrativeOveruseDetector.js';
import { AozoraParser } from '../src/core/editor/AozoraParser.js';

describe('DemonstrativeOveruseDetector', () => {
  it('initializes with default options and DEFAULT_DEMONSTRATIVE_TERMS', () => {
    const detector = new DemonstrativeOveruseDetector();
    expect(detector).toBeDefined();

    const options = detector.getOptions();
    expect(options.demonstratives).toEqual(DEFAULT_DEMONSTRATIVE_TERMS);
    expect(options.paragraphCountThreshold).toBe(3);
    expect(options.paragraphDensityThreshold).toBe(0.05);
    expect(options.consecutiveSentenceCountThreshold).toBe(2);
    expect(options.sentenceWindowSize).toBe(3);
  });

  it('extracts demonstrative keywords correctly with linear time Aho-Corasick automaton', () => {
    const detector = new DemonstrativeOveruseDetector();
    const text = 'これとそれとあれをそこからあそこへ移動する。';

    const matches = detector.extractDemonstratives(text);
    expect(matches.length).toBe(5);
    expect(matches.map((m) => m.keyword)).toEqual(['これ', 'それ', 'あれ', 'そこ', 'あそこ']);
  });

  it('detects high demonstrative count in a paragraph exceeding paragraphCountThreshold', () => {
    const detector = new DemonstrativeOveruseDetector({
      paragraphCountThreshold: 3,
      paragraphPenaltyBase: 15,
    });

    const text = 'これとそれがあり、あれもまたこれなのだ。これについての議論が続く。';
    const diagnostics = detector.detect(text);

    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0].severity).toBe('warning');
    expect(diagnostics[0].message).toContain('【指示語');
    expect(diagnostics[0].penaltyScore).toBeGreaterThan(0);
    expect(diagnostics[0].suggestions.length).toBeGreaterThan(0);
    expect(diagnostics[0].suggestions[0]).toContain('具体的名詞');
  });

  it('detects high demonstrative density in a short paragraph', () => {
    const detector = new DemonstrativeOveruseDetector({
      paragraphCountThreshold: 10, // high count threshold
      paragraphDensityThreshold: 0.1, // 10% density threshold
    });

    const text = 'これとそれ。'; // 6 chars, 2 demonstratives => density 2/6 = 33.3%
    const diagnostics = detector.detect(text);

    expect(diagnostics.length).toBe(2);
    expect(diagnostics[0].demonstrative).toBe('これ');
    expect(diagnostics[1].demonstrative).toBe('それ');
    expect(diagnostics[0].triggerReason).toBe('paragraph_overuse');
  });

  it('detects proximity overuse in consecutive sentences within 2 preceding sentences context', () => {
    const detector = new DemonstrativeOveruseDetector({
      paragraphCountThreshold: 100, // disable paragraph count trigger
      paragraphDensityThreshold: 1.0, // disable paragraph density trigger
      consecutiveSentenceCountThreshold: 2,
      sentenceWindowSize: 3, // current + 2 preceding sentences
    });

    const text = 'あの人物が事件の鍵を握っていた。それについて彼は何も語らなかった。';
    const diagnostics = detector.detect(text);

    expect(diagnostics.length).toBe(2);
    expect(diagnostics[0].demonstrative).toBe('あの');
    expect(diagnostics[1].demonstrative).toBe('それ');
    expect(diagnostics[0].triggerReason).toBe('sentence_proximity');
    expect(diagnostics[0].message).toContain('【指示語近接多用】');
  });

  it('triggers same_term_repetition and applies penalty bonus when exact same demonstrative is repeated', () => {
    const detector = new DemonstrativeOveruseDetector({
      paragraphCountThreshold: 2,
      sameTermPenaltyBonus: 20,
    });

    const text = 'これは重要だ。これこそが真実なのだ。';
    const diagnostics = detector.detect(text);

    expect(diagnostics.length).toBe(2);
    expect(diagnostics[0].triggerReason).toBe('same_term_repetition');
    expect(diagnostics[0].penaltyScore).toBeGreaterThanOrEqual(35); // base 15 + bonus 20
  });

  it('calculates total overuse penalty score for a text segment correctly', () => {
    const detector = new DemonstrativeOveruseDetector({
      paragraphCountThreshold: 2,
      paragraphPenaltyBase: 10,
    });

    const text = 'これとそれがここにある。';
    const totalPenalty = detector.calculateOverusePenaltyScore(text);
    const diagnostics = detector.detect(text);

    expect(diagnostics.length).toBe(3);
    expect(totalPenalty).toBe(diagnostics.reduce((sum, d) => sum + d.penaltyScore, 0));
  });

  it('bypasses detection when Japanese IME composition is active (isComposing: true)', () => {
    const detector = new DemonstrativeOveruseDetector({
      paragraphCountThreshold: 2,
    });

    const text = 'これはそれであり、あれもまたそれだ。';
    const composingDiagnostics = detector.detect(text, { isComposing: true });

    expect(composingDiagnostics).toEqual([]);
  });

  it('correctly maps character offsets when Aozora ruby markup is present in text', () => {
    const detector = new DemonstrativeOveruseDetector({
      paragraphCountThreshold: 2,
    });

    const rawText = '｜これ《指示語》は｜それ《指示語》である。';
    const { map } = AozoraParser.parse(rawText);

    const diagnostics = detector.detect(rawText, { displayMap: map });

    expect(diagnostics.length).toBe(2);
    expect(diagnostics[0].from).toBeLessThan(diagnostics[0].to);
  });

  it('supports dynamic options update with setOptions and querying with getOptions', () => {
    const detector = new DemonstrativeOveruseDetector();

    detector.setOptions({
      demonstratives: ['魔導', '秘宝'],
      paragraphCountThreshold: 2,
      paragraphPenaltyBase: 50,
    });

    const options = detector.getOptions();
    expect(options.demonstratives).toEqual(['魔導', '秘宝']);
    expect(options.paragraphPenaltyBase).toBe(50);

    const text = '魔導の試練と秘宝の謎。';
    const diagnostics = detector.detect(text);

    expect(diagnostics.length).toBe(2);
    expect(diagnostics[0].demonstrative).toBe('魔導');
    expect(diagnostics[1].demonstrative).toBe('秘宝');
    expect(diagnostics[0].penaltyScore).toBeGreaterThanOrEqual(50);
  });

  it('returns empty diagnostics for text without demonstrative overuse', () => {
    const detector = new DemonstrativeOveruseDetector();
    const cleanText = 'ヴァレリウス将軍は北方砦から静かに帰還した。王都の夜空には二つの月が輝いていた。';

    const diagnostics = detector.detect(cleanText);
    expect(diagnostics).toEqual([]);
    expect(detector.calculateOverusePenaltyScore(cleanText)).toBe(0);
  });

  it('handles empty string and graceful fallback for empty inputs', () => {
    const detector = new DemonstrativeOveruseDetector();

    expect(detector.detect('')).toEqual([]);
    expect(detector.lint('')).toEqual([]);
    expect(detector.extractDemonstratives('')).toEqual([]);
    expect(detector.calculateOverusePenaltyScore('')).toBe(0);
  });
});
