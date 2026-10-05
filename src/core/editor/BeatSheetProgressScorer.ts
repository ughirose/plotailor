/**
 * BeatSheetProgressScorer - Three-Act Structure Beat Sheet & Scene Tension Scorer
 *
 * Provides:
 * 1. Standard Three-Act (設定, 契機, PP1, 中間点, 危機, クライマックス, 結末) ratio model definition and progress beat matching.
 * 2. Scene tension scoring (0 - 100) based on action keywords/sentence pace, conflict vocabulary, and dialogue tempo.
 */

export interface BeatDefinition {
  id: string;
  name: string;
  act: 'Act1' | 'Act2' | 'Act3';
  startPercentage: number; // 0..100
  endPercentage: number;   // 0..100
  description: string;
}

export interface BeatProgressResult {
  currentBeat: BeatDefinition;
  progressPercentage: number; // 0..100
  act: 'Act1' | 'Act2' | 'Act3';
  actProgressPercentage: number; // 0..100 progress within the current Act
}

export interface TensionBreakdown {
  actionScore: number;    // 0..100
  conflictScore: number;  // 0..100
  tempoScore: number;     // 0..100
}

export interface TensionAnalysis {
  tensionScore: number;   // 0..100 overall tension
  breakdown: TensionBreakdown;
  metrics: {
    sentenceCount: number;
    averageSentenceLength: number;
    exclamationQuestionCount: number;
    actionWordCount: number;
    conflictWordCount: number;
    dialogueRatio: number;      // 0..1
    dialogueLineCount: number;
    shortDialogueCount: number; // Dialogue turns <= 15 chars
  };
}

export interface FullBeatSheetAnalysis {
  progress: BeatProgressResult;
  tension: TensionAnalysis;
}

/**
 * Standard Three-Act Structure Beat Model Definitions
 */
export const STANDARD_BEAT_SHEET: BeatDefinition[] = [
  {
    id: 'setup',
    name: '設定 (Setup)',
    act: 'Act1',
    startPercentage: 0,
    endPercentage: 10,
    description: '主人公の日常、世界観、抱えている課題や欲望を提示する。',
  },
  {
    id: 'inciting_incident',
    name: '契機 (Inciting Incident)',
    act: 'Act1',
    startPercentage: 10,
    endPercentage: 15,
    description: '日常を破壊する事件・呼びかけが発生し、物語が動き出す。',
  },
  {
    id: 'rising_action_1',
    name: '準備・躊躇 (Rising Action I)',
    act: 'Act1',
    startPercentage: 15,
    endPercentage: 25,
    description: '変化への戸惑いや決断までの葛藤を描く。',
  },
  {
    id: 'plot_point_1',
    name: '第一プロットポイント (PP1)',
    act: 'Act2',
    startPercentage: 25,
    endPercentage: 30,
    description: '不可逆の決断を下し、本格的な旅立ち・挑戦（第二幕）へ踏み込む。',
  },
  {
    id: 'first_half_act2',
    name: '試練・葛藤 (First Half Act II)',
    act: 'Act2',
    startPercentage: 30,
    endPercentage: 45,
    description: '新しい世界での仲間との出会い、障害との衝突、小勝利や失敗。',
  },
  {
    id: 'midpoint',
    name: '中間点 (Midpoint)',
    act: 'Act2',
    startPercentage: 45,
    endPercentage: 55,
    description: '偽りの勝利/敗北。物語の賭け金(Stakes)が上がり、受動から能動へ変化する。',
  },
  {
    id: 'second_half_act2',
    name: '追いつめられ・反撃 (Second Half Act II)',
    act: 'Act2',
    startPercentage: 55,
    endPercentage: 70,
    description: '敵対勢力の圧迫が強まり、策動が窮地に陥る。',
  },
  {
    id: 'crisis',
    name: '危機 / 第二プロットポイント (Crisis / PP2)',
    act: 'Act2',
    startPercentage: 70,
    endPercentage: 75,
    description: '「魂の暗い夜」。最大の危機、絶望、すべてを失ったかのような状況。',
  },
  {
    id: 'climax_prep',
    name: '決意・決戦前夜 (Climax Preparation)',
    act: 'Act3',
    startPercentage: 75,
    endPercentage: 85,
    description: '最後の真実を悟り、最終決戦に向けて全力を結集する。',
  },
  {
    id: 'climax',
    name: 'クライマックス (Climax)',
    act: 'Act3',
    startPercentage: 85,
    endPercentage: 95,
    description: '主たる対立・宿敵との直接対決。最大のテンションとカタルシス。',
  },
  {
    id: 'resolution',
    name: '結末 (Resolution)',
    act: 'Act3',
    startPercentage: 95,
    endPercentage: 100,
    description: '事件の収束、新たな日常の訪れ、余韻。',
  },
];

export class BeatSheetProgressScorer {
  private beats: BeatDefinition[];

  // Action verbs and movement keywords
  private static readonly DEFAULT_ACTION_WORDS = [
    '走る', '駆け', '叫ぶ', '殴る', '蹴る', '逃げる', '斬る', '撃つ', '跳ぶ', '倒れる',
    '怒鳴る', '爆発', '突進', '突撃', '激突', '崩壊', '破裂', '隠れる', '争う', '掴む',
    '投げる', '砕く', '迫る', '閃く', '交わす', '見開く', '身構える', '殴打', '襲撃',
  ];

  // Conflict and emotion vocabulary
  private static readonly DEFAULT_CONFLICT_WORDS = [
    '敵', '罠', '絶望', '危機', '恐怖', '裏切り', '殺', '死', '疑', '許さ身', '許さ',
    '憎しみ', '焦り', '衝動', '刃', '葛藤', '苦痛', '悲鳴', '激怒', '疑惑', '脅威',
    '争い', '屈辱', '死闘', '全滅', '怪しい', '血', '傷', '痛む', '危険', '邪魔',
  ];

  constructor(customBeats?: BeatDefinition[]) {
    this.beats = customBeats && customBeats.length > 0 ? customBeats : STANDARD_BEAT_SHEET;
  }

  /**
   * Calculates writing progress percentage and identifies the corresponding beat in the Three-Act structure.
   *
   * @param currentPosition Current character offset or chapter/word index
   * @param totalTarget Total expected characters or document length
   */
  public evaluateProgress(currentPosition: number, totalTarget: number): BeatProgressResult {
    if (totalTarget <= 0 || currentPosition <= 0) {
      return {
        currentBeat: this.beats[0],
        progressPercentage: 0,
        act: 'Act1',
        actProgressPercentage: 0,
      };
    }

    const rawProgress = (currentPosition / totalTarget) * 100;
    const progressPercentage = Math.min(100, Math.max(0, Number(rawProgress.toFixed(1))));

    // Match beat
    let matchedBeat = this.beats.find(
      (b) => progressPercentage >= b.startPercentage && progressPercentage < b.endPercentage
    );

    if (!matchedBeat) {
      matchedBeat = this.beats[this.beats.length - 1];
    }

    // Act Progress Calculation
    let actStart = 0;
    let actEnd = 100;

    if (matchedBeat.act === 'Act1') {
      actStart = 0;
      actEnd = 25;
    } else if (matchedBeat.act === 'Act2') {
      actStart = 25;
      actEnd = 75;
    } else {
      actStart = 75;
      actEnd = 100;
    }

    const actSpan = actEnd - actStart;
    const actProgressRaw = actSpan > 0 ? ((progressPercentage - actStart) / actSpan) * 100 : 0;
    const actProgressPercentage = Math.min(100, Math.max(0, Number(actProgressRaw.toFixed(1))));

    return {
      currentBeat: matchedBeat,
      progressPercentage,
      act: matchedBeat.act,
      actProgressPercentage,
    };
  }

  /**
   * Evaluates scene tension score (0 to 100) based on action degree, conflict vocabulary, and dialogue tempo.
   *
   * @param sceneText Text content of the target scene or selection
   */
  public evaluateTension(sceneText: string): TensionAnalysis {
    if (!sceneText || sceneText.trim().length === 0) {
      return {
        tensionScore: 0,
        breakdown: { actionScore: 0, conflictScore: 0, tempoScore: 0 },
        metrics: {
          sentenceCount: 0,
          averageSentenceLength: 0,
          exclamationQuestionCount: 0,
          actionWordCount: 0,
          conflictWordCount: 0,
          dialogueRatio: 0,
          dialogueLineCount: 0,
          shortDialogueCount: 0,
        },
      };
    }

    const textLength = sceneText.length;

    // 1. Sentences & Punctuation
    const sentenceDelimiters = /[。！？!?\n]/;
    const sentences = sceneText
      .split(sentenceDelimiters)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const sentenceCount = sentences.length || 1;
    const averageSentenceLength = Number((textLength / sentenceCount).toFixed(1));

    const exclamationsMatches = sceneText.match(/[！!？?]/g);
    const exclamationQuestionCount = exclamationsMatches ? exclamationsMatches.length : 0;

    // Action words count
    let actionWordCount = 0;
    for (const word of BeatSheetProgressScorer.DEFAULT_ACTION_WORDS) {
      const matches = sceneText.split(word).length - 1;
      actionWordCount += matches;
    }

    // 2. Conflict vocabulary
    let conflictWordCount = 0;
    for (const word of BeatSheetProgressScorer.DEFAULT_CONFLICT_WORDS) {
      const matches = sceneText.split(word).length - 1;
      conflictWordCount += matches;
    }

    // 3. Dialogue Analysis (Text inside 「...」 or 『...』)
    const dialogueRegex = /[「『]([^」』]*)[」』]/g;
    let dialogueChars = 0;
    let dialogueLineCount = 0;
    let shortDialogueCount = 0;

    let match: RegExpExecArray | null;
    while ((match = dialogueRegex.exec(sceneText)) !== null) {
      const dialogueContent = match[1];
      dialogueChars += match[0].length;
      dialogueLineCount++;
      if (dialogueContent.length <= 15) {
        shortDialogueCount++;
      }
    }

    const dialogueRatio = Number((dialogueChars / textLength).toFixed(2));

    // --- Sub-score calculations (0..100) ---

    // a) Action Score (Exclamations, short sentences, action verbs)
    // - Short sentence bonus: average length < 25 increases tension score
    let sentencePaceFactor = 0;
    if (averageSentenceLength <= 15) {
      sentencePaceFactor = 40;
    } else if (averageSentenceLength <= 30) {
      sentencePaceFactor = 25;
    } else if (averageSentenceLength <= 50) {
      sentencePaceFactor = 10;
    }

    const exclamationDensity = (exclamationQuestionCount / sentenceCount) * 40;
    const actionDensity = (actionWordCount / (textLength / 100)) * 25; // count per 100 chars

    const actionScoreRaw = sentencePaceFactor + exclamationDensity + actionDensity;
    const actionScore = Math.min(100, Math.max(0, Math.round(actionScoreRaw)));

    // b) Conflict Score (Conflict words density)
    const conflictDensity = (conflictWordCount / (textLength / 100)) * 35; // count per 100 chars
    const conflictScoreRaw = conflictDensity;
    const conflictScore = Math.min(100, Math.max(0, Math.round(conflictScoreRaw)));

    // c) Tempo Score (Dialogue ratio, short turn frequency)
    let dialogueRatioFactor = 0;
    if (dialogueRatio >= 0.3 && dialogueRatio <= 0.8) {
      dialogueRatioFactor = 40;
    } else if (dialogueRatio > 0) {
      dialogueRatioFactor = 20;
    }

    const shortTurnRatio = dialogueLineCount > 0 ? shortDialogueCount / dialogueLineCount : 0;
    const shortTurnFactor = shortTurnRatio * 40;
    const lineTurnDensity = (dialogueLineCount / sentenceCount) * 20;

    const tempoScoreRaw = dialogueRatioFactor + shortTurnFactor + lineTurnDensity;
    const tempoScore = Math.min(100, Math.max(0, Math.round(tempoScoreRaw)));

    // Overall Weighted Tension Score
    // Action 40%, Conflict 35%, Tempo 25%
    const overallTensionRaw = actionScore * 0.4 + conflictScore * 0.35 + tempoScore * 0.25;
    const tensionScore = Math.min(100, Math.max(0, Math.round(overallTensionRaw)));

    return {
      tensionScore,
      breakdown: {
        actionScore,
        conflictScore,
        tempoScore,
      },
      metrics: {
        sentenceCount,
        averageSentenceLength,
        exclamationQuestionCount,
        actionWordCount,
        conflictWordCount,
        dialogueRatio,
        dialogueLineCount,
        shortDialogueCount,
      },
    };
  }

  /**
   * Evaluates both progress and tension in a single helper method.
   */
  public analyze(currentPosition: number, totalTarget: number, sceneText: string): FullBeatSheetAnalysis {
    return {
      progress: this.evaluateProgress(currentPosition, totalTarget),
      tension: this.evaluateTension(sceneText),
    };
  }
}
