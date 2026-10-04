import { describe, it, expect, beforeEach } from 'vitest';
import {
  QwertyTypoDetector,
  getQwertyDistance,
  QWERTY_COORDS,
} from '../src/core/editor/QwertyTypoDetector.js';
import { TypoCandidateSchema } from '@worldcraft/schema';

describe('QwertyTypoDetector (Step 2)', () => {
  let detector: QwertyTypoDetector;

  beforeEach(() => {
    detector = new QwertyTypoDetector();
  });

  describe('Section 1: 2D QWERTY Euclidean Physical Distance Matrix', () => {
    it('calculates distance 0 for identical characters', () => {
      expect(detector.calculatePhysicalDistance('k', 'k')).toBe(0);
      expect(detector.calculatePhysicalDistance('a', 'A')).toBe(0);
    });

    it('calculates horizontal and vertical adjacent key distance as 1.0', () => {
      // Horizontal neighbors
      expect(detector.calculatePhysicalDistance('k', 'j')).toBe(1.0);
      expect(detector.calculatePhysicalDistance('k', 'l')).toBe(1.0);
      expect(detector.calculatePhysicalDistance('q', 'w')).toBe(1.0);
      expect(detector.calculatePhysicalDistance('a', 's')).toBe(1.0);

      // Vertical neighbors
      expect(detector.calculatePhysicalDistance('k', 'i')).toBe(1.0);
      expect(detector.calculatePhysicalDistance('k', ',')).toBe(1.0);
      expect(detector.calculatePhysicalDistance('w', 's')).toBe(1.0);
      expect(detector.calculatePhysicalDistance('s', 'x')).toBe(1.0);
    });

    it('calculates diagonal adjacent key distance as ~1.414 (<= 1.42)', () => {
      const diag1 = detector.calculatePhysicalDistance('k', 'u'); // dx=1, dy=1
      const diag2 = detector.calculatePhysicalDistance('k', 'o'); // dx=1, dy=1
      const diag3 = detector.calculatePhysicalDistance('k', 'm'); // dx=1, dy=1
      const diag4 = detector.calculatePhysicalDistance('k', '.'); // dx=1, dy=1

      expect(diag1).toBeCloseTo(1.414, 3);
      expect(diag1).toBeLessThanOrEqual(1.42);
      expect(diag2).toBeCloseTo(1.414, 3);
      expect(diag2).toBeLessThanOrEqual(1.42);
      expect(diag3).toBeCloseTo(1.414, 3);
      expect(diag3).toBeLessThanOrEqual(1.42);
      expect(diag4).toBeCloseTo(1.414, 3);
      expect(diag4).toBeLessThanOrEqual(1.42);
    });

    it('identifies non-adjacent keys with distance > 1.42', () => {
      // 2 horizontal steps
      const dist2h = detector.calculatePhysicalDistance('k', 'h');
      expect(dist2h).toBe(2.0);
      expect(detector.isPhysicallyAdjacent('k', 'h')).toBe(false);

      // Far keys
      const distFar = detector.calculatePhysicalDistance('a', 'p');
      expect(distFar).toBeGreaterThan(1.42);
      expect(detector.isPhysicallyAdjacent('a', 'p')).toBe(false);
    });
  });

  describe('Section 2: Transposition Checker', () => {
    it('correctly detects single adjacent character transpositions', () => {
      expect(detector.checkTransposition('kudasia', 'kudasai')).toBe(true);
      expect(detector.checkTransposition('konntiniha', 'konnitiha')).toBe(true);
      expect(detector.checkTransposition('たせいつ', 'たいせつ')).toBe(true);
      expect(detector.checkTransposition('すまみせん', 'すみません')).toBe(true);
    });

    it('rejects identical, unequal length, or multi-difference strings', () => {
      expect(detector.checkTransposition('test', 'test')).toBe(false);
      expect(detector.checkTransposition('test', 'testing')).toBe(false);
      expect(detector.checkTransposition('abcd', 'badc')).toBe(false); // 2 swaps
    });
  });

  describe('Section 3: Canonical 20 Typo Patterns Verification (PASS 20/20)', () => {
    const twentyPatterns = [
      { input: 'くだしあ', expected: 'ください', isTrans: true },
      { input: 'こんちには', expected: 'こんにちは', isTrans: true },
      { input: 'ありがとございます', expected: 'ありがとうございます', isTrans: false },
      { input: 'すまみせん', expected: 'すみません', isTrans: true },
      { input: 'ｔお', expected: 'と', isTrans: false },
      { input: 'ｋあ', expected: 'か', isTrans: false },
      { input: 'ｓい', expected: 'し', isTrans: false },
      { input: 'おあよう', expected: 'おはよう', isTrans: false },
      { input: 'どうもあいがとう', expected: 'どうもありがとう', isTrans: false },
      { input: 'おつかれさまでｓ', expected: 'おつかれさまです', isTrans: false },
      { input: 'おもいまｓ', expected: 'おもいます', isTrans: false },
      { input: 'たせいつ', expected: 'たいせつ', isTrans: true },
      { input: 'ぜたい', expected: 'ぜったい', isTrans: false },
      { input: 'やぱり', expected: 'やっぱり', isTrans: false },
      { input: 'ちょと', expected: 'ちょっと', isTrans: false },
      { input: 'びくり', expected: 'びっくり', isTrans: false },
      { input: 'しかり', expected: 'しっかり', isTrans: false },
      { input: 'かがえる', expected: 'かんがえる', isTrans: false },
      { input: 'よろしおう', expected: 'よろしく', isTrans: true },
      { input: 'kudasia', expected: 'kudasai', isTrans: true },
    ];

    it.each(twentyPatterns)(
      'pattern $# : correctly detects and repairs "$input" -> "$expected"',
      ({ input, expected, isTrans }) => {
        const result = detector.checkWord(input);
        expect(result).not.toBeNull();
        expect(result!.candidate).toBe(expected);
        expect(result!.isTransposition).toBe(isTrans);
        expect(result!.distance).toBeLessThanOrEqual(1.42);

        // Schema validation contract
        expect(() => TypoCandidateSchema.parse(result!)).not.toThrow();
      }
    );
  });

  describe('Section 4: Sentence and Full Text Scanning', () => {
    it('detects multiple typos embedded in a full Japanese sentence', () => {
      const sentence = '皆さん、こんちには。原稿の締め切りをくだしあ。ありがとございます。';
      const typos = detector.detectTyposInText(sentence);

      expect(typos.length).toBe(3);
      const candidates = typos.map((t) => t.candidate);
      expect(candidates).toContain('こんにちは');
      expect(candidates).toContain('ください');
      expect(candidates).toContain('ありがとうございます');

      typos.forEach((t) => {
        expect(() => TypoCandidateSchema.parse(t)).not.toThrow();
      });
    });

    it('returns empty array when text has no typos', () => {
      const cleanSentence = 'こんにちは。原稿の締め切りをください。ありがとうございます。';
      const typos = detector.detectTyposInText(cleanSentence);
      expect(typos).toHaveLength(0);
    });
  });

  describe('Section 5: Typing Cadence Machine Integration & Auto-Repair Policy', () => {
    it('only auto-repairs high confidence (>= 0.95) typos during typing-burst', () => {
      const burstCandidate = detector.checkWord('ｔお', 'typing-burst');
      expect(burstCandidate).not.toBeNull();
      expect(burstCandidate!.cadenceStatus).toBe('typing-burst');
      expect(burstCandidate!.confidence).toBeGreaterThanOrEqual(0.95);
      expect(detector.shouldAutoRepair(burstCandidate!)).toBe(true);

      const subtleCandidate = {
        original: 'よろしおう',
        candidate: 'よろしく',
        distance: 1.0,
        isTransposition: true,
        layer: 'cadence' as const,
        cadenceStatus: 'typing-burst' as const,
        confidence: 0.92,
      };
      expect(detector.shouldAutoRepair(subtleCandidate)).toBe(false);
    });

    it('allows confidence >= 0.70 during short-pause', () => {
      const pauseCandidate = detector.checkWord('よろしおう', 'short-pause');
      expect(pauseCandidate).not.toBeNull();
      expect(detector.shouldAutoRepair(pauseCandidate!)).toBe(true);
    });

    it('maps CadenceState accurately', () => {
      expect(detector.mapCadenceState('typing_burst')).toBe('typing-burst');
      expect(detector.mapCadenceState('short_pause')).toBe('short-pause');
      expect(detector.mapCadenceState('deep_pause')).toBe('deep-pause');
      expect(detector.mapCadenceState('idle')).toBeUndefined();
    });
  });

  describe('Section 6: Custom Rule Registration', () => {
    it('allows registering and detecting custom user/project typos', () => {
      detector.registerCustomRule('ぷろたいらー', 'ぷろていらー', {
        distance: 1.0,
        confidence: 0.99,
      });

      const res = detector.checkWord('ぷろたいらー');
      expect(res).not.toBeNull();
      expect(res!.candidate).toBe('ぷろていらー');
      expect(res!.confidence).toBe(0.99);
    });
  });
});
