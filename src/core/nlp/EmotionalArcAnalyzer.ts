/**
 * EmotionalArcAnalyzer - Sentiment & Climax Tension Estimation Engine
 *
 * Scores scene-by-scene positive/negative emotional valence and tension level
 * based on a Japanese emotional vocabulary lexicon.
 */

import { AozoraParser } from '../editor/AozoraParser.js';

export type EmotionCategory = 'positive' | 'negative' | 'tension';

export interface EmotionWordDef {
  word: string;
  category: EmotionCategory;
  weight?: number;
}

export interface CustomLexiconOptions {
  positiveWords?: string[];
  negativeWords?: string[];
  tensionWords?: string[];
  customWordDefs?: EmotionWordDef[];
}

export interface EmotionalSceneData {
  sceneIndex: number;
  title: string;
  sampleText: string;
  wordCount: number;
  positiveScore: number;
  negativeScore: number;
  valence: number; // Range: -1.0 (very negative) to +1.0 (very positive)
  tension: number; // Range: 0.0 (calm) to 1.0 (high tension/climax)
  isClimaxCandidate: boolean;
}

export interface EmotionalArcResult {
  scenes: EmotionalSceneData[];
  overallValence: number;
  peakTensionSceneIndex: number;
  climaxProgress: number; // 0.0 to 1.0 (position of climax in the story)
  summary: {
    totalScenes: number;
    dominantEmotion: 'positive' | 'negative' | 'neutral';
    peakTensionScore: number;
  };
}

export const DEFAULT_POSITIVE_WORDS = [
  '歓喜', '喜ぶ', '喜び', '笑顔', '勝利', '希望', '愛する', '愛', '仲間',
  '平和', '祝福', '救う', '微笑む', '感謝', '幸福', '光', '輝く', '咲く',
  '成功', '抱きしめる', '安心', '優しい', 'ほほ笑む', '魅了', '爽やか', '絆',
  '誇り', '奇跡', '安らぎ', '信頼', '朗らか', '輝き', '微笑', '温かい', '賛美'
];

export const DEFAULT_NEGATIVE_WORDS = [
  '恐れ', '恐怖', '悲しみ', '悲しい', '怒り', '怒る', '絶望', '殺す', '殺害',
  '苦しみ', '苦しい', '罠', '破滅', '闇', '涙', '叫ぶ', '苦痛', '惨劇', '災い',
  '欺く', '裏切り', '崩壊', '悪夢', '呪い', '凍る', '冷酷', '殺気', '悲鳴',
  '絶叫', '憎しみ', '焦燥', '不安', '倒れる', '敗北', '激怒', '血'
];

export const DEFAULT_TENSION_WORDS = [
  '決戦', '衝突', '剣', '爆発', '危機', 'クライマックス', '突破', '瞬間',
  '激戦', '怒号', '激突', '襲撃', '刃', '閃光', '迫る', '開戦', '命がけ',
  '撃破', '死闘', '炸裂', '緊迫', '全開', '対峙', '突入', '決断', '覚悟',
  '破裂', '燃えあがる', '一撃', '予言', '血撃', '銃声', '警報'
];

export class EmotionalArcAnalyzer {
  private positiveLexicon: Map<string, number> = new Map();
  private negativeLexicon: Map<string, number> = new Map();
  private tensionLexicon: Map<string, number> = new Map();

  constructor(options?: CustomLexiconOptions) {
    this.initDefaultLexicon();

    if (options) {
      this.applyCustomOptions(options);
    }
  }

  private initDefaultLexicon(): void {
    for (const word of DEFAULT_POSITIVE_WORDS) {
      this.positiveLexicon.set(word, 1.0);
    }
    for (const word of DEFAULT_NEGATIVE_WORDS) {
      this.negativeLexicon.set(word, 1.0);
    }
    for (const word of DEFAULT_TENSION_WORDS) {
      this.tensionLexicon.set(word, 1.0);
    }
  }

  public applyCustomOptions(options: CustomLexiconOptions): void {
    if (options.positiveWords) {
      for (const w of options.positiveWords) {
        this.positiveLexicon.set(w, 1.0);
      }
    }
    if (options.negativeWords) {
      for (const w of options.negativeWords) {
        this.negativeLexicon.set(w, 1.0);
      }
    }
    if (options.tensionWords) {
      for (const w of options.tensionWords) {
        this.tensionLexicon.set(w, 1.0);
      }
    }
    if (options.customWordDefs) {
      for (const def of options.customWordDefs) {
        const weight = def.weight ?? 1.0;
        if (def.category === 'positive') {
          this.positiveLexicon.set(def.word, weight);
        } else if (def.category === 'negative') {
          this.negativeLexicon.set(def.word, weight);
        } else if (def.category === 'tension') {
          this.tensionLexicon.set(def.word, weight);
        }
      }
    }
  }

  /**
   * Cleans text by stripping Aozora ruby syntax (`｜漢字《かんじ》` -> `漢字`)
   * and bouten formatting to ensure clean dictionary keyword matching.
   */
  public stripAozoraMarkup(text: string): string {
    return text
      .replace(/｜([^《\n\r]+)《[^》\n\r]+》/g, '$1')
      .replace(/([\u4E00-\u9FFF々〆ヵヶ]+)《[^》\n\r]+》/g, '$1')
      .replace(/《《([^》\n\r]+)》》/g, '$1');
  }

  /**
   * Segments full manuscript text into scene chunks.
   * Splits by explicit scene dividers (`===`, `---`, `***`) or paragraph blocks.
   */
  public segmentScenes(rawText: string): { title: string; text: string }[] {
    const cleanText = rawText.trim();
    if (!cleanText) {
      return [];
    }

    // 1. Explicit scene dividers
    const dividerPattern = /(?:\r?\n)(?:={3,}|-{3,}|\*{3,}|第[一二三四五六七八九十0-9]+[章幕])(?:\r?\n)/;
    if (dividerPattern.test(cleanText)) {
      const parts = cleanText.split(/(?:\r?\n)(?:={3,}|-{3,}|\*{3,}|第[一二三四五六七八九十0-9]+[章幕])(?:\r?\n)/);
      return parts
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
        .map((partText, idx) => ({
          title: `Scene ${idx + 1}`,
          text: partText,
        }));
    }

    // 2. Paragraph / Chunk splitting (double line breaks or block grouping)
    const rawParagraphs = cleanText
      .split(/(?:\r?\n){2,}/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    if (rawParagraphs.length === 0) {
      return [{ title: 'Scene 1', text: cleanText }];
    }

    if (rawParagraphs.length <= 8) {
      return rawParagraphs.map((para, idx) => ({
        title: `Scene ${idx + 1}`,
        text: para,
      }));
    }

    // Group paragraphs into approx 3-paragraph or ~250 character scene chunks
    const scenes: { title: string; text: string }[] = [];
    let currentChunk: string[] = [];
    let currentLen = 0;

    for (const para of rawParagraphs) {
      currentChunk.push(para);
      currentLen += para.length;

      if (currentChunk.length >= 3 || currentLen >= 250) {
        scenes.push({
          title: `Scene ${scenes.length + 1}`,
          text: currentChunk.join('\n\n'),
        });
        currentChunk = [];
        currentLen = 0;
      }
    }

    if (currentChunk.length > 0) {
      scenes.push({
        title: `Scene ${scenes.length + 1}`,
        text: currentChunk.join('\n\n'),
      });
    }

    return scenes;
  }

  /**
   * Analyzes manuscript text and calculates scene-by-scene positive/negative valence
   * and tension trajectory leading to the climax.
   */
  public analyze(rawText: string): EmotionalArcResult {
    const rawScenes = this.segmentScenes(rawText);

    if (rawScenes.length === 0) {
      return {
        scenes: [],
        overallValence: 0,
        peakTensionSceneIndex: 0,
        climaxProgress: 0,
        summary: {
          totalScenes: 0,
          dominantEmotion: 'neutral',
          peakTensionScore: 0,
        },
      };
    }

    let maxRawTension = -1;
    let peakTensionIdx = 0;
    let totalPos = 0;
    let totalNeg = 0;

    const evaluatedScenes: EmotionalSceneData[] = rawScenes.map((s, idx) => {
      const strippedText = this.stripAozoraMarkup(s.text);
      const wordCount = strippedText.length;

      let posScore = 0;
      let negScore = 0;
      let tensionScore = 0;

      // Lexicon matching
      this.positiveLexicon.forEach((weight, word) => {
        const count = (strippedText.split(word).length - 1);
        posScore += count * weight;
      });

      this.negativeLexicon.forEach((weight, word) => {
        const count = (strippedText.split(word).length - 1);
        negScore += count * weight;
      });

      this.tensionLexicon.forEach((weight, word) => {
        const count = (strippedText.split(word).length - 1);
        tensionScore += count * weight;
      });

      // Include punctuation tension indicators (exclamation marks, bold dots)
      const exclamationCount = (strippedText.match(/[！!]/g) || []).length;
      const questionCount = (strippedText.match(/[？?]/g) || []).length;
      tensionScore += exclamationCount * 0.5 + questionCount * 0.2;

      // Also tension gets boosted by negative emotions (conflict/fear/danger)
      tensionScore += negScore * 0.4;

      totalPos += posScore;
      totalNeg += negScore;

      // Track climax peak based on absolute tension intensity
      if (tensionScore > maxRawTension) {
        maxRawTension = tensionScore;
        peakTensionIdx = idx;
      }

      // Calculate normalized Valence in range [-1.0, +1.0]
      const totalSentiment = posScore + negScore;
      let valence = 0;
      if (totalSentiment > 0) {
        valence = (posScore - negScore) / totalSentiment;
      }

      // Calculate normalized Tension in range [0.0, 1.0]
      // Standardize density with soft sigmoid-like cap
      const baseDensity = wordCount > 0 ? (tensionScore / Math.max(wordCount, 40)) * 100 : 0;
      const normalizedTension = Math.min(1.0, Math.max(0.0, baseDensity / 5.0));

      const sampleText = strippedText.slice(0, 40) + (strippedText.length > 40 ? '...' : '');

      return {
        sceneIndex: idx,
        title: s.title,
        sampleText,
        wordCount,
        positiveScore: Number(posScore.toFixed(2)),
        negativeScore: Number(negScore.toFixed(2)),
        valence: Number(valence.toFixed(2)),
        tension: Number(normalizedTension.toFixed(2)),
        isClimaxCandidate: false,
      };
    });

    // Mark climax candidate scene
    if (evaluatedScenes.length > 0) {
      evaluatedScenes[peakTensionIdx].isClimaxCandidate = true;
    }

    const climaxProgress = evaluatedScenes.length > 0 ? (peakTensionIdx + 1) / evaluatedScenes.length : 0;
    const netSentiment = totalPos + totalNeg;
    let overallValence = 0;
    if (netSentiment > 0) {
      overallValence = Number(((totalPos - totalNeg) / netSentiment).toFixed(2));
    }

    let dominantEmotion: 'positive' | 'negative' | 'neutral' = 'neutral';
    if (overallValence > 0.15) {
      dominantEmotion = 'positive';
    } else if (overallValence < -0.15) {
      dominantEmotion = 'negative';
    }

    const peakTensionVal = evaluatedScenes.length > 0 ? evaluatedScenes[peakTensionIdx].tension : 0;

    return {
      scenes: evaluatedScenes,
      overallValence,
      peakTensionSceneIndex: peakTensionIdx,
      climaxProgress: Number(climaxProgress.toFixed(2)),
      summary: {
        totalScenes: evaluatedScenes.length,
        dominantEmotion,
        peakTensionScore: Number(peakTensionVal.toFixed(2)),
      },
    };
  }
}
