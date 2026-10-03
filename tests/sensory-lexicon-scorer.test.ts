import { describe, it, expect } from 'vitest';
import {
  SensoryLexiconScorer,
  DEFAULT_SENSORY_LEXICON,
  type SensoryCategory,
} from '../src/core/editor/SensoryLexiconScorer.js';

describe('SensoryLexiconScorer', () => {
  it('detects sensory terms across all five sensory modalities (視覚・聴覚・嗅覚・触覚・味覚)', () => {
    const scorer = new SensoryLexiconScorer();
    const text = '眩しい光の中、足音が響く。焦げ臭い匂いと冷たい風が吹き、口内には甘い味が残っていた。';

    const result = scorer.analyze(text);

    expect(result.totalSensoryWords).toBeGreaterThanOrEqual(5);
    expect(result.counts.visual).toBeGreaterThan(0);
    expect(result.counts.auditory).toBeGreaterThan(0);
    expect(result.counts.olfactory).toBeGreaterThan(0);
    expect(result.counts.tactile).toBeGreaterThan(0);
    expect(result.counts.gustatory).toBeGreaterThan(0);

    // Matches contain correct offsets
    const visualMatch = result.matches.find((m) => m.category === 'visual');
    expect(visualMatch).toBeDefined();
    expect(visualMatch?.start).toBeLessThan(visualMatch!.end);
    expect(text.substring(visualMatch!.start, visualMatch!.end)).toBe(visualMatch!.term);
  });

  it('outputs correct radar chart scores between 0.0 and 1.0', () => {
    const scorer = new SensoryLexiconScorer();
    const text = '明るい景色を眺める。大きな足音が響き、静寂が破られる。';

    const result = scorer.analyze(text);
    const { radarScores } = result;

    const categories: SensoryCategory[] = ['visual', 'auditory', 'olfactory', 'tactile', 'gustatory'];
    for (const cat of categories) {
      expect(radarScores[cat]).toBeGreaterThanOrEqual(0.0);
      expect(radarScores[cat]).toBeLessThanOrEqual(1.0);
    }

    // Relative scoring mode check: sum of scores equals 1.0 (within rounding tolerances)
    const sum = Object.values(radarScores).reduce((acc, v) => acc + v, 0);
    expect(sum).toBeCloseTo(1.0, 1);
  });

  it('supports relative_max scoring mode for radar chart output', () => {
    const scorer = new SensoryLexiconScorer({ scoringMode: 'relative_max' });
    const text = '眩しい光と鮮やかな景色。さらに暗い影が差す。'; // 3 visual matches

    const result = scorer.analyze(text);
    expect(result.radarScores.visual).toBe(1.0); // max category scaled to 1.0
    expect(result.radarScores.auditory).toBe(0.0);
  });

  it('detects visual bias dominance and generates immersion advice messages', () => {
    const scorer = new SensoryLexiconScorer();
    // Visual heavy text (5 visual words: 眩しい, 光, 明るい, 影, 景色)
    const visualText = '眩しい光が差し込み、明るい室内に影が伸びる。美しい景色が広がっていた。';

    const result = scorer.analyze(visualText);

    expect(result.visualBias.isVisualDominant).toBe(true);
    expect(result.visualBias.visualRatio).toBeGreaterThanOrEqual(0.70);
    expect(result.visualBias.severity).toBe('warning');
    expect(result.visualBias.message).toContain('視覚偏重検知');
    expect(result.visualBias.advice).toContain('臨場感');
    expect(result.visualBias.suggestions.length).toBeGreaterThan(0);
    expect(result.visualBias.suggestions.some((s) => s.includes('音'))).toBe(true);
    expect(result.visualBias.suggestions.some((s) => s.includes('匂い'))).toBe(true);
    expect(result.visualBias.suggestions.some((s) => s.includes('身体感覚'))).toBe(true);
  });

  it('does not flag visual bias for balanced multi-sensory scenes', () => {
    const scorer = new SensoryLexiconScorer();
    const balancedText = '眩しい太陽の下、ザーザーと雨音が響く。冷たい滴が肌を打ち、潮の香りが漂う。甘い果実を口に含んだ。';

    const result = scorer.analyze(balancedText);

    expect(result.visualBias.isVisualDominant).toBe(false);
    expect(result.visualBias.severity).toBe('none');
    expect(result.visualBias.message).toContain('多様性に富んでいます');
  });

  it('supports adding custom lexicon terms dynamically', () => {
    const scorer = new SensoryLexiconScorer();
    scorer.addLexiconWord('gustatory', 'スパイシー');

    const text = 'この料理は実にスパイシーだ。';
    const result = scorer.analyze(text);

    expect(result.counts.gustatory).toBe(1);
    expect(result.matches.some((m) => m.term === 'スパイシー')).toBe(true);
  });

  it('supports custom lexicon via constructor options', () => {
    const scorer = new SensoryLexiconScorer({
      customLexicon: {
        auditory: ['重低音', 'クラクション'],
      },
    });

    const result = scorer.analyze('遠くでクラクションが鳴り、重低音が身体に響く。');
    expect(result.counts.auditory).toBeGreaterThanOrEqual(2);
  });

  it('allows overriding lexicon and inspecting lexicon dictionary', () => {
    const scorer = new SensoryLexiconScorer();
    const originalLexicon = scorer.getLexicon();

    expect(originalLexicon.visual).toContain('眩しい');

    scorer.setLexicon('visual', ['ネオン', '蛍光']);
    const updatedLexicon = scorer.getLexicon();

    expect(updatedLexicon.visual).toEqual(['ネオン', '蛍光']);
    expect(scorer.analyze('ネオンの眩しさ').counts.visual).toBe(1); // 'ネオン' matches
  });

  it('respects IME composition state (isComposing)', () => {
    const scorer = new SensoryLexiconScorer();
    const text = '眩しい光';

    const result = scorer.analyze(text, { isComposing: true });

    expect(result.totalSensoryWords).toBe(0);
    expect(result.matches).toHaveLength(0);
  });

  it('handles edge cases gracefully (empty string, text without sensory terms)', () => {
    const scorer = new SensoryLexiconScorer();

    const emptyResult = scorer.analyze('');
    expect(emptyResult.totalSensoryWords).toBe(0);
    expect(emptyResult.radarScores).toEqual({ visual: 0, auditory: 0, olfactory: 0, tactile: 0, gustatory: 0 });

    const noSensoryResult = scorer.analyze('彼は昨日、会社へ行って資料を作成した。');
    expect(noSensoryResult.totalSensoryWords).toBe(0);
    expect(noSensoryResult.visualBias.isVisualDominant).toBe(false);
  });
});
