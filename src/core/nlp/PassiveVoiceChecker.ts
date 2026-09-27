/**
 * PassiveVoiceChecker - Passive Voice Overuse & Subject Obfuscation Detector
 *
 * Part of Plotailor Literature IDE NLP Suite.
 * Detects paragraphs with excessive passive voice auxiliary verbs ("れる", "られる", "される")
 * that lead to subject obfuscation (主体曖昧化).
 * Provides a rule-based active voice converter to suggest clear active-voice rewrites.
 */

import type { SourceToDisplayMap } from '../editor/AozoraParser.js';

export interface PassiveVoiceMatch {
  from: number;
  to: number;
  passivePhrase: string;
  activeSuggestion: string;
}

export interface PassiveVoiceDiagnostic {
  paragraphIndex: number;
  from: number;
  to: number;
  severity: 'warning' | 'info';
  message: string;
  passiveCount: number;
  matches: PassiveVoiceMatch[];
  suggestedRewrites: string[];
}

export interface PassiveCheckerOptions {
  /**
   * Threshold for number of passive occurrences per paragraph to trigger a diagnostic.
   * Default: 2
   */
  threshold?: number;
  /**
   * Skip checking if IME composition is active to prevent author typing lag/jitter.
   */
  isComposing?: boolean;
  /**
   * SourceToDisplayMap for remapping raw source offsets when Aozora markup is used.
   */
  displayMap?: SourceToDisplayMap;
}

const GODAN_SA_STEMS = new Set(['殺', '壊', '話', '押', '残', '出', '起', '流', '逃', '探', '指', '生み出']);
const GODAN_RA_STEMS = new Set(['作', '取', '叱', '送', '切', '売', '語', '守', '折', '知']);

export class PassiveVoiceChecker {
  private threshold: number;

  constructor(options?: { threshold?: number }) {
    this.threshold = options?.threshold ?? 2;
  }

  public setThreshold(threshold: number): void {
    this.threshold = threshold;
  }

  public getThreshold(): number {
    return this.threshold;
  }

  /**
   * Rule-based converter to transform a passive Japanese phrase into its active counterpart.
   * Handles サ変, 一段, 五段 (all rows), and カ変 verb conjugations, as well as past/present tense.
   */
  public convertPassiveToActive(phrase: string): string {
    if (!phrase) return phrase;

    // 1. サ変 / 五段サ行 handling
    if (phrase.endsWith('せられた')) {
      return phrase.slice(0, -4) + 'した';
    }
    if (phrase.endsWith('せられる')) {
      return phrase.slice(0, -4) + 'する';
    }
    if (phrase.endsWith('されていた')) {
      return phrase.slice(0, -5) + 'していた';
    }
    if (phrase.endsWith('されている')) {
      return phrase.slice(0, -5) + 'している';
    }
    if (phrase.endsWith('された')) {
      const stem = phrase.slice(0, -3);
      if (GODAN_SA_STEMS.has(stem) || stem.endsWith('さ')) {
        return stem.replace(/さ$/, '') + 'した';
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

    // 2. カ変: 〜来られる / 〜こられる
    if (phrase.endsWith('来られた')) return phrase.slice(0, -4) + '来た';
    if (phrase.endsWith('来られる')) return phrase.slice(0, -4) + '来る';
    if (phrase.endsWith('こられた')) return phrase.slice(0, -4) + 'きた';
    if (phrase.endsWith('こられる')) return phrase.slice(0, -4) + 'くる';

    // 3. Progressive / aspect endings (〜れている / 〜れていた / 〜られている / 〜られていた)
    if (phrase.endsWith('れている') || phrase.endsWith('られている')) {
      const isRareteiru = phrase.endsWith('られている');
      const stem = isRareteiru ? phrase.slice(0, -4) : phrase.slice(0, -3);

      if (isRareteiru) {
        // 一段動詞: 見られている -> 見ている, 褒められている -> 褒めている
        const activeStem = this.convertPassiveToActive(stem + 'られる');
        if (activeStem.endsWith('る')) {
          return activeStem.slice(0, -1) + 'ている';
        }
      }

      // 五段動詞: 追われている -> 追っている
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

    // 4. Past tense endings (〜れた / 〜られた)
    if (phrase.endsWith('れた') || phrase.endsWith('られた')) {
      return this.convertPastPassiveToActive(phrase);
    }

    // 5. Present / Dictionary forms ending in れる or られる
    // 五段活用未然形 + れる
    if (phrase.endsWith('われる')) return phrase.slice(0, -3) + 'う';
    if (phrase.endsWith('かれる')) return phrase.slice(0, -3) + 'く';
    if (phrase.endsWith('がれる')) return phrase.slice(0, -3) + 'ぐ';
    if (phrase.endsWith('たれる')) return phrase.slice(0, -3) + 'つ';
    if (phrase.endsWith('なれる')) return phrase.slice(0, -3) + 'ぬ';
    if (phrase.endsWith('ばれる')) return phrase.slice(0, -3) + 'ぶ';
    if (phrase.endsWith('まれる')) return phrase.slice(0, -3) + 'む';
    if (phrase.endsWith('らされた')) return phrase.slice(0, -4) + 'らした';

    // 一段活用未然形 + られる
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

    // 五段ラ行: あ段 + られる (e.g., 取られる -> 取る, 叱られる -> 叱る, 作られる -> 作る, 送られる -> 送る)
    if (phrase.endsWith('られる')) {
      const stem = phrase.slice(0, -3);
      if (GODAN_RA_STEMS.has(stem)) return stem + 'る';
      if (stem.endsWith('ら') || stem.endsWith('か') || stem.endsWith('さ') || stem.endsWith('た') || stem.endsWith('ま') || stem.endsWith('ば') || stem.endsWith('が')) {
        if (stem.endsWith('ら')) return stem.slice(0, -1) + 'る';
        if (stem.endsWith('か')) return stem.slice(0, -1) + 'く';
        if (stem.endsWith('さ')) return stem.slice(0, -1) + 'す';
        if (stem.endsWith('た')) return stem.slice(0, -1) + 'つ';
        if (stem.endsWith('ま')) return stem.slice(0, -1) + 'む';
        if (stem.endsWith('ば')) return stem.slice(0, -1) + 'ぶ';
        if (stem.endsWith('が')) return stem.slice(0, -1) + 'ぐ';
      }
      return stem + 'る'; // 一段 default
    }

    if (phrase.endsWith('れる')) {
      return phrase.slice(0, -2) + 'る';
    }

    return phrase;
  }

  private convertPastPassiveToActive(phrase: string): string {
    // 五段過去形
    if (phrase.endsWith('わされた')) return phrase.slice(0, -4) + 'わした';
    if (phrase.endsWith('われた')) return phrase.slice(0, -3) + 'った';
    if (phrase.endsWith('かれた')) return phrase.slice(0, -3) + 'いた';
    if (phrase.endsWith('がれた')) return phrase.slice(0, -3) + 'いだ';
    if (phrase.endsWith('たれた')) return phrase.slice(0, -3) + 'った';
    if (phrase.endsWith('なれた')) return phrase.slice(0, -3) + 'んだ';
    if (phrase.endsWith('ばれた')) return phrase.slice(0, -3) + 'んだ';
    if (phrase.endsWith('まれた')) return phrase.slice(0, -3) + 'んだ';

    // 一段過去形
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
      if (stemReta.endsWith('わ') || stemReta.endsWith('か') || stemReta.endsWith('が') || stemReta.endsWith('さ') || stemReta.endsWith('た') || stemReta.endsWith('な') || stemReta.endsWith('ば') || stemReta.endsWith('ま') || stemReta.endsWith('ら')) {
        if (stemReta.endsWith('わ') || stemReta.endsWith('た') || stemReta.endsWith('ら')) return stemReta.slice(0, -1) + 'った';
        if (stemReta.endsWith('か')) return stemReta.slice(0, -1) + 'いた';
        if (stemReta.endsWith('が')) return stemReta.slice(0, -1) + 'いだ';
        if (stemReta.endsWith('さ')) return stemReta.slice(0, -1) + 'した';
        if (stemReta.endsWith('な') || stemReta.endsWith('ば') || stemReta.endsWith('ま')) return stemReta.slice(0, -1) + 'んだ';
      }
      return phrase.slice(0, -2) + 'た';
    }

    return phrase;
  }

  /**
   * Scans document text paragraph by paragraph and detects overuse of passive voice.
   */
  public check(text: string, options?: PassiveCheckerOptions): PassiveVoiceDiagnostic[] {
    if (options?.isComposing) {
      return [];
    }

    const effectiveThreshold = options?.threshold ?? this.threshold;
    const paragraphs = text.split(/\r?\n/);
    const diagnostics: PassiveVoiceDiagnostic[] = [];

    // Regex pattern to catch passive voice verbs:
    // Matches Kanji/Kana stem followed by passive auxiliary suffixes:
    // せられ/され/こられ/来られ/られ/れ + optional ending (る|た|て|ている|ていた|ます|ました|り)
    const passiveRegex = /([一-龠々ぁ-んァ-ヶa-zA-Z0-9]+?(?:せられ|され|こられ|来られ|られ|れ)(?:ている|ていた|た|て|ます|ました|り|る)?)/g;

    let currentOffset = 0;

    for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
      const paragraph = paragraphs[pIdx];
      const pStart = currentOffset;
      const pEnd = currentOffset + paragraph.length;

      // Advance offset for next paragraph (+1 for newline character)
      currentOffset = pEnd + 1;

      if (!paragraph.trim()) {
        continue;
      }

      const matches: PassiveVoiceMatch[] = [];
      let match: RegExpExecArray | null;

      passiveRegex.lastIndex = 0;
      while ((match = passiveRegex.exec(paragraph)) !== null) {
        const fullMatch = match[1];
        const matchStartInParagraph = match.index;
        const matchEndInParagraph = match.index + fullMatch.length;

        let rawFrom = pStart + matchStartInParagraph;
        let rawTo = pStart + matchEndInParagraph;

        if (options?.displayMap) {
          rawFrom = options.displayMap.toDisplayOffset(rawFrom);
          rawTo = options.displayMap.toDisplayOffset(rawTo);
        }

        const activeSuggestion = this.convertPassiveToActive(fullMatch);

        matches.push({
          from: rawFrom,
          to: rawTo,
          passivePhrase: fullMatch,
          activeSuggestion,
        });
      }

      if (matches.length >= effectiveThreshold) {
        let diagFrom = pStart;
        let diagTo = pEnd;

        if (options?.displayMap) {
          diagFrom = options.displayMap.toDisplayOffset(diagFrom);
          diagTo = options.displayMap.toDisplayOffset(diagTo);
        }

        const suggestedRewrites = matches.map(
          (m) => `「${m.passivePhrase}」 → 能動態「[動作主]が${m.activeSuggestion}」`
        );

        diagnostics.push({
          paragraphIndex: pIdx,
          from: diagFrom,
          to: diagTo,
          severity: 'warning',
          passiveCount: matches.length,
          message: `【受動態過多・主体曖昧化】第${pIdx + 1}段落内に受動態（〜れる／〜られる）が${matches.length}件検出されました。動作の主体（主語）が曖昧になっています。動作主を明確にした能動態表現への書き換えを推奨します。`,
          matches,
          suggestedRewrites,
        });
      }
    }

    return diagnostics;
  }
}
