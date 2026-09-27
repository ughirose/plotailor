/**
 * TaigenRhythmEngine - Syntactic Rhythm & Duplicate Subject Analysis Engine
 *
 * Complies with Plotailor IDE architecture:
 * 1. Extracts 3+ consecutive noun-ending (体言止め) sentences from syntactic structure.
 * 2. Detects redundant repeated subjects ("彼は", "太郎は") across consecutive sentences.
 * 3. Suggests subject deletion (omission) or pronominalization / rephrasing.
 * 4. Aozora markup aware with exact character offset tracking.
 */

export interface SentenceToken {
  index: number;
  from: number;
  to: number;
  rawText: string;
  cleanText: string;
  isTaigenDome: boolean;
  endingWord?: string;
  subject?: string;
}

export interface TaigenDomeMatch {
  type: 'consecutive-taigen-dome';
  count: number;
  sentenceIndices: number[];
  sentences: string[];
  from: number;
  to: number;
  message: string;
}

export interface SubjectSuggestion {
  type: 'omit' | 'pronoun' | 'rephrase';
  replacement: string;
  description: string;
}

export interface DuplicateSubjectMatch {
  type: 'duplicate-subject';
  subject: string;
  sentenceIndex: number;
  from: number;
  to: number;
  message: string;
  suggestions: SubjectSuggestion[];
}

export interface RhythmAnalysisResult {
  sentences: SentenceToken[];
  taigenDomeMatches: TaigenDomeMatch[];
  duplicateSubjectMatches: DuplicateSubjectMatch[];
  summary: {
    totalSentences: number;
    taigenDomeCount: number;
    consecutiveTaigenDomeMatches: number;
    duplicateSubjectMatches: number;
  };
}

export class TaigenRhythmEngine {
  /**
   * Helper to strip Aozora ruby markup (｜親文字《るび》 -> 親文字)
   * and accent/emphasis markers (《《傍点》》 -> 傍点) while preserving plain text length roughly for morphological checks.
   */
  public static stripAozoraMarkup(text: string): string {
    return text
      .replace(/｜([^《]+)《[^》]+》/g, '$1')
      .replace(/([一-龠a-zA-Z0-9]+)《[^》]+》/g, '$1')
      .replace(/《《([^》]+)》》/g, '$1')
      .replace(/［＃[^］]+］/g, '');
  }

  /**
   * Static helper to analyze text directly without manual instantiation.
   */
  public static analyze(text: string): RhythmAnalysisResult {
    const engine = new TaigenRhythmEngine();
    return engine.analyze(text);
  }

  /**
   * Splits text into individual sentences with character range offsets.
   */
  public parseSentences(text: string): SentenceToken[] {
    const sentences: SentenceToken[] = [];
    if (!text || text.trim().length === 0) {
      return sentences;
    }

    // Split on Sentence Delimiters: 。, ！, ？, !, ?, or newlines
    const delimiterRegex = /([。！？!?\n\r]+)/g;
    let match: RegExpExecArray | null;
    let currentStart = 0;
    let sentenceIndex = 0;

    while ((match = delimiterRegex.exec(text)) !== null) {
      const sentenceEnd = match.index + match[0].length;
      const rawText = text.substring(currentStart, sentenceEnd);

      if (rawText.trim().length > 0) {
        const token = this.analyzeSentence(sentenceIndex++, rawText, currentStart, sentenceEnd);
        sentences.push(token);
      }

      currentStart = sentenceEnd;
    }

    if (currentStart < text.length) {
      const remainingText = text.substring(currentStart);
      if (remainingText.trim().length > 0) {
        const token = this.analyzeSentence(sentenceIndex++, remainingText, currentStart, text.length);
        sentences.push(token);
      }
    }

    return sentences;
  }

  /**
   * Analyzes an individual sentence token for ending syntax and subject.
   */
  private analyzeSentence(
    index: number,
    rawText: string,
    from: number,
    to: number
  ): SentenceToken {
    const cleanText = TaigenRhythmEngine.stripAozoraMarkup(rawText);

    // Strip trailing punctuation and quotes for terminal evaluation
    const stripped = cleanText
      .replace(/[。！？!?\n\r」』）”"'\s　]+$/g, '')
      .replace(/^[「『（“"'　\s]+/g, '');

    const { isTaigenDome, endingWord } = this.checkTaigenDome(stripped);
    const subject = this.extractSubject(stripped);

    return {
      index,
      from,
      to,
      rawText,
      cleanText,
      isTaigenDome,
      endingWord,
      subject,
    };
  }

  /**
   * Determines whether the stripped sentence ends with a noun (体言止め).
   */
  private checkTaigenDome(strippedText: string): { isTaigenDome: boolean; endingWord?: string } {
    if (!strippedText || strippedText.length === 0) {
      return { isTaigenDome: false };
    }

    // Non-taigen-dome endings (verbal/adjectival/auxiliary conjugations or particles)
    const nonTaigenSuffixes = [
      'だ', 'である', 'です', 'でした', 'だった', 'ます', 'ました', 'ませぬ',
      'する', 'した', 'ない', 'なかった', 'いる', 'いた', 'ある', 'あった',
      'れる', 'られる', 'せる', 'させる', 'た', 'て', 'で', 'な', 'に', 'を',
      'が', 'は', 'から', 'より', 'へ', 'まで', 'と', 'や', 'ね', 'よ', 'わ',
      'ぞ', 'ぜ', 'さ', 'か', 'かい', 'かしら', 'けっけ', 'かな', 'のだ', 'んだ',
      'み合わす', 'けり', 'たり', 'なり', 'ごとし', 'ぬ', 'ん'
    ];

    // Check if sentence ends with any non-taigen verbal/particle suffix
    for (const suffix of nonTaigenSuffixes) {
      if (strippedText.endsWith(suffix)) {
        return { isTaigenDome: false };
      }
    }

    // Known noun endings exception
    const nounExceptions = [
      '満月', '街並み', '影', '刀', '姿', '光', '声', '息', '心', '風', '雨', '空',
      '海', '山', '町', '城', '砦', '剣', '石', '神', '王', '敵', '友', '彼', '彼女',
      '自分', '静寂', '気配', '足音', '選択', '決意', '場所', '瞬間', '記憶', '言葉',
      '眼差し', 'まなざし', '誓い', '願い', '祈り', '微笑み', '佇まい', '響き', '香り',
      '陰り', '輝き', '思い', '装い', '兆し', '彩り', '憩い', '味わい', '目覚め', '揺らめき'
    ];
    const endsWithNounEx = nounExceptions.find(ex => strippedText.endsWith(ex));
    if (endsWithNounEx) {
      return { isTaigenDome: true, endingWord: endsWithNounEx };
    }

    // Common verb inflection endings if preceded by hiragana verb stems
    if (/[きぎしちにひみりえげせてねへめれ]た$/.test(strippedText) ||
        /[かいさたたなはまらあいうえおかきくけこ]った$/.test(strippedText) ||
        /[いきしちにひみり]つ$/.test(strippedText) ||
        (/[うくぐすつぬふぶむゆる]こと$/.test(strippedText) === false && /[うくぐすつぬふぶむゆる]$/.test(strippedText))) {
      return { isTaigenDome: false };
    }

    // If terminal character is Kanji (\u4e00-\u9faf), Katakana (\u30a0-\u30ff), English, or known Noun Hiragana
    const lastChar = strippedText.slice(-1);
    const isKanji = /[\u4e00-\u9faf]/.test(lastChar);
    const isKatakana = /[\u30a0-\u30ff]/.test(lastChar);
    const isEnglish = /[a-zA-Z0-9]/.test(lastChar);

    // Known hiragana nouns
    const hiraganaNouns = [
      'こと', 'もの', '姿', '顔', '手', '時', '声', '影', '息', '夢', '風', '雨', '空',
      '海', '山', '町', '城', '砦', '剣', '石', '神', '王', '敵', '友', '彼', '彼女',
      '自分', '街並み', 'あかり', 'ひかり', '眼差し', 'まなざし', '誓い', '願い', '祈り',
      '微笑み', '佇まい', '響き', '香り', '陰り', '輝き', '思い'
    ];
    const isHiraganaNoun = hiraganaNouns.some(hn => strippedText.endsWith(hn));

    if (isKanji || isKatakana || isEnglish || isHiraganaNoun) {
      const endingWord = strippedText.slice(-Math.min(strippedText.length, 6));
      return { isTaigenDome: true, endingWord };
    }

    return { isTaigenDome: false };
  }

  /**
   * Extracts topic/nominative subject phrase from sentence if present (e.g. 「彼は」「太郎は」「将軍が」).
   */
  private extractSubject(text: string): string | undefined {
    if (!text) return undefined;

    const match = /^([^\s　、。！？!？「『（]+?(?:は|が))/.exec(text);
    if (match) {
      return match[1];
    }

    return undefined;
  }

  /**
   * Main analysis entry point: analyzes manuscript text for taigen-dome patterns and subject repetitions.
   */
  public analyze(text: string): RhythmAnalysisResult {
    const sentences = this.parseSentences(text);
    const taigenDomeMatches: TaigenDomeMatch[] = [];
    const duplicateSubjectMatches: DuplicateSubjectMatch[] = [];

    // 1. Detect 3+ consecutive Taigen-dome sentences
    let currentStreak: SentenceToken[] = [];

    for (let i = 0; i < sentences.length; i++) {
      const s = sentences[i];
      if (s.isTaigenDome) {
        currentStreak.push(s);
      } else {
        if (currentStreak.length >= 3) {
          taigenDomeMatches.push(this.createTaigenDomeMatch(currentStreak));
        }
        currentStreak = [];
      }
    }

    if (currentStreak.length >= 3) {
      taigenDomeMatches.push(this.createTaigenDomeMatch(currentStreak));
    }

    // 2. Detect Duplicate Subjects across consecutive sentences
    for (let i = 1; i < sentences.length; i++) {
      const prev = sentences[i - 1];
      const curr = sentences[i];

      if (curr.subject && prev.subject && curr.subject === prev.subject) {
        const match = this.createDuplicateSubjectMatch(curr, prev);
        duplicateSubjectMatches.push(match);
      }
    }

    const taigenDomeCount = sentences.filter(s => s.isTaigenDome).length;

    return {
      sentences,
      taigenDomeMatches,
      duplicateSubjectMatches,
      summary: {
        totalSentences: sentences.length,
        taigenDomeCount,
        consecutiveTaigenDomeMatches: taigenDomeMatches.length,
        duplicateSubjectMatches: duplicateSubjectMatches.length,
      },
    };
  }

  private createTaigenDomeMatch(streak: SentenceToken[]): TaigenDomeMatch {
    const count = streak.length;
    const sentenceIndices = streak.map(s => s.index);
    const sentenceTexts = streak.map(s => s.rawText.trim());
    const from = streak[0].from;
    const to = streak[streak.length - 1].to;

    return {
      type: 'consecutive-taigen-dome',
      count,
      sentenceIndices,
      sentences: sentenceTexts,
      from,
      to,
      message: `${count}文連続で体言止め（名詞修了）になっています。リズムの単調さを避けるため文末表現の分散を検討してください。`,
    };
  }

  private createDuplicateSubjectMatch(curr: SentenceToken, prev: SentenceToken): DuplicateSubjectMatch {
    const subject = curr.subject!;
    const subjectNoun = subject.replace(/(は|发|が)$/, '');

    const relativeSubjectIndex = curr.rawText.indexOf(subject);
    const from = relativeSubjectIndex >= 0 ? curr.from + relativeSubjectIndex : curr.from;
    const to = from + subject.length;

    const suggestions: SubjectSuggestion[] = [
      {
        type: 'omit',
        replacement: '',
        description: `主語「${subject}」を削除（省略）して文脈の流れをスムーズにする`,
      },
    ];

    const isPronoun = ['彼', '彼女', '私', '僕', '俺', '自分', '彼等', '私達'].includes(subjectNoun);

    if (isPronoun) {
      suggestions.push({
        type: 'rephrase',
        replacement: 'その男は',
        description: `代名詞「${subject}」を固有名詞または「その人物は」等に言い換える`,
      });
    } else {
      suggestions.push({
        type: 'pronoun',
        replacement: subject.endsWith('が') ? '彼が' : '彼は',
        description: `固有名詞「${subject}」を代名詞（「${subject.endsWith('发') || subject.endsWith('が') ? '彼が' : '彼は'}」等）に置き換える`,
      });
    }

    return {
      type: 'duplicate-subject',
      subject,
      sentenceIndex: curr.index,
      from,
      to,
      message: `直前の文（第${prev.index + 1}文）と同じ主語「${subject}」が連続して使用されています。`,
      suggestions,
    };
  }
}
