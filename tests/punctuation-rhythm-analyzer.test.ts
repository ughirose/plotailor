import { describe, it, expect, beforeEach } from 'vitest';
import { PunctuationRhythmAnalyzer } from '../src/core/editor/PunctuationRhythmAnalyzer.js';
import { SourceToDisplayMap } from '../src/core/editor/AozoraParser.js';

describe('PunctuationRhythmAnalyzer', () => {
  let analyzer: PunctuationRhythmAnalyzer;

  beforeEach(() => {
    analyzer = new PunctuationRhythmAnalyzer();
  });

  describe('Statistical Analysis', () => {
    it('calculates statistics correctly for simple multi-sentence text', () => {
      const text = '夜空に星が輝いている。風が静かに吹いて、木々が揺れていた。彼はそっと歩き出した。';
      const result = analyzer.analyze(text);

      expect(result.stats.totalSentences).toBe(3);
      expect(result.stats.totalCommas).toBe(1);
      expect(result.sentences.length).toBe(3);

      expect(result.sentences[0].charCount).toBe(11); // 夜空に星が輝いている。
      expect(result.sentences[0].commaCount).toBe(0);

      expect(result.sentences[1].charCount).toBe(16); // 風が静かに吹いて、木々が揺れていた。
      expect(result.sentences[1].commaCount).toBe(1);

      expect(result.sentences[2].charCount).toBe(10); // 彼はそっと歩き出した。
      expect(result.sentences[2].commaCount).toBe(0);

      expect(result.stats.maxSentenceLength).toBe(16);
      expect(result.stats.minSentenceLength).toBe(10);
      expect(result.stats.avgSentenceLength).toBe(12.3);
      expect(result.stats.avgCommasPerSentence).toBe(0.33);
    });

    it('returns empty result for blank or whitespace text', () => {
      const result1 = analyzer.analyze('');
      expect(result1.score).toBe(100);
      expect(result1.stats.totalSentences).toBe(0);
      expect(result1.issues.length).toBe(0);

      const result2 = analyzer.analyze('   \n  \n');
      expect(result2.score).toBe(100);
      expect(result2.stats.totalSentences).toBe(0);
      expect(result2.issues.length).toBe(0);
    });
  });

  describe('Detection of Long Sentences (> 80 characters)', () => {
    it('detects sentences exceeding 80 characters', () => {
      // 85 characters long sentence
      const longSentence = '彼が静かな夜の街を一人で歩いている時、遠くの街灯の下で人影が揺れたが、気にせず進むと急に冷たい風が吹き抜けて、コートの襟を立てながら夜空を見上げると満月が美しく輝いていた。';
      expect(longSentence.length).toBe(85);

      const result = analyzer.analyze(longSentence);

      const longSentenceIssues = result.issues.filter((i) => i.type === 'long_sentence');
      expect(longSentenceIssues.length).toBe(1);

      const issue = longSentenceIssues[0];
      expect(issue.severity).toBe('warning');
      expect(issue.charCount).toBe(85);
      expect(issue.from).toBe(0);
      expect(issue.to).toBe(85);
      expect(issue.message).toContain('1文の文字数が85文字であり');
      expect(issue.suggestions.length).toBeGreaterThan(0);
    });

    it('does not flag sentences with 80 characters or fewer', () => {
      const normalSentence = '彼が静かな夜の街を一人で歩いている時、遠くの街灯の下で人影が揺れたが、気にせず進むと急に冷たい風が吹き抜けて、コートの襟を立てて夜空を見上げた。'; // 74 chars
      const result = analyzer.analyze(normalSentence);

      const longSentenceIssues = result.issues.filter((i) => i.type === 'long_sentence');
      expect(longSentenceIssues.length).toBe(0);
    });
  });

  describe('Detection of Dense Punctuation (>= 4 commas)', () => {
    it('detects sentences containing 4 or more 読点', () => {
      const denseSentence = '昔々、ある所に、おじいさんと、おばあさんが、住んでいました。'; // 4 commas
      const result = analyzer.analyze(denseSentence);

      const denseIssues = result.issues.filter((i) => i.type === 'dense_punctuation');
      expect(denseIssues.length).toBe(1);

      const issue = denseIssues[0];
      expect(issue.severity).toBe('warning');
      expect(issue.commaCount).toBe(4);
      expect(issue.message).toContain('読点（、）が4個使用されており');
    });

    it('does not flag sentences with fewer than 4 commas', () => {
      const normalSentence = '昔々、ある所に、おじいさんとおばあさんが住んでいました。'; // 2 commas
      const result = analyzer.analyze(normalSentence);

      const denseIssues = result.issues.filter((i) => i.type === 'dense_punctuation');
      expect(denseIssues.length).toBe(0);
    });
  });

  describe('Detection of Sparse Punctuation (>= 40 characters without 読点)', () => {
    it('detects sentences containing 40 or more consecutive characters without 読点', () => {
      const sparseSentence = '静まり返った漆黒の闇の中で不気味な遠吠えが地響きのように響き渡り彼らの身体を固直させた。'; // 43 chars without comma
      const result = analyzer.analyze(sparseSentence);

      const sparseIssues = result.issues.filter((i) => i.type === 'sparse_punctuation');
      expect(sparseIssues.length).toBe(1);

      const issue = sparseIssues[0];
      expect(issue.severity).toBe('info');
      expect(issue.message).toContain('読点（、）がない区間が43文字続いています');
    });

    it('does not flag when 読点 breaks up spans under 40 characters', () => {
      const balancedSentence = '静まり返った漆黒の闇の中で、不気味な遠吠えが地響きのように響き渡り、彼らの身体を固直させた。';
      const result = analyzer.analyze(balancedSentence);

      const sparseIssues = result.issues.filter((i) => i.type === 'sparse_punctuation');
      expect(sparseIssues.length).toBe(0);
    });
  });

  describe('Rhythm Health Score (0 - 100 points)', () => {
    it('gives 100 points for a well-balanced text', () => {
      const balancedText = `
夜空には満月が輝いていた。
静寂に包まれた街並みを、二人の影がゆっくりと進んでいく。
冷たい秋風が吹き抜けると、少女はコートのポケットに手を突っ込んだ。
      `.trim();

      const result = analyzer.analyze(balancedText);
      expect(result.score).toBe(100);
      expect(result.issues.length).toBe(0);
    });

    it('reduces score when issues exist', () => {
      const problematicText = `
彼が静かな夜の街を一人で歩いている時、遠くの街灯の下で人影が揺れたが、気にせず進むと急に冷たい風が吹き抜けて、コートの襟を立てながら夜空を見上げると満月が美しく輝いていた。
昔々、ある所に、おじいさんと、おばあさんが、住んでいました。
静まり返った漆黒の闇の中で不気味な遠吠えが地響きのように響き渡り彼らの身体を固直させた。
      `.trim();

      const result = analyzer.analyze(problematicText);
      expect(result.score).toBeLessThan(70);
      expect(result.issues.length).toBe(3);
    });
  });

  describe('IME Composition and Custom Options', () => {
    it('skips analysis when isComposing is true', () => {
      const text = '昔々、ある所に、おじいさんと、おばあさんが、住んでいました。';
      const result = analyzer.analyze(text, { isComposing: true });

      expect(result.score).toBe(100);
      expect(result.sentences.length).toBe(0);
      expect(result.issues.length).toBe(0);
    });

    it('respects custom threshold options', () => {
      const customAnalyzer = new PunctuationRhythmAnalyzer({
        maxSentenceLengthThreshold: 30,
        maxCommaCountThreshold: 2,
        sparseCommaLengthThreshold: 20,
      });

      const text = '風が静かに吹いて、木々が大きく揺れていた。'; // 20 chars, 1 comma
      const result = customAnalyzer.analyze(text);

      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('maps offsets correctly using SourceToDisplayMap', () => {
      const rawText = '｜昔々《むかしむかし》、ある所に、おじいさんと、おばあさんが、住んでいました。';
      const { map } = SourceToDisplayMap ? { map: new SourceToDisplayMap([{ rawFrom: 0, rawTo: 11, displayFrom: 0, displayTo: 2, delta: -9 }]) } : { map: undefined };

      const result = analyzer.analyze(rawText, { displayMap: map });
      expect(result.sentences[0].from).toBeDefined();
      expect(result.sentences[0].to).toBeDefined();
    });
  });
});
