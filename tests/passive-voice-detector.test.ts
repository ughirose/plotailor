import { describe, it, expect } from 'vitest';
import { PassiveVoiceDetector } from '../src/core/editor/PassiveVoiceDetector.js';
import { AozoraParser } from '../src/core/editor/AozoraParser.js';

describe('PassiveVoiceDetector Unit Tests', () => {
  describe('Morphological Pattern Detection (Passive & Causative-Passive)', () => {
    it('detects standard passive verbs (〜れる, 〜られる, 〜される) and extracts verb phrase only', () => {
      const detector = new PassiveVoiceDetector({ threshold: 2 });
      const text = '扉が開けられた。宝箱が強盗によって壊された。秘密の書類が奪われた。';

      const diagnostics = detector.detect(text);
      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].paragraphIndex).toBe(0);
      expect(diagnostics[0].passiveCount).toBe(3);
      expect(diagnostics[0].message).toContain('受動態');

      // Verify captured text is strictly the verb phrase
      expect(diagnostics[0].matches[0].text).toBe('開けられた');
      expect(diagnostics[0].matches[1].text).toBe('壊された');
      expect(diagnostics[0].matches[2].text).toBe('奪われた');
    });

    it('detects causative-passive verbs (〜させられる, 〜せられる)', () => {
      const detector = new PassiveVoiceDetector({ threshold: 1 });
      const text = '彼は理不尽に走らさせられた。毎日残業させられる。';

      const diagnostics = detector.detect(text);
      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].matches.some((m) => m.type === 'causative_passive')).toBe(true);

      const matchCausative = diagnostics[0].matches.find((m) => m.type === 'causative_passive');
      expect(matchCausative?.text).toBe('走らさせられた');
      expect(matchCausative?.activeSuggestion).toBe('走らさせた');
    });

    it('ignores non-passive words containing れ (これ, それ, かれ, だれ, けれども)', () => {
      const detector = new PassiveVoiceDetector({ threshold: 1 });
      const text = 'これやそれ、かれやだれかの意見は尊重されるけれども。';

      const diagnostics = detector.detect(text);
      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].matches.length).toBe(1);
      expect(diagnostics[0].matches[0].text).toBe('尊重される');
    });

    it('handles multiple paragraphs independently', () => {
      const detector = new PassiveVoiceDetector({ threshold: 2 });
      const text = `第一段落：事件が起こされた。書類が破棄された。
第二段落：刑事は自ら調査を開始した。
第三段落：容疑者が逮捕された。不当に拘束された。全容が解明された。`;

      const diagnostics = detector.detect(text);
      expect(diagnostics.length).toBe(2);

      expect(diagnostics[0].paragraphIndex).toBe(0);
      expect(diagnostics[0].passiveCount).toBe(2);

      expect(diagnostics[1].paragraphIndex).toBe(2);
      expect(diagnostics[1].passiveCount).toBe(3);
    });
  });

  describe('Consecutive Passive Sentence Scoring & Warning Alerting', () => {
    it('triggers consecutive_sentences warning alert when 2 consecutive sentences contain passive voice', () => {
      const detector = new PassiveVoiceDetector({ threshold: 5, consecutiveThreshold: 2 });
      const text = '王城の扉が開けられた。宝箱が強盗に壊された。しかし彼は落ち着いて立ち上がった。';

      const diagnostics = detector.detect(text);
      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].triggerReason).toBe('consecutive_sentences');
      expect(diagnostics[0].consecutiveSentenceCount).toBe(2);
      expect(diagnostics[0].message).toContain('受動態連続検出');
    });

    it('calculates passive score correctly', () => {
      const detector = new PassiveVoiceDetector();
      const text = '扉が開けられた。宝箱が壊された。彼は無理やり動かさせられた。';

      const scoreInfo = detector.calculatePassiveScore(text);
      expect(scoreInfo.totalCount).toBe(3);
      expect(scoreInfo.causativePassiveCount).toBe(1);
      expect(scoreInfo.consecutiveCount).toBe(3);
      expect(scoreInfo.score).toBeGreaterThan(0);
    });
  });

  describe('Active Voice Rewrite Proposal Generator', () => {
    const detector = new PassiveVoiceDetector();

    it('converts サ変 passive and causative passive verbs to active voice', () => {
      expect(detector.convertPassiveToActive('破壊される')).toBe('破壊する');
      expect(detector.convertPassiveToActive('実行された')).toBe('実行した');
      expect(detector.convertPassiveToActive('選択せられる')).toBe('選択する');
      expect(detector.convertPassiveToActive('働かさせられる')).toBe('働かさせる');
      expect(detector.convertPassiveToActive('走らさせられた')).toBe('走らさせた');
    });

    it('converts 五段 and 一段 passive verbs across columns', () => {
      expect(detector.convertPassiveToActive('言われる')).toBe('言う');
      expect(detector.convertPassiveToActive('書かれた')).toBe('書いた');
      expect(detector.convertPassiveToActive('殺された')).toBe('殺す');
      expect(detector.convertPassiveToActive('打たれた')).toBe('打った');
      expect(detector.convertPassiveToActive('読まれる')).toBe('読む');
      expect(detector.convertPassiveToActive('褒められた')).toBe('褒めた');
      expect(detector.convertPassiveToActive('見られている')).toBe('見ている');
    });
  });

  describe('IME Composition Guard & Aozora Offset Remapping', () => {
    it('bypasses detection when isComposing is true', () => {
      const detector = new PassiveVoiceDetector({ threshold: 1 });
      const text = '扉が開けられた。';

      const diagnostics = detector.detect(text, { isComposing: true });
      expect(diagnostics.length).toBe(0);
    });

    it('remaps diagnostic offsets using Aozora displayMap', () => {
      const detector = new PassiveVoiceDetector({ threshold: 1 });
      const rawText = '｜王城《おうじょう》の扉が開けられた。';
      const { map } = AozoraParser.parse(rawText);

      const diagnostics = detector.detect(rawText, { displayMap: map });
      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].from).toBeLessThan(diagnostics[0].to);
    });
  });
});
