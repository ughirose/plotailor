import { describe, it, expect } from 'vitest';
import {
  SentenceEndingCadenceCalculator,
  ThreePaneWorkspace,
} from '../src/index.js';

describe('SentenceEndingCadenceCalculator', () => {
  const calculator = new SentenceEndingCadenceCalculator();

  describe('Aozora markup stripping', () => {
    it('strips Aozora ruby, bouten, and annotations correctly', () => {
      const raw = '彼は｜紫電の剣《しでんのけん》を振りかざした。《《予言の夜》》はすでに始まっていたのだ。〔ルビ下がり〕';
      const stripped = SentenceEndingCadenceCalculator.stripAozoraMarkup(raw);

      expect(stripped).not.toContain('《しでんのけん》');
      expect(stripped).not.toContain('｜');
      expect(stripped).not.toContain('《《');
      expect(stripped).not.toContain('〔ルビ下がり〕');
      expect(stripped).toContain('紫電の剣');
      expect(stripped).toContain('予言の夜');
    });
  });

  describe('Sentence clean & ending detection', () => {
    it('detects past-tense endings (た / だ) accurately regardless of trailing punctuation', () => {
      expect(SentenceEndingCadenceCalculator.detectEnding('彼は静かに走った。').isPastTense).toBe(true);
      expect(SentenceEndingCadenceCalculator.detectEnding('砦はすでに崩壊していたのだ！').isPastTense).toBe(true);
      expect(SentenceEndingCadenceCalculator.detectEnding('静かな夜だった……').isPastTense).toBe(true);
      expect(SentenceEndingCadenceCalculator.detectEnding('「そうであった」').isPastTense).toBe(true);

      expect(SentenceEndingCadenceCalculator.detectEnding('彼は走り出す。').isPastTense).toBe(false);
      expect(SentenceEndingCadenceCalculator.detectEnding('空を見上げる。').isPastTense).toBe(false);
      expect(SentenceEndingCadenceCalculator.detectEnding('静寂が広がる').isPastTense).toBe(false);
    });

    it('identifies dialogue sentences correctly', () => {
      const { isDialogue } = SentenceEndingCadenceCalculator.cleanSentence('「近衛軍の動きが妙だ」');
      expect(isDialogue).toBe(true);

      const narrative = SentenceEndingCadenceCalculator.cleanSentence('将軍は静かに頷いた。');
      expect(narrative.isDialogue).toBe(false);
    });
  });

  describe('Sentence splitting', () => {
    it('splits text into structured sentences with offset ranges', () => {
      const text = '第一文があった。第二文も続いた！第三文はどうだ？';
      const sentences = SentenceEndingCadenceCalculator.splitSentences(text);

      expect(sentences.length).toBe(3);
      expect(sentences[0].cleanText).toBe('第一文があった');
      expect(sentences[0].isPastTense).toBe(true);
      expect(sentences[1].cleanText).toBe('第二文も続いた');
      expect(sentences[1].isPastTense).toBe(true);
      expect(sentences[2].cleanText).toBe('第三文はどうだ');
      expect(sentences[2].isPastTense).toBe(true);
    });
  });

  describe('Monotony detection threshold (4 consecutive past-tense endings)', () => {
    it('does not trigger penalty or warning when consecutive count is less than 4', () => {
      const text = `
        彼はおもむろに立ち上がった。
        剣を抜いた。
        静かに息を整えた。
        そして、前方の敵を見据える。
      `;
      const result = calculator.analyze(text);

      expect(result.maxConsecutivePastTense).toBe(3);
      expect(result.runs.length).toBe(0);
      expect(result.monotonyPenalty).toBe(0);
      expect(result.cadenceScore).toBe(100);
      expect(result.advice[0].level).toBe('info');
    });

    it('detects exactly 4 consecutive past-tense sentence endings and calculates penalty score', () => {
      const text = `
        王都の夜空には二つの月が冷たく輝いていた。
        北の砦から帰還した将軍は、腰の剣に触れた。
        若き従卒のアーサーは恐れおののいた。
        予言の夜はすでに始まっていたのだ。
      `;
      const result = calculator.analyze(text);

      expect(result.totalSentences).toBe(4);
      expect(result.pastTenseCount).toBe(4);
      expect(result.maxConsecutivePastTense).toBe(4);
      expect(result.runs.length).toBe(1);
      expect(result.runs[0].length).toBe(4);
      expect(result.monotonyPenalty).toBe(25);
      expect(result.cadenceScore).toBe(75);
      expect(result.advice[0].level).toBe('warning');
      expect(result.advice[0].message).toContain('「た/だ」の文末表現が4連続しています');
    });

    it('detects 5 and 6+ consecutive past-tense sentence endings with escalating penalties', () => {
      const text5 = `
        第一の矢が放たれた。
        第二の矢も空を裂いた。
        兵士たちは次々と倒れた。
        城門はついに破られた。
        誰もが絶望に包まれたのだ。
      `;
      const result5 = calculator.analyze(text5);

      expect(result5.maxConsecutivePastTense).toBe(5);
      expect(result5.runs.length).toBe(1);
      expect(result5.monotonyPenalty).toBe(40);
      expect(result5.cadenceScore).toBe(60);

      const text6 = `
        第一の矢が放たれた。
        第二の矢も空を裂いた。
        兵士たちは次々と倒れた。
        城門はついに破られた。
        誰もが絶望に包まれたのだ。
        敵の軍勢が一斉に押し寄せた。
      `;
      const result6 = calculator.analyze(text6);

      expect(result6.maxConsecutivePastTense).toBe(6);
      expect(result6.monotonyPenalty).toBe(50);
      expect(result6.cadenceScore).toBe(50);
      expect(result6.advice[0].level).toBe('error');
    });
  });

  describe('Option ignoreDialogue', () => {
    it('ignores dialogue sentences when ignoreDialogue option is enabled', () => {
      const textWithDialogue = `
        将軍は静かに剣を抜いた。
        「近衛軍の動きが妙だ」
        「停戦の誓いを破る気か」
        従卒は恐れおののいた。
        予言の夜は始まっていたのだ。
      `;

      const resultDefault = calculator.analyze(textWithDialogue, { ignoreDialogue: false });
      const resultIgnore = calculator.analyze(textWithDialogue, { ignoreDialogue: true });

      expect(resultDefault.totalSentences).toBe(5);
      expect(resultIgnore.totalSentences).toBe(3);
      expect(resultIgnore.sentences.some((s) => s.isDialogue)).toBe(false);
    });
  });

  describe('Edge cases and empty text', () => {
    it('handles empty text and whitespace gracefully', () => {
      const result = calculator.analyze('   \n\n  ');

      expect(result.totalSentences).toBe(0);
      expect(result.pastTenseCount).toBe(0);
      expect(result.monotonyPenalty).toBe(0);
      expect(result.cadenceScore).toBe(100);
      expect(result.runs.length).toBe(0);
    });

    it('handles Aozora ruby text mixed with past tense endings', () => {
      const text = `
        ｜ヴァレリウス将軍《ばれりうすしょうぐん》は｜紫電の剣《しでんのけん》を握った。
        彼の心には迷いがあった。
        空には双子月が浮かんでいた。
        静寂が王都を包み込んだ。
      `;

      const result = calculator.analyze(text);
      expect(result.totalSentences).toBe(4);
      expect(result.maxConsecutivePastTense).toBe(4);
      expect(result.runs.length).toBe(1);
    });
  });

  describe('Integration with ThreePaneWorkspace', () => {
    it('automatically calculates cadence score on text changes in workspace', () => {
      const workspace = new ThreePaneWorkspace();
      const text = `
        彼は走った。
        倒れた。
        立ち上がった。
        叫んだ。
      `;

      workspace.onTextChange(text);
      const state = workspace.getState();

      expect(state.cadenceResult.maxConsecutivePastTense).toBe(4);
      expect(state.cadenceResult.monotonyPenalty).toBe(25);
      expect(state.cadenceResult.cadenceScore).toBe(75);
    });
  });
});
