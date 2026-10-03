/**
 * CharacterEmotionalArcTracker - Time-series Character Emotional Arc Tracker & Co-occurrence Analyzer
 * for Plotailor IDE.
 *
 * Requirements:
 * 1. Co-occurrence analysis of character names/aliases with Japanese emotion lexicon terms.
 * 2. Time-series progression calculation (0% to 100%) for character emotional valence (-1.0 to +1.0).
 * 3. Automatic detection of Climax (peak emotional amplitude) and Catharsis (dramatic emotional turning) points.
 * 4. SVG Arc Chart rendering helper for 3-Pane visual integration.
 */

export interface CharacterDef {
  id: string;
  name: string;
  aliases?: string[];
  color?: string;
}

export type EmotionCategory =
  | 'joy'          // 喜び (positive +1.0)
  | 'anger'        // 怒り (negative -1.0)
  | 'sorrow'       // 悲哀 (negative -1.0)
  | 'fear'         // 恐れ (negative -1.0)
  | 'anticipation' // 期待 (positive +0.8)
  | 'relief'       // 安堵 (positive +1.0)
  | 'love'         // 愛着・好意 (positive +0.9)
  | 'disgust'      // 嫌悪 (negative -0.9)
  | 'surprise'     // 驚愕 (neutral / negative -0.2)
  | string;

export interface EmotionWord {
  word: string;
  category: EmotionCategory;
  valence: number; // -1.0 to +1.0
  weight?: number; // Weight factor (default 1.0)
}

export interface CoOccurrenceMention {
  characterId: string;
  characterName: string;
  emotionWord: string;
  category: EmotionCategory;
  valence: number;
  offset: number;
  sentence: string;
}

export interface ArcProgressPoint {
  progressPercentage: number; // 0 to 100
  segmentId: string;
  segmentTitle: string;
  segmentIndex: number;
  valence: number; // -1.0 (extremely negative) to +1.0 (extremely positive)
  amplitude: number; // 0.0 to 1.0 (emotional intensity / energy level)
  mentionCount: number;
  dominantEmotion?: EmotionCategory;
  breakdown: Record<string, number>;
}

export interface CharacterEmotionalArcSeries {
  character: CharacterDef;
  points: ArcProgressPoint[];
  averageValence: number;
  maxValence: number;
  minValence: number;
  totalMentions: number;
}

export interface ClimaxPoint {
  characterId: string;
  characterName: string;
  progressPercentage: number;
  segmentId: string;
  segmentTitle: string;
  valence: number;
  amplitude: number;
  type: 'climax' | 'catharsis';
  score: number;
  description: string;
}

export interface ManuscriptSegment {
  id: string;
  title: string;
  text: string;
  startOffset: number;
  endOffset: number;
}

export interface EmotionalArcAnalysisResult {
  characters: CharacterDef[];
  series: CharacterEmotionalArcSeries[];
  climaxPoints: ClimaxPoint[];
  catharsisPoints: ClimaxPoint[];
  totalManuscriptLength: number;
  coOccurrences: CoOccurrenceMention[];
  segments: ManuscriptSegment[];
}

export interface AnalysisOptions {
  windowMode?: 'sentence' | 'character_window' | 'paragraph';
  windowSize?: number; // Character window size around character mention (default 60)
  segmentationMode?: 'chapters' | 'fixed_percentage' | 'chunks';
  segmentCount?: number; // e.g. 10 segments for 0%, 10%, ... 100% (default 10)
  chunkSize?: number; // Fallback chunk character size (default 1500)
  customEmotionWords?: EmotionWord[];
  customSegments?: ManuscriptSegment[];
  smoothingWindow?: number; // Moving average window size (e.g. 1, 3)
  chapterRegex?: RegExp;
}

export interface ChartRenderOptions {
  width?: number;
  height?: number;
  padding?: number;
  showGrid?: boolean;
  showMarkers?: boolean;
  className?: string;
}

/**
 * Built-in comprehensive Japanese Emotion Lexicon.
 */
export const DEFAULT_EMOTION_DICTIONARY: EmotionWord[] = [
  // --- Joy (喜び) +1.0 ---
  { word: '喜ぶ', category: 'joy', valence: 1.0 },
  { word: '喜び', category: 'joy', valence: 1.0 },
  { word: '嬉しい', category: 'joy', valence: 1.0 },
  { word: '嬉しさ', category: 'joy', valence: 1.0 },
  { word: '笑顔', category: 'joy', valence: 0.9 },
  { word: '笑う', category: 'joy', valence: 0.8 },
  { word: '歓喜', category: 'joy', valence: 1.0 },
  { word: '楽しむ', category: 'joy', valence: 0.9 },
  { word: '楽しい', category: 'joy', valence: 0.9 },
  { word: '幸福', category: 'joy', valence: 1.0 },
  { word: '幸せ', category: 'joy', valence: 1.0 },
  { word: '幸せ', category: 'joy', valence: 1.0 },
  { word: '晴れやか', category: 'joy', valence: 0.8 },
  { word: 'ほほ笑む', category: 'joy', valence: 0.8 },
  { word: '微笑む', category: 'joy', valence: 0.8 },

  // --- Relief (安堵) +1.0 ---
  { word: '安堵', category: 'relief', valence: 1.0 },
  { word: 'ホッとする', category: 'relief', valence: 0.9 },
  { word: 'ほっとする', category: 'relief', valence: 0.9 },
  { word: '胸を撫でおろす', category: 'relief', valence: 1.0 },
  { word: '胸をなでおろす', category: 'relief', valence: 1.0 },
  { word: '安心', category: 'relief', valence: 0.9 },
  { word: '一安心', category: 'relief', valence: 0.9 },
  { word: '安らぎ', category: 'relief', valence: 0.8 },
  { word: '救われる', category: 'relief', valence: 0.9 },

  // --- Anticipation / Hope (期待・希望) +0.8 ---
  { word: '期待', category: 'anticipation', valence: 0.8 },
  { word: '希望', category: 'anticipation', valence: 0.9 },
  { word: '楽しみにする', category: 'anticipation', valence: 0.8 },
  { word: '胸を躍らせる', category: 'anticipation', valence: 0.9 },
  { word: 'わくわく', category: 'anticipation', valence: 0.8 },
  { word: 'ワクワク', category: 'anticipation', valence: 0.8 },
  { word: '待ち望む', category: 'anticipation', valence: 0.8 },
  { word: '憧れ', category: 'anticipation', valence: 0.7 },

  // --- Love / Affection (愛着・好意) +0.9 ---
  { word: '愛する', category: 'love', valence: 1.0 },
  { word: '愛おしい', category: 'love', valence: 1.0 },
  { word: '愛しい', category: 'love', valence: 1.0 },
  { word: '好き', category: 'love', valence: 0.8 },
  { word: '慈しむ', category: 'love', valence: 0.9 },
  { word: '慕う', category: 'love', valence: 0.8 },
  { word: '親しみ', category: 'love', valence: 0.7 },
  { word: '愛着', category: 'love', valence: 0.8 },

  // --- Anger (怒り) -1.0 ---
  { word: '怒る', category: 'anger', valence: -1.0 },
  { word: '怒り', category: 'anger', valence: -1.0 },
  { word: '激怒', category: 'anger', valence: -1.0 },
  { word: '憤る', category: 'anger', valence: -1.0 },
  { word: '憤怒', category: 'anger', valence: -1.0 },
  { word: '腹を立てる', category: 'anger', valence: -0.9 },
  { word: '苛立ち', category: 'anger', valence: -0.8 },
  { word: 'いら立ち', category: 'anger', valence: -0.8 },
  { word: '怒鳴る', category: 'anger', valence: -0.9 },
  { word: '拳を握りしめる', category: 'anger', valence: -0.8 },
  { word: '睨みつける', category: 'anger', valence: -0.8 },

  // --- Sorrow / Grief (悲哀) -1.0 ---
  { word: '悲しい', category: 'sorrow', valence: -1.0 },
  { word: '悲しみ', category: 'sorrow', valence: -1.0 },
  { word: '涙', category: 'sorrow', valence: -0.8 },
  { word: '泣く', category: 'sorrow', valence: -0.9 },
  { word: '絶望', category: 'sorrow', valence: -1.0 },
  { word: '哀しみ', category: 'sorrow', valence: -1.0 },
  { word: '哀切', category: 'sorrow', valence: -0.9 },
  { word: '慟哭', category: 'sorrow', valence: -1.0 },
  { word: '嘆く', category: 'sorrow', valence: -0.9 },
  { word: '意気消沈', category: 'sorrow', valence: -0.8 },
  { word: '打ちひしがれる', category: 'sorrow', valence: -1.0 },

  // --- Fear (恐れ) -1.0 ---
  { word: '恐れる', category: 'fear', valence: -1.0 },
  { word: '恐ろしい', category: 'fear', valence: -1.0 },
  { word: '恐怖', category: 'fear', valence: -1.0 },
  { word: '怯える', category: 'fear', valence: -1.0 },
  { word: '戦慄', category: 'fear', valence: -1.0 },
  { word: '震える', category: 'fear', valence: -0.8 },
  { word: 'おののく', category: 'fear', valence: -0.9 },
  { word: '悲鳴', category: 'fear', valence: -0.9 },
  { word: '畏怖', category: 'fear', valence: -0.8 },
  { word: '蒼白', category: 'fear', valence: -0.8 },

  // --- Disgust (嫌悪) -0.9 ---
  { word: '嫌悪', category: 'disgust', valence: -0.9 },
  { word: '嫌う', category: 'disgust', valence: -0.8 },
  { word: '疎ましい', category: 'disgust', valence: -0.8 },
  { word: '憎む', category: 'disgust', valence: -1.0 },
  { word: '憎しみ', category: 'disgust', valence: -1.0 },
  { word: '蔑む', category: 'disgust', valence: -0.8 },
  { word: '不快', category: 'disgust', valence: -0.7 },

  // --- Surprise (驚愕) -0.2 ~ +0.2 ---
  { word: '驚く', category: 'surprise', valence: -0.2 },
  { word: '驚愕', category: 'surprise', valence: -0.4 },
  { word: '愕然', category: 'surprise', valence: -0.5 },
  { word: '目を見張る', category: 'surprise', valence: 0.1 },
  { word: '息をのむ', category: 'surprise', valence: -0.3 },
];

export class CharacterEmotionalArcTracker {
  private emotionDict: EmotionWord[] = [];
  private static DEFAULT_CHAPTER_REGEX = /^(?:第[一二三四五六七八九十0-9]+[章話節幕]|#+\s+|\bEpisode\s*\d+|\bChapter\s*\d+|プロローグ|エピローグ)/mi;

  constructor(customDictionary?: EmotionWord[]) {
    this.emotionDict = [...DEFAULT_EMOTION_DICTIONARY, ...(customDictionary ?? [])];
  }

  /**
   * Returns current active emotion dictionary.
   */
  public getEmotionDictionary(): EmotionWord[] {
    return [...this.emotionDict];
  }

  /**
   * Replaces emotion dictionary.
   */
  public setEmotionDictionary(dict: EmotionWord[]): void {
    this.emotionDict = [...dict];
  }

  /**
   * Adds an emotion word definition to active dictionary.
   */
  public addEmotionWord(entry: EmotionWord): void {
    this.emotionDict.push(entry);
  }

  /**
   * Segments raw text into manuscript chronological segments (by chapters, fixed percentage bins, or chunks).
   */
  public segmentText(rawText: string, options?: AnalysisOptions): ManuscriptSegment[] {
    if (options?.customSegments && options.customSegments.length > 0) {
      return options.customSegments;
    }

    if (!rawText || rawText.trim().length === 0) {
      return [];
    }

    const mode = options?.segmentationMode ?? 'chapters';

    if (mode === 'fixed_percentage') {
      const count = Math.max(1, options?.segmentCount ?? 10);
      const totalLen = rawText.length;
      const step = totalLen / count;
      const segments: ManuscriptSegment[] = [];

      for (let i = 0; i < count; i++) {
        const start = Math.floor(i * step);
        const end = i === count - 1 ? totalLen : Math.floor((i + 1) * step);
        const pct = Math.round((i / Math.max(1, count - 1)) * 100);
        segments.push({
          id: `seg-pct-${i + 1}`,
          title: `進行度 ${pct}%`,
          text: rawText.slice(start, end),
          startOffset: start,
          endOffset: end,
        });
      }
      return segments;
    }

    const regex = options?.chapterRegex ?? CharacterEmotionalArcTracker.DEFAULT_CHAPTER_REGEX;
    const lines = rawText.split('\n');
    const matches: { lineIndex: number; offset: number; title: string }[] = [];

    let currentOffset = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (regex.test(line.trim())) {
        matches.push({
          lineIndex: i,
          offset: currentOffset,
          title: line.trim().replace(/^#+\s*/, ''),
        });
      }
      currentOffset += line.length + 1;
    }

    if (matches.length === 0 || mode === 'chunks') {
      const chunkSize = options?.chunkSize ?? 1500;
      if (rawText.length <= chunkSize) {
        return [
          {
            id: 'seg-1',
            title: '全編',
            text: rawText,
            startOffset: 0,
            endOffset: rawText.length,
          },
        ];
      }

      const chunks: ManuscriptSegment[] = [];
      let idx = 0;
      for (let offset = 0; offset < rawText.length; offset += chunkSize) {
        const chunkText = rawText.slice(offset, offset + chunkSize);
        chunks.push({
          id: `seg-chunk-${idx + 1}`,
          title: `区間 ${idx + 1}`,
          text: chunkText,
          startOffset: offset,
          endOffset: offset + chunkText.length,
        });
        idx++;
      }
      return chunks;
    }

    const segments: ManuscriptSegment[] = [];
    if (matches[0].offset > 0) {
      const introText = rawText.slice(0, matches[0].offset);
      if (introText.trim().length > 0) {
        segments.push({
          id: 'seg-intro',
          title: '序文・プロローグ',
          text: introText,
          startOffset: 0,
          endOffset: matches[0].offset,
        });
      }
    }

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const start = match.offset;
      const end = i < matches.length - 1 ? matches[i + 1].offset : rawText.length;
      segments.push({
        id: `seg-${segments.length + 1}`,
        title: match.title || `第${segments.length + 1}章`,
        text: rawText.slice(start, end),
        startOffset: start,
        endOffset: end,
      });
    }

    return segments;
  }

  /**
   * Performs co-occurrence analysis of character names/aliases and emotion words in raw manuscript text.
   */
  public analyzeCoOccurrences(
    rawText: string,
    characters: CharacterDef[],
    options?: AnalysisOptions
  ): CoOccurrenceMention[] {
    if (!rawText || characters.length === 0 || this.emotionDict.length === 0) {
      return [];
    }

    const windowMode = options?.windowMode ?? 'sentence';
    const windowSize = options?.windowSize ?? 60;
    const coOccurrences: CoOccurrenceMention[] = [];

    if (windowMode === 'sentence' || windowMode === 'paragraph') {
      const delimiter = windowMode === 'sentence' ? /[。！？!?\n]+/g : /\n\n+/g;
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      const units: { text: string; start: number; end: number }[] = [];
      while ((match = delimiter.exec(rawText)) !== null) {
        const unitText = rawText.slice(lastIndex, match.index + match[0].length);
        if (unitText.trim().length > 0) {
          units.push({ text: unitText, start: lastIndex, end: lastIndex + unitText.length });
        }
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < rawText.length) {
        const remaining = rawText.slice(lastIndex);
        if (remaining.trim().length > 0) {
          units.push({ text: remaining, start: lastIndex, end: rawText.length });
        }
      }

      for (const unit of units) {
        for (const charDef of characters) {
          const names = [charDef.name, ...(charDef.aliases ?? [])].filter(Boolean);
          if (names.length === 0) continue;

          const charRegex = new RegExp(names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
          const charMatched = charRegex.test(unit.text);

          if (charMatched) {
            for (const dictEntry of this.emotionDict) {
              const emotionRegex = new RegExp(dictEntry.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
              let eMatch: RegExpExecArray | null;
              while ((eMatch = emotionRegex.exec(unit.text)) !== null) {
                const absOffset = unit.start + eMatch.index;
                coOccurrences.push({
                  characterId: charDef.id,
                  characterName: charDef.name,
                  emotionWord: dictEntry.word,
                  category: dictEntry.category,
                  valence: dictEntry.valence * (dictEntry.weight ?? 1.0),
                  offset: absOffset,
                  sentence: unit.text.trim(),
                });
              }
            }
          }
        }
      }
    } else {
      // Character window mode
      for (const charDef of characters) {
        const names = [charDef.name, ...(charDef.aliases ?? [])].filter(Boolean);
        if (names.length === 0) continue;

        const charRegex = new RegExp(names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
        let charMatch: RegExpExecArray | null;

        while ((charMatch = charRegex.exec(rawText)) !== null) {
          const matchOffset = charMatch.index;
          const winStart = Math.max(0, matchOffset - windowSize);
          const winEnd = Math.min(rawText.length, matchOffset + charMatch[0].length + windowSize);
          const windowText = rawText.slice(winStart, winEnd);

          for (const dictEntry of this.emotionDict) {
            const eRegex = new RegExp(dictEntry.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
            let eMatch: RegExpExecArray | null;
            while ((eMatch = eRegex.exec(windowText)) !== null) {
              const absOffset = winStart + eMatch.index;
              coOccurrences.push({
                characterId: charDef.id,
                characterName: charDef.name,
                emotionWord: dictEntry.word,
                category: dictEntry.category,
                valence: dictEntry.valence * (dictEntry.weight ?? 1.0),
                offset: absOffset,
                sentence: windowText.trim(),
              });
            }
          }
        }
      }
    }

    // Deduplicate identical co-occurrences at exact same characterId + offset + emotionWord
    const seen = new Set<string>();
    const uniqueList: CoOccurrenceMention[] = [];
    for (const item of coOccurrences) {
      const key = `${item.characterId}:${item.offset}:${item.emotionWord}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueList.push(item);
      }
    }

    uniqueList.sort((a, b) => a.offset - b.offset);
    return uniqueList;
  }

  /**
   * Calculates time-series progression array (0% to 100%) of emotional valence (-1.0 to +1.0) for each character.
   */
  public calculateEmotionalArc(
    rawText: string,
    characters: CharacterDef[],
    options?: AnalysisOptions
  ): { segments: ManuscriptSegment[]; series: CharacterEmotionalArcSeries[]; coOccurrences: CoOccurrenceMention[] } {
    const segments = this.segmentText(rawText, options);
    const coOccurrences = this.analyzeCoOccurrences(rawText, characters, options);

    const totalLen = Math.max(1, rawText ? rawText.length : 1);
    const seriesList: CharacterEmotionalArcSeries[] = [];

    const smoothingWindow = options?.smoothingWindow ?? 1;

    for (const charDef of characters) {
      const rawPoints: ArcProgressPoint[] = [];

      segments.forEach((seg, idx) => {
        const pct = segments.length === 1
          ? 50
          : Math.round((idx / (segments.length - 1)) * 100);

        // Filter co-occurrences within this segment's character offset bounds
        const segMentions = coOccurrences.filter(
          (co) => co.characterId === charDef.id && co.offset >= seg.startOffset && co.offset < seg.endOffset
        );

        let sumValence = 0;
        let sumAmplitude = 0;
        const breakdown: Record<string, number> = {};

        for (const m of segMentions) {
          sumValence += m.valence;
          sumAmplitude += Math.abs(m.valence);
          breakdown[m.category] = (breakdown[m.category] ?? 0) + 1;
        }

        const count = segMentions.length;
        const rawValence = count > 0 ? sumValence / count : 0;

        // Amplitude represents emotional intensity/energy level (0.0 to 1.0)
        const densityFactor = Math.min(1.0, count / 5);
        const avgMag = count > 0 ? sumAmplitude / count : 0;
        const amplitude = Number((avgMag * 0.7 + densityFactor * 0.3).toFixed(3));

        // Find dominant emotion category
        let dominantEmotion: EmotionCategory | undefined = undefined;
        let maxCategoryCount = 0;
        for (const [cat, catCount] of Object.entries(breakdown)) {
          if (catCount > maxCategoryCount) {
            maxCategoryCount = catCount;
            dominantEmotion = cat;
          }
        }

        rawPoints.push({
          progressPercentage: pct,
          segmentId: seg.id,
          segmentTitle: seg.title,
          segmentIndex: idx,
          valence: Number(rawValence.toFixed(3)),
          amplitude,
          mentionCount: count,
          dominantEmotion,
          breakdown,
        });
      });

      // Apply optional smoothing (moving average) if requested
      const smoothedPoints: ArcProgressPoint[] = rawPoints.map((pt, i) => {
        if (smoothingWindow <= 1 || rawPoints.length <= 1) return pt;

        const halfWin = Math.floor(smoothingWindow / 2);
        const winStart = Math.max(0, i - halfWin);
        const winEnd = Math.min(rawPoints.length, i + halfWin + 1);
        const subset = rawPoints.slice(winStart, winEnd);

        const activeSubset = subset.filter((p) => p.mentionCount > 0);
        if (activeSubset.length === 0) return pt;

        const avgVal = activeSubset.reduce((acc, p) => acc + p.valence, 0) / activeSubset.length;
        const avgAmp = activeSubset.reduce((acc, p) => acc + p.amplitude, 0) / activeSubset.length;

        return {
          ...pt,
          valence: Number(avgVal.toFixed(3)),
          amplitude: Number(avgAmp.toFixed(3)),
        };
      });

      const valences = smoothedPoints.map((p) => p.valence);
      const activeValences = smoothedPoints.filter((p) => p.mentionCount > 0).map((p) => p.valence);

      const totalMentions = smoothedPoints.reduce((acc, p) => acc + p.mentionCount, 0);
      const avgValence = activeValences.length > 0
        ? Number((activeValences.reduce((acc, v) => acc + v, 0) / activeValences.length).toFixed(3))
        : 0;

      const maxValence = valences.length > 0 ? Math.max(...valences) : 0;
      const minValence = valences.length > 0 ? Math.min(...valences) : 0;

      seriesList.push({
        character: charDef,
        points: smoothedPoints,
        averageValence: avgValence,
        maxValence,
        minValence,
        totalMentions,
      });
    }

    return { segments, series: seriesList, coOccurrences };
  }

  /**
   * Automatically identifies climax points (maximum emotional amplitude) and catharsis points (dramatic turning/recovery).
   */
  public detectClimaxAndCatharsis(seriesList: CharacterEmotionalArcSeries[]): {
    climaxPoints: ClimaxPoint[];
    catharsisPoints: ClimaxPoint[];
  } {
    const climaxPoints: ClimaxPoint[] = [];
    const catharsisPoints: ClimaxPoint[] = [];

    for (const series of seriesList) {
      const points = series.points;
      if (points.length === 0) continue;

      // 1. Climax Detection: Highest amplitude / valence magnitude peak
      let maxAmp = -1;
      let climaxPt: ArcProgressPoint | null = null;

      for (const pt of points) {
        if (pt.mentionCount > 0 && pt.amplitude > maxAmp) {
          maxAmp = pt.amplitude;
          climaxPt = pt;
        }
      }

      if (climaxPt && maxAmp > 0) {
        climaxPoints.push({
          characterId: series.character.id,
          characterName: series.character.name,
          progressPercentage: climaxPt.progressPercentage,
          segmentId: climaxPt.segmentId,
          segmentTitle: climaxPt.segmentTitle,
          valence: climaxPt.valence,
          amplitude: climaxPt.amplitude,
          type: 'climax',
          score: Number((maxAmp * 100).toFixed(1)),
          description: `【クライマックス】感情振幅が最大（進行度 ${climaxPt.progressPercentage}%、${climaxPt.segmentTitle}）。主要感情: ${climaxPt.dominantEmotion ?? '複合'}`,
        });
      }

      // 2. Catharsis Detection: Dramatic shift from negative valence to sharp positive recovery
      let maxCatharsisSwing = 0;
      let catharsisPt: ArcProgressPoint | null = null;

      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];

        // Recovery swing: prev negative valence -> curr positive valence
        if (prev.valence < -0.1 && curr.valence > 0.1) {
          const swing = curr.valence - prev.valence;
          if (swing > maxCatharsisSwing) {
            maxCatharsisSwing = swing;
            catharsisPt = curr;
          }
        }
      }

      // Fallback: If no strict negative-to-positive crossover, look for highest positive recovery swing after low point
      if (!catharsisPt) {
        for (let i = 1; i < points.length; i++) {
          const prev = points[i - 1];
          const curr = points[i];
          const swing = curr.valence - prev.valence;
          if (swing >= 0.8 && curr.valence > 0.3) {
            if (swing > maxCatharsisSwing) {
              maxCatharsisSwing = swing;
              catharsisPt = curr;
            }
          }
        }
      }

      if (catharsisPt) {
        catharsisPoints.push({
          characterId: series.character.id,
          characterName: series.character.name,
          progressPercentage: catharsisPt.progressPercentage,
          segmentId: catharsisPt.segmentId,
          segmentTitle: catharsisPt.segmentTitle,
          valence: catharsisPt.valence,
          amplitude: catharsisPt.amplitude,
          type: 'catharsis',
          score: Number((maxCatharsisSwing * 100).toFixed(1)),
          description: `【カタルシス】負の感情からのドラマチックな感情反転・昇華（進行度 ${catharsisPt.progressPercentage}%、${catharsisPt.segmentTitle}）。感情価: ${catharsisPt.valence > 0 ? '+' : ''}${catharsisPt.valence}`,
        });
      }
    }

    return { climaxPoints, catharsisPoints };
  }

  /**
   * Main entry point: Performs complete emotional arc analysis across all specified characters.
   */
  public analyze(
    rawText: string,
    characters: CharacterDef[],
    options?: AnalysisOptions
  ): EmotionalArcAnalysisResult {
    const { segments, series, coOccurrences } = this.calculateEmotionalArc(rawText, characters, options);
    const { climaxPoints, catharsisPoints } = this.detectClimaxAndCatharsis(series);

    return {
      characters,
      series,
      climaxPoints,
      catharsisPoints,
      totalManuscriptLength: rawText ? rawText.length : 0,
      coOccurrences,
      segments,
    };
  }

  /**
   * Visual Utility: Renders SVG Emotional Arc Line Chart for Plotailor IDE 3-Pane visual display.
   */
  public renderSvgArcChart(
    result: EmotionalArcAnalysisResult,
    options?: ChartRenderOptions
  ): string {
    const width = options?.width ?? 600;
    const height = options?.height ?? 240;
    const padding = options?.padding ?? 30;
    const showGrid = options?.showGrid ?? true;
    const showMarkers = options?.showMarkers ?? true;
    const className = options?.className ?? 'emotional-arc-svg-chart';

    const innerW = width - padding * 2;
    const innerH = height - padding * 2;
    const midY = height / 2; // Valence = 0.0 line

    let svg = `<svg class="${className}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="キャラクター感情曲線（エモーショナルアーク）">`;

    // 1. Grid & Axes
    if (showGrid) {
      svg += `<line x1="${padding}" y1="${midY}" x2="${width - padding}" y2="${midY}" stroke="var(--border-muted, #444)" stroke-dasharray="3,3" stroke-width="1.5" opacity="0.6"/>`;
      svg += `<text x="${padding - 5}" y="${padding + 5}" font-size="10" fill="#888" text-anchor="end">+1.0</text>`;
      svg += `<text x="${padding - 5}" y="${midY + 3}" font-size="10" fill="#888" text-anchor="end">0.0</text>`;
      svg += `<text x="${padding - 5}" y="${height - padding}" font-size="10" fill="#888" text-anchor="end">-1.0</text>`;
    }

    const defaultColors = ['#e63946', '#457b9d', '#2a9d8f', '#e76f51', '#9b5de5'];

    // 2. Render Character Series Lines
    result.series.forEach((s, idx) => {
      const color = s.character.color ?? defaultColors[idx % defaultColors.length];
      const pts = s.points;
      if (pts.length === 0) return;

      const coords = pts.map((pt, pIdx) => {
        const x = pts.length === 1
          ? width / 2
          : padding + (pIdx / (pts.length - 1)) * innerW;
        // Map valence [-1.0, +1.0] to Y [height - padding, padding]
        const y = midY - (pt.valence * (innerH / 2));
        return { x, y, pt };
      });

      const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');

      svg += `<path d="${pathD}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;

      // Draw points
      coords.forEach((c) => {
        svg += `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3" fill="${color}"><title>${s.character.name} (進行度 ${c.pt.progressPercentage}%): 感情価 ${c.pt.valence}</title></circle>`;
      });
    });

    // 3. Render Climax & Catharsis Markers
    if (showMarkers) {
      result.climaxPoints.forEach((cp) => {
        const x = padding + (cp.progressPercentage / 100) * innerW;
        const y = midY - (cp.valence * (innerH / 2));
        svg += `<g class="climax-marker">
          <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="#ffb703" stroke="#fff" stroke-width="1.5"/>
          <text x="${x.toFixed(1)}" y="${(y - 10).toFixed(1)}" font-size="10" font-weight="bold" fill="#ffb703" text-anchor="middle">⚡クライマックス</text>
        </g>`;
      });

      result.catharsisPoints.forEach((cp) => {
        const x = padding + (cp.progressPercentage / 100) * innerW;
        const y = midY - (cp.valence * (innerH / 2));
        svg += `<g class="catharsis-marker">
          <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="#2a9d8f" stroke="#fff" stroke-width="1.5"/>
          <text x="${x.toFixed(1)}" y="${(y + 18).toFixed(1)}" font-size="10" font-weight="bold" fill="#2a9d8f" text-anchor="middle">✨カタルシス</text>
        </g>`;
      });
    }

    svg += `</svg>`;
    return svg;
  }
}
