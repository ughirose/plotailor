/**
 * PassiveVoiceDetector - Morphological Passive & Causative-Passive Voice Overuse Detector.
 *
 * Part of Plotailor Literature IDE Editor Module.
 * Detects:
 * 1. Passive voice (受動態: 「〜れる」「〜られる」「〜される」)
 * 2. Causative passive voice (使役受動態: 「〜させられる」「〜せられる」「〜らさせられる」)
 * 3. Consecutive passive sentence chains (2+ consecutive sentences using passive voice)
 * 4. Subject obfuscation and translation-style passive expressions.
 *
 * Provides active voice rewrite suggestions, consecutive occurrence scoring, and IME guard.
 */

import type { SourceToDisplayMap } from './AozoraParser.js';

export type PassiveType = 'passive' | 'causative_passive';

export interface PassiveMatch {
  from: number;
  to: number;
  text: string;
  type: PassiveType;
  activeSuggestion: string;
  paragraphIndex: number;
  sentenceIndex: number;
}

export interface PassiveDiagnostic {
  from: number;
  to: number;
  severity: 'warning' | 'info' | 'error';
  message: string;
  triggerReason: 'paragraph_threshold' | 'consecutive_sentences' | 'causative_passive';
  paragraphIndex: number;
  sentenceIndex?: number;
  passiveCount: number;
  consecutiveSentenceCount: number;
  score: number;
  matches: PassiveMatch[];
  suggestedRewrites: string[];
}

export interface PassiveDetectorOptions {
  /** Threshold for number of passive occurrences per paragraph to trigger warning (default: 2) */
  threshold?: number;
  /** Threshold for consecutive sentences containing passive voice (default: 2) */
  consecutiveThreshold?: number;
  /** Skip checking during IME composition to prevent input jitter */
  isComposing?: boolean;
  /** Display map for Aozora markup offset remapping */
  displayMap?: SourceToDisplayMap;
}

const GODAN_SA_STEMS = new Set(['殺', '壊', '話', '押', '残', '出', '起', '流', '逃', '探', '指', '生み出']);
const GODAN_RA_STEMS = new Set(['作', '取', '叱', '送', '切', '売', '語', '守', '折', '知']);

const INTRANSITIVE_NON_PASSIVE_STEMS = new Set([
  'はなれ', '離れ', 'つかれ', '疲れ', 'たおれ', '倒れ', 'ぬれ', '濡れ',
  'あらわれ', '現れ', 'こわれ', '壊れ', 'みだれ', '乱れ', 'おとずれ', '訪れ',
  'なれ', '慣れ', 'うもれ', '埋もれ', 'あふれ', '溢れ', 'こぼれ', '零れ',
  'まぎれ', '紛れ', 'ちぎれ', '千切れ', 'きれ', '切れ', 'はれ', '晴れ',
  'つれ', '連れ', 'わすれ', '忘れ', 'おくれ', '遅れ', 'もれ', '漏れ',
  'ゆれ', '揺れ', 'おそれ', '恐れ', '垂れ', 'たれ', '焦がれ', '戯れ'
]);

export class PassiveVoiceDetector {
  private threshold: number;
  private consecutiveThreshold: number;

  constructor(options?: { threshold?: number; consecutiveThreshold?: number }) {
    this.threshold = options?.threshold ?? 2;
    this.consecutiveThreshold = options?.consecutiveThreshold ?? 2;
  }

  public setThreshold(threshold: number): void {
    this.threshold = threshold;
  }

  public getThreshold(): number {
    return this.threshold;
  }

  public setConsecutiveThreshold(consecutiveThreshold: number): void {
    this.consecutiveThreshold = consecutiveThreshold;
  }

  public getConsecutiveThreshold(): number {
    return this.consecutiveThreshold;
  }

  /**
   * Rule-based active voice converter. Transforms Japanese passive / causative-passive phrases into active voice.
   */
  public convertPassiveToActive(phrase: string): string {
    if (!phrase) return phrase;

    // 1. 使役受動態 (Causative Passive) handling: 〜させられた, 〜させられる, 〜せられた, 〜せられる, 〜らさせられた
    if (phrase.endsWith('らさせられた')) {
      return phrase.slice(0, -5) + 'させた';
    }
    if (phrase.endsWith('らさせられる')) {
      return phrase.slice(0, -5) + 'させる';
    }
    if (phrase.endsWith('させられた')) {
      return phrase.slice(0, -5) + 'させた';
    }
    if (phrase.endsWith('させられる')) {
      return phrase.slice(0, -5) + 'させる';
    }
    if (phrase.endsWith('せられた')) {
      const stem = phrase.slice(0, -4);
      if (stem.length >= 2) return stem + 'した';
      return stem + 'せた';
    }
    if (phrase.endsWith('せられる')) {
      const stem = phrase.slice(0, -4);
      if (stem.length >= 2) return stem + 'する';
      return stem + 'せる';
    }

    // 2. サ変 / 五段サ行 handling
    if (phrase.endsWith('されていた')) {
      return phrase.slice(0, -5) + 'していた';
    }
    if (phrase.endsWith('されている')) {
      return phrase.slice(0, -5) + 'している';
    }
    if (phrase.endsWith('された')) {
      const stem = phrase.slice(0, -3);
      if (GODAN_SA_STEMS.has(stem) || stem.endsWith('さ')) {
        return stem.replace(/さ$/, '') + 'す';
      }
      return stem + 'した';
    }
    if (phrase.endsWith('される')) {
      const stem = phrase.slice(0, -3);
      if (GODAN_SA_STEMS.has(stem) || stem.endsWith('さ')) {
        return stem.replace(/さ$/, '') + 'す';
      }
      return stem + 'する';
    }

    // 3. カ変: 〜来られる / 〜こられる
    if (phrase.endsWith('来られた')) return phrase.slice(0, -4) + '来た';
    if (phrase.endsWith('来られる')) return phrase.slice(0, -4) + '来る';
    if (phrase.endsWith('こられた')) return phrase.slice(0, -4) + 'きた';
    if (phrase.endsWith('こられる')) return phrase.slice(0, -4) + 'くる';

    // 4. Progressive / aspect endings (〜れている / 〜れていた / 〜られている / 〜られていた)
    if (phrase.endsWith('れている') || phrase.endsWith('られている')) {
      const isRareteiru = phrase.endsWith('られている');
      const stem = isRareteiru ? phrase.slice(0, -4) : phrase.slice(0, -3);

      if (isRareteiru) {
        const activeStem = this.convertPassiveToActive(stem + 'られる');
        if (activeStem.endsWith('る')) {
          return activeStem.slice(0, -1) + 'ている';
        }
      }

      const activeBase = this.convertPassiveToActive(stem + 'る');
      if (activeBase.endsWith('う') || activeBase.endsWith('つ')) {
        return activeBase.slice(0, -1) + 'っている';
      }
      if (activeBase.endsWith('く')) return activeBase.slice(0, -1) + 'いている';
      if (activeBase.endsWith('ぐ')) return activeBase.slice(0, -1) + 'いでいる';
      if (activeBase.endsWith('す')) return activeBase.slice(0, -1) + 'している';
      if (activeBase.endsWith('ぬ') || activeBase.endsWith('ぶ') || activeBase.endsWith('む')) {
        return activeBase.slice(0, -1) + 'んでいる';
      }
      if (activeBase.endsWith('る')) {
        return activeBase.slice(0, -1) + 'ている';
      }
      return activeBase + 'ている';
    }

    // 5. Past tense endings (〜れた / 〜られた)
    if (phrase.endsWith('れた') || phrase.endsWith('られた')) {
      return this.convertPastPassiveToActive(phrase);
    }

    // 6. Present / Dictionary forms ending in れる or られる
    if (phrase.endsWith('われる')) return phrase.slice(0, -3) + 'う';
    if (phrase.endsWith('かれる')) return phrase.slice(0, -3) + 'く';
    if (phrase.endsWith('がれる')) return phrase.slice(0, -3) + 'ぐ';
    if (phrase.endsWith('たれる')) return phrase.slice(0, -3) + 'つ';
    if (phrase.endsWith('なれる')) return phrase.slice(0, -3) + 'ぬ';
    if (phrase.endsWith('ばれる')) return phrase.slice(0, -3) + 'ぶ';
    if (phrase.endsWith('まれる')) return phrase.slice(0, -3) + 'む';
    if (phrase.endsWith('らされた')) return phrase.slice(0, -4) + 'らした';

    if (phrase.endsWith('れられる')) return phrase.slice(0, -4) + 'れる';
    if (phrase.endsWith('められる')) return phrase.slice(0, -4) + 'める';
    if (phrase.endsWith('けられる')) return phrase.slice(0, -4) + 'ける';
    if (phrase.endsWith('げられる')) return phrase.slice(0, -4) + 'げる';
    if (phrase.endsWith('せられる')) return phrase.slice(0, -4) + 'せる';
    if (phrase.endsWith('てられる')) return phrase.slice(0, -4) + 'てる';
    if (phrase.endsWith('ねられる')) return phrase.slice(0, -4) + 'ねる';
    if (phrase.endsWith('べられる')) return phrase.slice(0, -4) + 'べる';
    if (phrase.endsWith('えられる')) return phrase.slice(0, -4) + 'える';
    if (phrase.endsWith('じられる')) return phrase.slice(0, -4) + 'じる';
    if (phrase.endsWith('みられる')) return phrase.slice(0, -4) + 'みる';
    if (phrase.endsWith('きられる')) return phrase.slice(0, -4) + 'きる';
    if (phrase.endsWith('ちられる')) return phrase.slice(0, -4) + 'ちる';

    if (phrase.endsWith('られる')) {
      const stem = phrase.slice(0, -3);
      if (GODAN_RA_STEMS.has(stem)) return stem + 'る';
      if (
        stem.endsWith('ら') ||
        stem.endsWith('か') ||
        stem.endsWith('さ') ||
        stem.endsWith('た') ||
        stem.endsWith('ま') ||
        stem.endsWith('ば') ||
        stem.endsWith('が')
      ) {
        if (stem.endsWith('ら')) return stem.slice(0, -1) + 'る';
        if (stem.endsWith('か')) return stem.slice(0, -1) + 'く';
        if (stem.endsWith('さ')) return stem.slice(0, -1) + 'す';
        if (stem.endsWith('た')) return stem.slice(0, -1) + 'つ';
        if (stem.endsWith('ま')) return stem.slice(0, -1) + 'む';
        if (stem.endsWith('ば')) return stem.slice(0, -1) + 'ぶ';
        if (stem.endsWith('が')) return stem.slice(0, -1) + 'ぐ';
      }
      return stem + 'る';
    }

    if (phrase.endsWith('れる')) {
      return phrase.slice(0, -2) + 'る';
    }

    return phrase;
  }

  private convertPastPassiveToActive(phrase: string): string {
    if (phrase.endsWith('わされた')) return phrase.slice(0, -4) + 'わした';
    if (phrase.endsWith('われた')) return phrase.slice(0, -3) + 'った';
    if (phrase.endsWith('かれた')) return phrase.slice(0, -3) + 'いた';
    if (phrase.endsWith('がれた')) return phrase.slice(0, -3) + 'いだ';
    if (phrase.endsWith('たれた')) return phrase.slice(0, -3) + 'った';
    if (phrase.endsWith('なれた')) return phrase.slice(0, -3) + 'んだ';
    if (phrase.endsWith('ばれた')) return phrase.slice(0, -3) + 'んだ';
    if (phrase.endsWith('まれた')) return phrase.slice(0, -3) + 'んだ';

    if (phrase.endsWith('れられた')) return phrase.slice(0, -4) + 'れた';
    if (phrase.endsWith('められた')) return phrase.slice(0, -4) + 'めた';
    if (phrase.endsWith('けられた')) return phrase.slice(0, -4) + 'けた';
    if (phrase.endsWith('げられた')) return phrase.slice(0, -4) + 'げた';
    if (phrase.endsWith('せられた')) return phrase.slice(0, -4) + 'せた';
    if (phrase.endsWith('てられた')) return phrase.slice(0, -4) + 'てた';
    if (phrase.endsWith('ねられた')) return phrase.slice(0, -4) + 'ねた';
    if (phrase.endsWith('べられた')) return phrase.slice(0, -4) + 'べた';
    if (phrase.endsWith('えられた')) return phrase.slice(0, -4) + 'えた';
    if (phrase.endsWith('じられた')) return phrase.slice(0, -4) + 'じた';
    if (phrase.endsWith('みられた')) return phrase.slice(0, -4) + 'みた';
    if (phrase.endsWith('きられた')) return phrase.slice(0, -4) + 'きた';
    if (phrase.endsWith('ちられた')) return phrase.slice(0, -4) + 'ちた';

    if (phrase.endsWith('られた')) {
      const stem = phrase.slice(0, -3);
      if (GODAN_RA_STEMS.has(stem)) {
        return stem + 'った';
      }
      return stem + 'た';
    }

    if (phrase.endsWith('れた')) {
      const stemReta = phrase.slice(0, -2);
      if (
        stemReta.endsWith('わ') ||
        stemReta.endsWith('か') ||
        stemReta.endsWith('が') ||
        stemReta.endsWith('さ') ||
        stemReta.endsWith('た') ||
        stemReta.endsWith('な') ||
        stemReta.endsWith('ば') ||
        stemReta.endsWith('ま') ||
        stemReta.endsWith('ら')
      ) {
        if (stemReta.endsWith('わ') || stemReta.endsWith('た') || stemReta.endsWith('ら'))
          return stemReta.slice(0, -1) + 'った';
        if (stemReta.endsWith('か')) return stemReta.slice(0, -1) + 'いた';
        if (stemReta.endsWith('が')) return stemReta.slice(0, -1) + 'いだ';
        if (stemReta.endsWith('さ')) return stemReta.slice(0, -1) + 'した';
        if (
          stemReta.endsWith('な') ||
          stemReta.endsWith('ば') ||
          stemReta.endsWith('ま')
        )
          return stemReta.slice(0, -1) + 'んだ';
      }
      return phrase.slice(0, -2) + 'た';
    }

    return phrase;
  }

  /**
   * Calculates overall passive score and statistics for text.
   */
  public calculatePassiveScore(text: string): {
    totalCount: number;
    causativePassiveCount: number;
    consecutiveCount: number;
    score: number;
  } {
    if (!text || !text.trim()) {
      return { totalCount: 0, causativePassiveCount: 0, consecutiveCount: 0, score: 0 };
    }

    const matches = this.detectMatches(text);
    const totalCount = matches.length;
    const causativePassiveCount = matches.filter((m) => m.type === 'causative_passive').length;

    // Count maximum consecutive sentence passive occurrences
    let consecutiveCount = 0;
    let currentChain = 0;
    let lastSentenceIdx = -2;

    const sentenceWithMatches = Array.from(new Set(matches.map((m) => m.sentenceIndex))).sort((a, b) => a - b);
    for (const sIdx of sentenceWithMatches) {
      if (sIdx === lastSentenceIdx + 1) {
        currentChain++;
      } else {
        currentChain = 1;
      }
      if (currentChain > consecutiveCount) {
        consecutiveCount = currentChain;
      }
      lastSentenceIdx = sIdx;
    }

    const score = totalCount * 10 + causativePassiveCount * 15 + consecutiveCount * 20;

    return { totalCount, causativePassiveCount, consecutiveCount, score };
  }

  private detectMatches(text: string): PassiveMatch[] {
    const matches: PassiveMatch[] = [];

    // Causative passive regex:
    const causativeRegex =
      /([一-龠々ぁ-んァ-ヶa-zA-Z0-9]+?(?:させられ|せられ|らさせられ)(?:ている|ていた|た|て|ます|ました|り|る)?)/g;

    // Passive regex:
    const passiveRegex =
      /([一-龠々ぁ-んァ-ヶa-zA-Z0-9]+?(?:され|こられ|来られ|られ|れ)(?:ている|ていた|た|て|ます|ました|り|る)?)/g;

    // Split text into paragraphs and sentences
    const paragraphs = text.split(/\r?\n/);
    let overallOffset = 0;
    let sentenceGlobalIdx = 0;

    for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
      const paragraphText = paragraphs[pIdx];
      const pStart = overallOffset;
      overallOffset += paragraphText.length + 1; // +1 for newline

      if (!paragraphText.trim()) {
        continue;
      }

      // If the paragraph starts with dialogue quotes (「, 『), skip passive voice alerting to protect dialogue
      if (paragraphText.trim().startsWith('「') || paragraphText.trim().startsWith('『')) {
        continue;
      }

      // Sentence splitting
      let sStartInP = 0;
      for (let i = 0; i < paragraphText.length; i++) {
        const char = paragraphText[i];
        const isEndChar = char === '。' || char === '！' || char === '？' || char === '!' || char === '?';
        const isLastChar = i === paragraphText.length - 1;

        if (isEndChar || isLastChar) {
          const sEndInP = i + 1;
          const sentenceText = paragraphText.substring(sStartInP, sEndInP);
          const sGlobalStart = pStart + sStartInP;

          // Find matches in this sentence
          const foundRanges: Array<{ start: number; end: number }> = [];

          // 1. Causative passive
          causativeRegex.lastIndex = 0;
          let match: RegExpExecArray | null;
          while ((match = causativeRegex.exec(sentenceText)) !== null) {
            // Exclude inside dialogue quotes (「...」, 『...』)
            const textBeforeMatch = sentenceText.slice(0, match.index);
            const openQuotes = (textBeforeMatch.match(/[「『]/g) || []).length;
            const closeQuotes = (textBeforeMatch.match(/[」』]/g) || []).length;
            if (openQuotes > closeQuotes) {
              continue;
            }

            const phrase = match[1];
            const start = sGlobalStart + match.index;
            const end = start + phrase.length;
            foundRanges.push({ start, end });

            matches.push({
              from: start,
              to: end,
              text: phrase,
              type: 'causative_passive',
              activeSuggestion: this.convertPassiveToActive(phrase),
              paragraphIndex: pIdx,
              sentenceIndex: sentenceGlobalIdx,
            });
          }

          // 2. Passive voice (avoiding overlapping with causative matches)
          passiveRegex.lastIndex = 0;
          while ((match = passiveRegex.exec(sentenceText)) !== null) {
            // Exclude inside dialogue quotes (「...」, 『...』)
            const textBeforeMatch = sentenceText.slice(0, match.index);
            const openQuotes = (textBeforeMatch.match(/[「『]/g) || []).length;
            const closeQuotes = (textBeforeMatch.match(/[」』]/g) || []).length;
            if (openQuotes > closeQuotes) {
              continue;
            }

            const phrase = match[1];

            // Exclude intransitive/active verbs ending in 'れる' (離れた, 疲れた, 倒れた, 切れた, etc.)
            let isNonPassive = false;
            for (const stem of INTRANSITIVE_NON_PASSIVE_STEMS) {
              if (phrase.includes(stem)) {
                isNonPassive = true;
                break;
              }
            }
            if (isNonPassive) continue;

            const start = sGlobalStart + match.index;
            const end = start + phrase.length;

            const isOverlap = foundRanges.some((r) => Math.max(start, r.start) < Math.min(end, r.end));
            if (!isOverlap) {
              foundRanges.push({ start, end });
              matches.push({
                from: start,
                to: end,
                text: phrase,
                type: 'passive',
                activeSuggestion: this.convertPassiveToActive(phrase),
                paragraphIndex: pIdx,
                sentenceIndex: sentenceGlobalIdx,
              });
            }
          }

          sentenceGlobalIdx++;
          sStartInP = sEndInP;
        }
      }
    }

    return matches.sort((a, b) => a.from - b.from);
  }

  /**
   * Main linting / detection method. Scans text for excessive passive voice and consecutive passive sentences.
   */
  public detect(text: string, options?: PassiveDetectorOptions): PassiveDiagnostic[] {
    if (options?.isComposing || !text) {
      return [];
    }

    const effectiveThreshold = options?.threshold ?? this.threshold;
    const effectiveConsecutiveThreshold = options?.consecutiveThreshold ?? this.consecutiveThreshold;

    const allMatches = this.detectMatches(text);
    if (allMatches.length === 0) {
      return [];
    }

    const diagnostics: PassiveDiagnostic[] = [];
    const paragraphs = text.split(/\r?\n/);

    // Group matches by paragraph
    const pMap = new Map<number, PassiveMatch[]>();
    for (const match of allMatches) {
      if (!pMap.has(match.paragraphIndex)) {
        pMap.set(match.paragraphIndex, []);
      }
      pMap.get(match.paragraphIndex)!.push(match);
    }

    let pOffset = 0;
    for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
      const pText = paragraphs[pIdx];
      const pStart = pOffset;
      const pEnd = pOffset + pText.length;
      pOffset = pEnd + 1;

      const pMatches = pMap.get(pIdx) || [];
      if (pMatches.length === 0) continue;

      const causativeCount = pMatches.filter((m) => m.type === 'causative_passive').length;
      const passiveCount = pMatches.length;

      // Calculate consecutive sentence occurrences inside paragraph
      let maxConsecutive = 0;
      let curConsecutive = 0;
      let prevSentenceIdx = -2;

      const sIndices = Array.from(new Set(pMatches.map((m) => m.sentenceIndex))).sort((a, b) => a - b);
      for (const sIdx of sIndices) {
        if (sIdx === prevSentenceIdx + 1) {
          curConsecutive++;
        } else {
          curConsecutive = 1;
        }
        if (curConsecutive > maxConsecutive) {
          maxConsecutive = curConsecutive;
        }
        prevSentenceIdx = sIdx;
      }

      const score = passiveCount * 10 + causativeCount * 15 + maxConsecutive * 20;

      const isParagraphOveruse = passiveCount >= effectiveThreshold;
      const isConsecutiveViolation = maxConsecutive >= effectiveConsecutiveThreshold;

      if (isParagraphOveruse || isConsecutiveViolation || causativeCount > 0) {
        let from = pStart;
        let to = pEnd;

        if (options?.displayMap) {
          from = options.displayMap.toDisplayOffset(from);
          to = options.displayMap.toDisplayOffset(to);
        }

        let triggerReason: 'paragraph_threshold' | 'consecutive_sentences' | 'causative_passive' =
          'paragraph_threshold';
        let msg = `【受動態過多・主体曖昧化】第${pIdx + 1}段落内に受動態（〜れる／〜られる）が${passiveCount}件検出されました。動作の主体（主語）が曖昧になっています。能動態への書き換えを推奨します。`;

        if (isConsecutiveViolation) {
          triggerReason = 'consecutive_sentences';
          msg = `【受動態連続検出】第${pIdx + 1}段落で受動態表現が${maxConsecutive}文連続して使用されています。文脈の主体性を明確にするため能動態表現へのリライトを検討してください。`;
        } else if (causativeCount > 0 && !isParagraphOveruse) {
          triggerReason = 'causative_passive';
          msg = `【使役受動態検出】第${pIdx + 1}段落内で使役受動態（「〜させられる」等）が検出されました。能動態表現（「〜させた」等）に改めると文章がより明瞭になります。`;
        }

        const remappedMatches = pMatches.map((m) => {
          let mFrom = m.from;
          let mTo = m.to;
          if (options?.displayMap) {
            mFrom = options.displayMap.toDisplayOffset(mFrom);
            mTo = options.displayMap.toDisplayOffset(mTo);
          }
          return {
            ...m,
            from: mFrom,
            to: mTo,
          };
        });

        const suggestedRewrites = remappedMatches.map(
          (m) => `「${m.text}」 → 能動態「[動作主]が${m.activeSuggestion}」`
        );

        const isExcessive = passiveCount >= 3 || maxConsecutive >= 3 || causativeCount > 0;
        const severity: 'warning' | 'info' = isExcessive ? 'warning' : 'info';

        diagnostics.push({
          from,
          to,
          severity,
          message: msg,
          triggerReason,
          paragraphIndex: pIdx,
          passiveCount,
          consecutiveSentenceCount: maxConsecutive,
          score,
          matches: remappedMatches,
          suggestedRewrites,
        });
      }
    }

    return diagnostics;
  }
}
