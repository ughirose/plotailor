/**
 * SensoryLexiconScorer - Five Senses Vocabulary Scorer & Distribution Analyzer for Plotailor IDE.
 *
 * Categorizes sensory expressions into 5 modalities:
 * 1. Visual (視覚: 光, 色, 形状)
 * 2. Auditory (聴覚: 音, 声, 擬音)
 * 3. Olfactory (嗅覚: 匂い, 香)
 * 4. Tactile (触覚: 温冷, 肌触り, 痛)
 * 5. Gustatory (味覚: 甘苦, 味)
 *
 * Calculates sensory distribution ratios, outputs radar chart data (0.0 to 1.0 per sense),
 * detects visual bias dominance, and generates actionable immersion advice messages.
 */

export type SensoryCategory = 'visual' | 'auditory' | 'olfactory' | 'tactile' | 'gustatory';

export type SensoryLexicon = Record<SensoryCategory, string[]>;

export interface SensoryMatch {
  category: SensoryCategory;
  term: string;
  start: number;
  end: number;
}

export type SensoryCountMap = Record<SensoryCategory, number>;

export type SensoryRadarScores = Record<SensoryCategory, number>;

export interface VisualBiasDiagnostic {
  /** True if visual description ratio dominates and non-visual descriptions are lacking */
  isVisualDominant: boolean;
  /** Ratio of visual matches relative to total sensory matches (0.0 - 1.0) */
  visualRatio: number;
  /** Ratio of non-visual matches relative to total sensory matches (0.0 - 1.0) */
  nonVisualRatio: number;
  /** Diagnostic severity level */
  severity: 'none' | 'info' | 'warning';
  /** Main diagnostic warning or status message */
  message: string;
  /** Tactical advice for enhancing immersion */
  advice: string;
  /** Actionable suggestions for the author */
  suggestions: string[];
}

export interface SensoryAnalysisResult {
  /** Total count of all sensory matches found in the text */
  totalSensoryWords: number;
  /** Count of matches per sensory category */
  counts: SensoryCountMap;
  /** Normalized scores for radar chart output (each value between 0.0 and 1.0) */
  radarScores: SensoryRadarScores;
  /** Visual bias diagnostic and immersion advice */
  visualBias: VisualBiasDiagnostic;
  /** All detailed sensory term matches with string offsets */
  matches: SensoryMatch[];
}

export interface SensoryScorerOptions {
  /** Optional custom dictionary additions or overrides per category */
  customLexicon?: Partial<SensoryLexicon>;
  /** Threshold ratio above which visual bias is flagged (default: 0.70) */
  visualDominanceThreshold?: number;
  /** Minimum total sensory words required before visual bias detection triggers (default: 2) */
  minSensoryCountForBiasThreshold?: number;
  /** Mode for radar score calculation: 'relative' (ratio of total) or 'relative_max' (ratio of max category) */
  scoringMode?: 'relative' | 'relative_max';
  /** IME input protection flag */
  isComposing?: boolean;
}

/**
 * Built-in default dictionary for five senses in Japanese literature.
 */
export const DEFAULT_SENSORY_LEXICON: SensoryLexicon = {
  visual: [
    '眩しい', 'まぶしい', '明るい', '暗い', '光', '影', '色彩', '赤', '青', '黄', '緑', '黒', '白',
    '透明', '輝く', '煌めく', '閃く', '霞む', '四角い', '丸い', '巨大', '微小', 'シルエット', '視界',
    '瞳', '瞳孔', '輝き', 'くすんだ', '鮮やか', '見つめる', '美しく', '景色', '形状', '姿', '輪郭',
    '漆黒', '朱色', '紺碧', '黄金', '深紅', '銀色', '薄闇', '木漏れ日', '残像', '残光',
  ],
  auditory: [
    '音', '声', '叫び', 'ささやき', '囁き', '響く', '静寂', '静か', '喧騒', 'ノイズ', 'ドカン',
    'ガチャン', 'バタン', 'ザーザー', 'トントン', 'パチパチ', 'コロコロ', 'チャリン', 'カチャ',
    '悲鳴', '歌声', '足音', 'うなり声', '物音', '耳鳴り', '轟音', '静けさ', 'つぶやく', '怒号',
    'ざわめき', 'せせらぎ', '高鳴り', '余韻', '雨音', '地鳴り',
  ],
  olfactory: [
    '匂い', '匂う', '香り', '香る', '臭い', '悪臭', '芳しい', '香水', '芳香', '焦げ臭い', '生臭い',
    '汗くさい', 'カビ臭い', '無臭', '香気', 'におい', '異臭', '匂い立つ', '馨しい', 'くさい',
    '甘い香り', '潮の香り', '香木', 'アロマ', '獣臭', '血の匂い',
  ],
  tactile: [
    '冷たい', '暖かい', '温かい', '熱い', '痛い', '痛み', '滑らか', 'なめらか', 'ザラザラ', 'ざらざら',
    'ツルツル', 'つるつる', '硬い', '柔らかい', 'やわらかい', 'しびれる', '痺れる', '痒い', '湿った',
    '乾いた', '肌触り', '手触り', '感触', 'ひんやり', 'ぽかぽか', 'チクチク', 'ヒリヒリ', '激痛',
    '生温かい', 'ごつごつ', 'ふんわり', '凍える', '湿り気',
  ],
  gustatory: [
    '甘い', '甘み', '苦い', '苦味', '辛い', '辛味', '酸っぱい', '酸味', 'しょっぱい', '塩からい',
    '塩味', '旨味', 'うま味', '美味しい', '美味', 'マズい', '風味', '後味', '味わい', '味',
    '舌触り', '甘酸っぱい', 'エグみ', '渋い', '渋み', 'コク', '極旨', '珍味',
  ],
};

export class SensoryLexiconScorer {
  private lexicon: SensoryLexicon;
  private visualDominanceThreshold: number;
  private minSensoryCountForBiasThreshold: number;
  private scoringMode: 'relative' | 'relative_max';

  constructor(options?: SensoryScorerOptions) {
    this.lexicon = {
      visual: Array.from(new Set(DEFAULT_SENSORY_LEXICON.visual)),
      auditory: Array.from(new Set(DEFAULT_SENSORY_LEXICON.auditory)),
      olfactory: Array.from(new Set(DEFAULT_SENSORY_LEXICON.olfactory)),
      tactile: Array.from(new Set(DEFAULT_SENSORY_LEXICON.tactile)),
      gustatory: Array.from(new Set(DEFAULT_SENSORY_LEXICON.gustatory)),
    };

    if (options?.customLexicon) {
      this.mergeCustomLexicon(options.customLexicon);
    }

    this.visualDominanceThreshold = options?.visualDominanceThreshold ?? 0.70;
    this.minSensoryCountForBiasThreshold = options?.minSensoryCountForBiasThreshold ?? 2;
    this.scoringMode = options?.scoringMode ?? 'relative';
  }

  /**
   * Merges custom words into the current lexicon dictionary without duplicates.
   */
  private mergeCustomLexicon(customLexicon: Partial<SensoryLexicon>): void {
    const categories: SensoryCategory[] = ['visual', 'auditory', 'olfactory', 'tactile', 'gustatory'];
    for (const cat of categories) {
      if (customLexicon[cat] && Array.isArray(customLexicon[cat])) {
        for (const word of customLexicon[cat]!) {
          if (word && !this.lexicon[cat].includes(word)) {
            this.lexicon[cat].push(word);
          }
        }
      }
    }
  }

  /**
   * Adds a custom word to a specific sensory category dictionary.
   */
  public addLexiconWord(category: SensoryCategory, term: string): void {
    if (term && !this.lexicon[category].includes(term)) {
      this.lexicon[category].push(term);
    }
  }

  /**
   * Replaces the dictionary for a specific sensory category.
   */
  public setLexicon(category: SensoryCategory, terms: string[]): void {
    this.lexicon[category] = [...terms];
  }

  /**
   * Returns a deep copy of the current sensory dictionary lexicon.
   */
  public getLexicon(): SensoryLexicon {
    return {
      visual: [...this.lexicon.visual],
      auditory: [...this.lexicon.auditory],
      olfactory: [...this.lexicon.olfactory],
      tactile: [...this.lexicon.tactile],
      gustatory: [...this.lexicon.gustatory],
    };
  }

  /**
   * Analyzes manuscript text for sensory expressions, distribution ratios,
   * radar chart scores, and visual dominance bias.
   */
  public analyze(text: string, options?: SensoryScorerOptions): SensoryAnalysisResult {
    if (options?.isComposing || !text || text.length === 0) {
      return {
        totalSensoryWords: 0,
        counts: { visual: 0, auditory: 0, olfactory: 0, tactile: 0, gustatory: 0 },
        radarScores: { visual: 0, auditory: 0, olfactory: 0, tactile: 0, gustatory: 0 },
        visualBias: {
          isVisualDominant: false,
          visualRatio: 0,
          nonVisualRatio: 0,
          severity: 'none',
          message: 'テキストに五感描写が含まれていません。',
          advice: '視覚だけでなく、音・匂い・手触り・味などの五感描写を取り入れることで、読者の没入感を高めることができます。',
          suggestions: [],
        },
        matches: [],
      };
    }

    const effectiveScoringMode = options?.scoringMode ?? this.scoringMode;
    const effectiveVisualDominanceThreshold = options?.visualDominanceThreshold ?? this.visualDominanceThreshold;
    const effectiveMinSensoryCount = options?.minSensoryCountForBiasThreshold ?? this.minSensoryCountForBiasThreshold;

    // Apply temporary custom lexicon if provided in options
    let activeLexicon = this.lexicon;
    if (options?.customLexicon) {
      activeLexicon = {
        visual: [...this.lexicon.visual, ...(options.customLexicon.visual ?? [])],
        auditory: [...this.lexicon.auditory, ...(options.customLexicon.auditory ?? [])],
        olfactory: [...this.lexicon.olfactory, ...(options.customLexicon.olfactory ?? [])],
        tactile: [...this.lexicon.tactile, ...(options.customLexicon.tactile ?? [])],
        gustatory: [...this.lexicon.gustatory, ...(options.customLexicon.gustatory ?? [])],
      };
    }

    const matches: SensoryMatch[] = [];
    const counts: SensoryCountMap = {
      visual: 0,
      auditory: 0,
      olfactory: 0,
      tactile: 0,
      gustatory: 0,
    };

    const categories: SensoryCategory[] = ['visual', 'auditory', 'olfactory', 'tactile', 'gustatory'];

    for (const cat of categories) {
      const terms = [...activeLexicon[cat]].sort((a, b) => b.length - a.length);

      for (const term of terms) {
        if (!term) continue;
        let pos = text.indexOf(term);
        while (pos !== -1) {
          matches.push({
            category: cat,
            term,
            start: pos,
            end: pos + term.length,
          });
          counts[cat]++;
          pos = text.indexOf(term, pos + term.length);
        }
      }
    }

    // Sort matches by start position ascending
    matches.sort((a, b) => a.start - b.start);

    const totalSensoryWords = matches.length;

    // Calculate Radar Scores (0.0 to 1.0)
    const radarScores = this.calculateRadarScores(counts, totalSensoryWords, effectiveScoringMode);

    // Evaluate Visual Dominance Bias
    const visualBias = this.evaluateVisualBias(
      counts,
      totalSensoryWords,
      effectiveVisualDominanceThreshold,
      effectiveMinSensoryCount
    );

    return {
      totalSensoryWords,
      counts,
      radarScores,
      visualBias,
      matches,
    };
  }

  /**
   * Calculates radar chart values (0.0 to 1.0) for each sensory modality.
   */
  public calculateRadarScores(
    counts: SensoryCountMap,
    totalSensoryWords: number,
    mode: 'relative' | 'relative_max' = 'relative'
  ): SensoryRadarScores {
    if (totalSensoryWords === 0) {
      return { visual: 0, auditory: 0, olfactory: 0, tactile: 0, gustatory: 0 };
    }

    if (mode === 'relative_max') {
      const maxCount = Math.max(...Object.values(counts));
      if (maxCount === 0) {
        return { visual: 0, auditory: 0, olfactory: 0, tactile: 0, gustatory: 0 };
      }
      return {
        visual: Number((counts.visual / maxCount).toFixed(3)),
        auditory: Number((counts.auditory / maxCount).toFixed(3)),
        olfactory: Number((counts.olfactory / maxCount).toFixed(3)),
        tactile: Number((counts.tactile / maxCount).toFixed(3)),
        gustatory: Number((counts.gustatory / maxCount).toFixed(3)),
      };
    }

    // Default 'relative' mode: ratio relative to total sensory words
    return {
      visual: Number((counts.visual / totalSensoryWords).toFixed(3)),
      auditory: Number((counts.auditory / totalSensoryWords).toFixed(3)),
      olfactory: Number((counts.olfactory / totalSensoryWords).toFixed(3)),
      tactile: Number((counts.tactile / totalSensoryWords).toFixed(3)),
      gustatory: Number((counts.gustatory / totalSensoryWords).toFixed(3)),
    };
  }

  /**
   * Evaluates if visual description is disproportionately dominant and generates
   * tailored immersion advice messages.
   */
  public evaluateVisualBias(
    counts: SensoryCountMap,
    totalSensoryWords: number,
    threshold: number = 0.70,
    minCount: number = 2
  ): VisualBiasDiagnostic {
    if (totalSensoryWords < minCount) {
      return {
        isVisualDominant: false,
        visualRatio: totalSensoryWords > 0 ? Number((counts.visual / totalSensoryWords).toFixed(3)) : 0,
        nonVisualRatio: totalSensoryWords > 0 ? Number(((totalSensoryWords - counts.visual) / totalSensoryWords).toFixed(3)) : 0,
        severity: 'none',
        message: '五感描写のデータ量が少ないため、全体のバランスは良好または判定保留です。',
        advice: '視覚以外の感覚描写（環境音・匂い・手触り等）を追加することで、より立体的な情景が浮かび上がります。',
        suggestions: [],
      };
    }

    const visualRatio = Number((counts.visual / totalSensoryWords).toFixed(3));
    const nonVisualRatio = Number(((totalSensoryWords - counts.visual) / totalSensoryWords).toFixed(3));

    const isDominant = visualRatio >= threshold || (counts.visual > 0 && totalSensoryWords === counts.visual);

    if (!isDominant) {
      return {
        isVisualDominant: false,
        visualRatio,
        nonVisualRatio,
        severity: 'none',
        message: '場面の五感描写バランスは多様性に富んでいます。',
        advice: '視覚・聴覚・触覚などのバランスが取れており、臨場感の高いシーンが形成されています。',
        suggestions: [],
      };
    }

    // Determine missing non-visual sensory dimensions for constructive advice
    const missingSenses: string[] = [];
    const suggestions: string[] = [];

    if (counts.auditory === 0) {
      missingSenses.push('聴覚（効果音・声・環境音）');
      suggestions.push('環境音や静けさ、足音・息遣いなどの「音の描写」を追加する');
    }
    if (counts.olfactory === 0) {
      missingSenses.push('嗅覚（空気の匂い・香り・異臭）');
      suggestions.push('空気の匂いや焦げ臭さ、潮風・香水などの「匂いの描写」を追加する');
    }
    if (counts.tactile === 0) {
      missingSenses.push('触覚（温度・肌触り・痛み・感触）');
      suggestions.push('冷気や熱さ、肌触り、痺れや風の感触などの「身体感覚・触覚」を追加する');
    }
    if (counts.gustatory === 0) {
      missingSenses.push('味覚（甘苦・後味・舌触り）');
      suggestions.push('食事や喉の渇き、口内の味覚描写を取り入れる');
    }

    const missingText = missingSenses.length > 0 ? missingSenses.join('、') : '他の非視覚要素';

    return {
      isVisualDominant: true,
      visualRatio,
      nonVisualRatio,
      severity: visualRatio >= 0.85 ? 'warning' : 'info',
      message: `【視覚偏重検知】場面内の五感描写の${(visualRatio * 100).toFixed(0)}%が視覚情報に偏っています。`,
      advice: `描写がカメラ映像のような視覚情報に依存しています。特に「${missingText}」を作品に組み込むことで、読者がその場にいるかのような臨場感・リアリティを高められます。`,
      suggestions,
    };
  }
}
