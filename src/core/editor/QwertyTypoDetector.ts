import { TypoCandidateSchema, type TypoCandidate } from '@worldcraft/schema';
import type { CadenceState } from './TypingCadenceMachine.js';

export interface KeyCoord {
  x: number;
  y: number;
}

/**
 * Standard QWERTY 2D Euclidean Grid Coordinates.
 * Adjacent keys have distance 1.0, diagonal neighbors have sqrt(2) ≈ 1.414 <= 1.42.
 */
export const QWERTY_COORDS: Record<string, KeyCoord> = {
  // Row 0 (Number Row)
  '1': { x: 0, y: 0 }, '2': { x: 1, y: 0 }, '3': { x: 2, y: 0 }, '4': { x: 3, y: 0 },
  '5': { x: 4, y: 0 }, '6': { x: 5, y: 0 }, '7': { x: 6, y: 0 }, '8': { x: 7, y: 0 },
  '9': { x: 8, y: 0 }, '0': { x: 9, y: 0 }, '-': { x: 10, y: 0 }, '=': { x: 11, y: 0 },
  // Row 1 (Q Row)
  'q': { x: 0, y: 1 }, 'w': { x: 1, y: 1 }, 'e': { x: 2, y: 1 }, 'r': { x: 3, y: 1 },
  't': { x: 4, y: 1 }, 'y': { x: 5, y: 1 }, 'u': { x: 6, y: 1 }, 'i': { x: 7, y: 1 },
  'o': { x: 8, y: 1 }, 'p': { x: 9, y: 1 }, '@': { x: 10, y: 1 }, '[': { x: 11, y: 1 },
  // Row 2 (A Row)
  'a': { x: 0, y: 2 }, 's': { x: 1, y: 2 }, 'd': { x: 2, y: 2 }, 'f': { x: 3, y: 2 },
  'g': { x: 4, y: 2 }, 'h': { x: 5, y: 2 }, 'j': { x: 6, y: 2 }, 'k': { x: 7, y: 2 },
  'l': { x: 8, y: 2 }, ';': { x: 9, y: 2 }, ':': { x: 10, y: 2 }, ']': { x: 11, y: 2 },
  // Row 3 (Z Row)
  'z': { x: 0, y: 3 }, 'x': { x: 1, y: 3 }, 'c': { x: 2, y: 3 }, 'v': { x: 3, y: 3 },
  'b': { x: 4, y: 3 }, 'n': { x: 5, y: 3 }, 'm': { x: 6, y: 3 }, ',': { x: 7, y: 3 },
  '.': { x: 8, y: 3 }, '/': { x: 9, y: 3 }, '\\': { x: 10, y: 3 },
};

export type CadenceStatusKind = 'typing-burst' | 'short-pause' | 'deep-pause';

export function getQwertyDistance(charA: string, charB: string): number {
  const a = charA.toLowerCase();
  const b = charB.toLowerCase();
  if (a === b) return 0;

  const pA = QWERTY_COORDS[a];
  const pB = QWERTY_COORDS[b];
  if (!pA || !pB) return Infinity;

  const dx = pA.x - pB.x;
  const dy = pA.y - pB.y;
  return Math.round(Math.sqrt(dx * dx + dy * dy) * 1000) / 1000;
}

export interface TypoDetectorOptions {

  maxPhysicalDistance?: number; // default: 1.42
  confidenceThreshold?: number; // default: 0.50
}

interface BuiltinTypoPattern {
  original: string;
  candidate: string;
  distance: number;
  isTransposition: boolean;
  confidence: number;
  layer?: 'physical' | 'context' | 'cadence';
}

/**
 * 20+ Canonical Literary & Japanese Typing Typo Patterns.
 */
const CANONICAL_PATTERNS: BuiltinTypoPattern[] = [
  // 1. 「くだしあ」型ローマ字音韻反転 (kudasia -> kudasai, ia <-> ai)
  { original: 'くだしあ', candidate: 'ください', distance: 1.0, isTransposition: true, confidence: 0.98 },
  // 2. 「こんちには」型音節反転 (konntiniha -> konnitiha, tini <-> niti)
  { original: 'こんちには', candidate: 'こんにちは', distance: 1.0, isTransposition: true, confidence: 0.98 },
  // 3. 促音・長音・「う」脱落 (arigatoguzaimasu / arigatou)
  { original: 'ありがとございます', candidate: 'ありがとうございます', distance: 1.0, isTransposition: false, confidence: 0.96 },
  // 4. 音節反転 (sumamisen -> sumimasen)
  { original: 'すまみせん', candidate: 'すみません', distance: 1.0, isTransposition: true, confidence: 0.95 },
  // 5. 先走りキーミス: 「ｔお」 -> 「と」
  { original: 'ｔお', candidate: 'と', distance: 1.0, isTransposition: false, confidence: 0.99 },
  // 6. 先走りキーミス: 「ｋあ」 -> 「か」
  { original: 'ｋあ', candidate: 'か', distance: 1.0, isTransposition: false, confidence: 0.99 },
  // 7. 先走りキーミス: 「ｓい」 -> 「し」
  { original: 'ｓい', candidate: 'し', distance: 1.0, isTransposition: false, confidence: 0.99 },
  // 8. 「おあよう」 -> 「おはよう」 (h脱落 / 母音連続)
  { original: 'おあよう', candidate: 'おはよう', distance: 1.0, isTransposition: false, confidence: 0.94 },
  // 9. 「どうもあいがとう」 -> 「どうもありがとう」 (r脱落)
  { original: 'どうもあいがとう', candidate: 'どうもありがとう', distance: 1.0, isTransposition: false, confidence: 0.95 },
  // 10. IME確定もれ末尾「ｓ」: 「おつかれさまでｓ」 -> 「おつかれさまです」
  { original: 'おつかれさまでｓ', candidate: 'おつかれさまです', distance: 1.0, isTransposition: false, confidence: 0.98 },
  // 11. IME確定もれ末尾「ｓ」: 「おもいまｓ」 -> 「おもいます」
  { original: 'おもいまｓ', candidate: 'おもいます', distance: 1.0, isTransposition: false, confidence: 0.98 },
  // 12. 「たせいつ」 -> 「たいせつ」 (反転: せ・い <-> い・せ)
  { original: 'たせいつ', candidate: 'たいせつ', distance: 1.0, isTransposition: true, confidence: 0.95 },
  // 13. 促音「っ」抜け: 「ぜたい」 -> 「ぜったい」
  { original: 'ぜたい', candidate: 'ぜったい', distance: 1.0, isTransposition: false, confidence: 0.95 },
  // 14. 促音「っ」抜け: 「やぱり」 -> 「やっぱり」
  { original: 'やぱり', candidate: 'やっぱり', distance: 1.0, isTransposition: false, confidence: 0.95 },
  // 15. 促音「っ」抜け: 「ちょと」 -> 「ちょっと」
  { original: 'ちょと', candidate: 'ちょっと', distance: 1.0, isTransposition: false, confidence: 0.95 },
  // 16. 促音「っ」抜け: 「びくり」 -> 「びっくり」
  { original: 'びくり', candidate: 'びっくり', distance: 1.0, isTransposition: false, confidence: 0.95 },
  // 17. 促音「っ」抜け: 「しかり」 -> 「しっかり」
  { original: 'しかり', candidate: 'しっかり', distance: 1.0, isTransposition: false, confidence: 0.95 },
  // 18. 撥音「ん」抜け: 「かがえる」 -> 「かんがえる」
  { original: 'かがえる', candidate: 'かんがえる', distance: 1.0, isTransposition: false, confidence: 0.95 },
  // 19. 末尾反転: 「よろしおう」 -> 「よろしく」
  { original: 'よろしおう', candidate: 'よろしく', distance: 1.0, isTransposition: true, confidence: 0.92 },
  // 20. ローマ字直接打鍵反転: kudasia -> kudasai
  { original: 'kudasia', candidate: 'kudasai', distance: 1.0, isTransposition: true, confidence: 0.99 },
  // 21. ローマ字直接打鍵反転: konntiniha -> konnitiha
  { original: 'konntiniha', candidate: 'konnitiha', distance: 1.0, isTransposition: true, confidence: 0.99 },
  // 22. ローマ字拗音・縮約: siyou -> syou
  { original: 'siyou', candidate: 'syou', distance: 1.0, isTransposition: false, confidence: 0.92 },
  // 23. ローマ字拗音ミス: tyotto -> totto
  { original: 'tyotto', candidate: 'totto', distance: 1.0, isTransposition: false, confidence: 0.90 },
  // 24. キーボード隣接母音・子音シフトミス: わけがにいで -> わけがないで
  { original: 'わけがにいで', candidate: 'わけがないで', distance: 1.0, isTransposition: false, confidence: 0.96 },
  // 25. キーボード隣接母音・子音シフトミス: わけがにい -> わけがない
  { original: 'わけがにい', candidate: 'わけがない', distance: 1.0, isTransposition: false, confidence: 0.96 },
];

export class QwertyTypoDetector {
  private maxPhysicalDistance: number;
  private confidenceThreshold: number;
  private patternMap = new Map<string, BuiltinTypoPattern>();

  constructor(options: TypoDetectorOptions = {}) {
    this.maxPhysicalDistance = options.maxPhysicalDistance ?? 1.42;
    this.confidenceThreshold = options.confidenceThreshold ?? 0.50;

    for (const pattern of CANONICAL_PATTERNS) {
      this.patternMap.set(pattern.original, pattern);
    }
  }

  /**
   * Calculates the 2D Euclidean physical key distance D_phys on a standard QWERTY layout.
   * Returns 0 for identical characters, Infinity if key coordinates are not found.
   */
  public calculatePhysicalDistance(charA: string, charB: string): number {
    const a = charA.toLowerCase();
    const b = charB.toLowerCase();
    if (a === b) return 0;

    const pA = QWERTY_COORDS[a];
    const pB = QWERTY_COORDS[b];
    if (!pA || !pB) return Infinity;

    const dx = pA.x - pB.x;
    const dy = pA.y - pB.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // Round to 3 decimal places to avoid floating point precision issues (e.g. sqrt(2) ≈ 1.414)
    return Math.round(dist * 1000) / 1000;
  }

  /**
   * Checks if two keys are physically adjacent (horizontal, vertical, or diagonal: D_phys <= 1.42).
   */
  public isPhysicallyAdjacent(charA: string, charB: string): boolean {
    const dist = this.calculatePhysicalDistance(charA, charB);
    return dist > 0 && dist <= this.maxPhysicalDistance;
  }

  /**
   * Checks if candidate is an adjacent transposition or registered phonological transposition of original.
   */
  public checkTransposition(original: string, candidate: string): boolean {
    if (!original || !candidate || original === candidate) return false;

    // 1. Registered canonical patterns
    const pat = this.patternMap.get(original);
    if (pat && pat.candidate === candidate && pat.isTransposition) {
      return true;
    }

    // 2. Single character adjacent transposition (e.g. kudasia <-> kudasai, たせいつ <-> たいせつ)
    if (original.length === candidate.length) {
      let diffA = -1;
      let diffB = -1;

      for (let i = 0; i < original.length; i++) {
        if (original[i] !== candidate[i]) {
          if (diffA === -1) {
            diffA = i;
          } else if (diffB === -1) {
            diffB = i;
          } else {
            diffA = -2;
            break;
          }
        }
      }

      if (
        diffA >= 0 &&
        diffB === diffA + 1 &&
        original[diffA] === candidate[diffB] &&
        original[diffB] === candidate[diffA]
      ) {
        return true;
      }

      // 3. 2-character syllable block swap (e.g. AB CD <-> CD AB)
      for (let i = 0; i <= original.length - 4; i++) {
        const oBlock = original.slice(i, i + 4);
        const cBlock = candidate.slice(i, i + 4);
        if (
          oBlock.slice(0, 2) === cBlock.slice(2, 4) &&
          oBlock.slice(2, 4) === cBlock.slice(0, 2) &&
          original.slice(0, i) === candidate.slice(0, i) &&
          original.slice(i + 4) === candidate.slice(i + 4)
        ) {
          return true;
        }
      }
    }

    return false;
  }


  /**
   * Map CadenceState from TypingCadenceMachine to TypoCandidate cadenceStatus.
   */
  public mapCadenceState(state: CadenceState): CadenceStatusKind | undefined {
    switch (state) {
      case 'typing_burst':
        return 'typing-burst';
      case 'short_pause':
        return 'short-pause';
      case 'deep_pause':
        return 'deep-pause';
      default:
        return undefined;
    }
  }

  /**
   * Checks whether a candidate typo should be automatically repaired based on cadence.
   * - Typing Burst: Only confidence >= 0.95 (silent instant auto-repair)
   * - Short Pause: Confidence >= 0.70 (subtle underline mark)
   * - Deep Pause: Confidence >= 0.50 (full inspector presentation)
   */
  public shouldAutoRepair(candidate: TypoCandidate, cadenceStatus?: CadenceStatusKind): boolean {
    const status = cadenceStatus ?? candidate.cadenceStatus;
    if (status === 'typing-burst') {
      return candidate.confidence >= 0.95;
    }
    if (status === 'short-pause') {
      return candidate.confidence >= 0.70;
    }
    return candidate.confidence >= this.confidenceThreshold;
  }

  /**
   * Checks an individual word / token against physical slips, transposition, and canonical dictionary.
   */
  public checkWord(word: string, cadenceStatus?: CadenceStatusKind): TypoCandidate | null {
    if (!word || word.trim().length === 0) return null;

    // 1. Direct Canonical Pattern Match
    const pattern = this.patternMap.get(word);
    if (pattern) {
      const candidateObj: TypoCandidate = {
        original: pattern.original,
        candidate: pattern.candidate,
        distance: Math.min(pattern.distance, this.maxPhysicalDistance),
        isTransposition: pattern.isTransposition,
        layer: cadenceStatus ? 'cadence' : (pattern.layer ?? 'physical'),
        cadenceStatus,
        confidence: pattern.confidence,
      };
      return TypoCandidateSchema.parse(candidateObj);
    }

    // 2. Dynamic QWERTY Physical Slip Detection (for same length words against canonical dictionary candidates)
    for (const pat of this.patternMap.values()) {
      if (word.length === pat.candidate.length && word !== pat.candidate) {
        let diffIndex = -1;
        let diffCount = 0;
        for (let i = 0; i < word.length; i++) {
          if (word[i] !== pat.candidate[i]) {
            diffCount++;
            diffIndex = i;
          }
        }

        if (diffCount === 1 && diffIndex !== -1) {
          const charA = word[diffIndex];
          const charB = pat.candidate[diffIndex];
          const dist = this.calculatePhysicalDistance(charA, charB);
          if (dist > 0 && dist <= this.maxPhysicalDistance) {
            const confidence = Math.max(0.6, 1.0 - dist * 0.3);
            const candidateObj: TypoCandidate = {
              original: word,
              candidate: pat.candidate,
              distance: Math.min(dist, this.maxPhysicalDistance),
              isTransposition: false,
              layer: cadenceStatus ? 'cadence' : 'physical',
              cadenceStatus,
              confidence,
            };
            return TypoCandidateSchema.parse(candidateObj);
          }
        }
      }
    }

    // 3. Dynamic Adjacent Transposition against canonical candidate words
    for (const pat of this.patternMap.values()) {
      if (this.checkTransposition(word, pat.candidate)) {
        const candidateObj: TypoCandidate = {
          original: word,
          candidate: pat.candidate,
          distance: 1.0,
          isTransposition: true,
          layer: cadenceStatus ? 'cadence' : 'physical',
          cadenceStatus,
          confidence: 0.90,
        };
        return TypoCandidateSchema.parse(candidateObj);
      }
    }

    return null;
  }

  /**
   * Scans a full text or sentence and returns detected typo candidates.
   */
  public detectTyposInText(text: string, cadenceStatus?: CadenceStatusKind): TypoCandidate[] {
    const results: TypoCandidate[] = [];
    if (!text) return results;

    // Check substring matches for all registered canonical patterns
    for (const pattern of this.patternMap.values()) {
      if (text.includes(pattern.original)) {
        const candidateObj: TypoCandidate = {
          original: pattern.original,
          candidate: pattern.candidate,
          distance: Math.min(pattern.distance, this.maxPhysicalDistance),
          isTransposition: pattern.isTransposition,
          layer: cadenceStatus ? 'cadence' : (pattern.layer ?? 'physical'),
          cadenceStatus,
          confidence: pattern.confidence,
        };
        const parsed = TypoCandidateSchema.parse(candidateObj);

        // Cadence-linked noise suppression:
        // - typing-burst: only high-confidence (>= 0.95) to prevent typing distraction
        // - short-pause: confidence >= 0.70
        // - deep-pause / none: confidence >= threshold (0.50)
        if (cadenceStatus === 'typing-burst') {
          if (parsed.confidence >= 0.95) results.push(parsed);
        } else if (cadenceStatus === 'short-pause') {
          if (parsed.confidence >= 0.70) results.push(parsed);
        } else {
          if (parsed.confidence >= this.confidenceThreshold) results.push(parsed);
        }
      }
    }

    return results;
  }

  /**
   * Dynamically register or override custom typo rules.
   */
  public registerCustomRule(
    original: string,
    candidate: string,
    options?: {
      distance?: number;
      isTransposition?: boolean;
      confidence?: number;
      layer?: 'physical' | 'context' | 'cadence';
    }
  ): void {
    const isTransposition = options?.isTransposition ?? this.checkTransposition(original, candidate);
    const distance = options?.distance ?? 1.0;
    const confidence = options?.confidence ?? 0.90;
    const layer = options?.layer ?? 'physical';

    this.patternMap.set(original, {
      original,
      candidate,
      distance: Math.min(distance, this.maxPhysicalDistance),
      isTransposition,
      confidence,
      layer,
    });
  }

  /**
   * Detects 3+ consecutive identical character phonological anomalies (e.g. 「受け継がれれれし」「だだだだ」).
   * Excludes literary ellipses, symbols, and dialogue screams.
   */
  public detectPhonologicalRepetitions(text: string): Array<{
    original: string;
    from: number;
    to: number;
    char: string;
    count: number;
  }> {
    const results: Array<{
      original: string;
      from: number;
      to: number;
      char: string;
      count: number;
    }> = [];
    if (!text) return results;

    const regex = /([\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\p{Letter}])\1{2,}/gu;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const matchText = match[0];
      const from = match.index;
      const to = from + matchText.length;
      results.push({
        original: matchText,
        from,
        to,
        char: match[1],
        count: matchText.length,
      });
    }
    return results;
  }
}
