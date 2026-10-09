import { describe, it, expect } from 'vitest';
import { NarrativeLinterEngine } from '../src/core/editor/NarrativeLinterEngine.js';
import { SAMPLE_NOVEL_CHAPTERS } from '../src/data/SampleNovelData.js';
import { QwertyTypoDetector } from '../src/core/editor/QwertyTypoDetector.js';

describe('Phase 9: Literary IDE Quality & False Positive Zero Assertions (AGENTS.md Section 5)', () => {
  const engine = new NarrativeLinterEngine();
  const typoDetector = new QwertyTypoDetector();

  describe('8. Zero False Positives on Official Sample Novel Chapters', () => {
    for (const ch of SAMPLE_NOVEL_CHAPTERS) {
      it(`Chapter ${ch.chapterNumber} (${ch.title}) has 0 particle 'の' repetition false positives`, () => {
        const result = engine.analyzeDocument(ch.content);
        const particleNoWarnings = result.syntacticItems.filter(
          (item) => item.ruleType === 'particle-repetition' && item.message.includes('「の」')
        );
        expect(particleNoWarnings).toHaveLength(0);
      });

      it(`Chapter ${ch.chapterNumber} (${ch.title}) has 0 subject-predicate mismatch false positives`, () => {
        const result = engine.analyzeDocument(ch.content);
        const spMismatchWarnings = result.syntacticItems.filter(
          (item) => item.ruleType === 'subject-predicate-mismatch'
        );
        expect(spMismatchWarnings).toHaveLength(0);
      });
    }

    it('specifically validates Third Chapter opening: "忘却の砦――かつて神話の時代に<<<<古の鍵>>>>が封印されたと伝えられる絶壁の城塞である。" has 0 warnings', () => {
      const text = '忘却の砦――かつて神話の時代に古の鍵が封じられたとされる、絶壁の城塞である。';
      const result = engine.analyzeDocument(text);
      const falsePositives = result.syntacticItems.filter(
        (item) =>
          (item.ruleType === 'particle-repetition' && item.message.includes('「の」')) ||
          item.ruleType === 'subject-predicate-mismatch'
      );
      expect(falsePositives).toHaveLength(0);
    });
  });

  describe('6 & 7. General Phonological Anomaly & Keyboard Adjacency Typo Detection', () => {
    it('detects 3+ consecutive character repetition anomaly (e.g., 「受け継がれれれし」「だだだだ」)', () => {
      const text1 = '千年の古より受け継がれれれし盟約。';
      const res1 = engine.analyzeDocument(text1);
      const repeat1 = res1.syntacticItems.filter((i) => i.ruleType === 'char-repetition');
      expect(repeat1.length).toBeGreaterThan(0);
      expect(repeat1[0].previewText).toBe('れれれ');

      const text2 = 'だだだだと足音が響く。';
      const res2 = engine.analyzeDocument(text2);
      const repeat2 = res2.syntacticItems.filter((i) => i.ruleType === 'char-repetition');
      expect(repeat2.length).toBeGreaterThan(0);
      expect(repeat2[0].previewText).toBe('だだだだ');

      // Standalone detector test
      const standalone = typoDetector.detectPhonologicalRepetitions('受け継がれれれし');
      expect(standalone.length).toBe(1);
      expect(standalone[0].original).toBe('れれれ');
      expect(standalone[0].count).toBe(3);
    });

    it('exempts dialogue screams/exclamations from character repetition warnings', () => {
      const scream = '「あああ！　敵襲だ！」';
      const res = engine.analyzeDocument(scream);
      const repeat = res.syntacticItems.filter((i) => i.ruleType === 'char-repetition');
      expect(repeat).toHaveLength(0);
    });

    it('comprehensively detects keyboard adjacent slip: 「わけがにいで」 -> 「わけがないで」', () => {
      const text = 'そんなわけがにいで我々の防衛陣形は完璧です。';
      const res = engine.analyzeDocument(text);
      const typoItems = res.syntacticItems.filter((i) => i.ruleType === 'qwerty-typo');
      expect(typoItems.length).toBeGreaterThan(0);
      expect(typoItems[0].replacementText).toBe('わけがないで');
    });

    it('detects keyboard adjacent slip: 「わけがにい」 -> 「わけがない」', () => {
      const candidate = typoDetector.checkWord('わけがにい');
      expect(candidate).not.toBeNull();
      expect(candidate?.candidate).toBe('わけがない');
    });
  });
});
