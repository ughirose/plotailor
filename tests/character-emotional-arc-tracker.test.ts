import { describe, it, expect, beforeEach } from 'vitest';
import {
  CharacterEmotionalArcTracker,
  DEFAULT_EMOTION_DICTIONARY,
  type CharacterDef,
  type EmotionWord,
} from '../src/core/editor/CharacterEmotionalArcTracker.js';

describe('CharacterEmotionalArcTracker', () => {
  let tracker: CharacterEmotionalArcTracker;

  const sampleCharacters: CharacterDef[] = [
    { id: 'c1', name: '太郎', aliases: ['タロウ', '主人公'], color: '#e63946' },
    { id: 'c2', name: '花子', aliases: ['ハナコ', 'ヒロイン'], color: '#457b9d' },
  ];

  const sampleManuscript = `
第1章 旅立ち
太郎は新しい冒険に期待を膨らませ、胸を躍らせた。
花子も笑顔で嬉しそうに頷く。

第2章 試練
突然の魔物の襲来に太郎は恐怖で身体が震える。
花子は悲鳴をあげ、悲しみの涙を流した。太郎は激怒し、拳を握りしめて立ち向かった。

第3章 カタルシス
激闘の末、魔物を倒した太郎と花子は安堵し、胸を撫でおろした。
太郎と花子は笑顔を交わし、未来への希望を取り戻して歓喜に包まれた。
`;

  beforeEach(() => {
    tracker = new CharacterEmotionalArcTracker();
  });

  describe('Emotion Lexicon Management', () => {
    it('initializes with comprehensive default Japanese emotion dictionary', () => {
      const dict = tracker.getEmotionDictionary();
      expect(dict.length).toBeGreaterThan(30);

      const joyWord = dict.find((d) => d.word === '喜び');
      expect(joyWord).toBeDefined();
      expect(joyWord?.category).toBe('joy');
      expect(joyWord?.valence).toBe(1.0);

      const angerWord = dict.find((d) => d.word === '激怒');
      expect(angerWord).toBeDefined();
      expect(angerWord?.category).toBe('anger');
      expect(angerWord?.valence).toBe(-1.0);
    });

    it('allows adding and overriding custom emotion terms', () => {
      const customWord: EmotionWord = {
        word: '意気揚々',
        category: 'joy',
        valence: 0.9,
      };
      tracker.addEmotionWord(customWord);

      const updatedDict = tracker.getEmotionDictionary();
      expect(updatedDict.some((w) => w.word === '意気揚々')).toBe(true);
    });

    it('allows replacing dictionary completely', () => {
      tracker.setEmotionDictionary([
        { word: 'ハッピー', category: 'joy', valence: 1.0 },
      ]);
      const dict = tracker.getEmotionDictionary();
      expect(dict.length).toBe(1);
      expect(dict[0].word).toBe('ハッピー');
    });
  });

  describe('Co-occurrence Analysis', () => {
    it('extracts character name and alias co-occurrences with emotion vocabulary', () => {
      const mentions = tracker.analyzeCoOccurrences(sampleManuscript, sampleCharacters);
      expect(mentions.length).toBeGreaterThan(0);

      // Check Taro's co-occurrence with expectation/joy in Ch 1
      const taroJoy = mentions.find(
        (m) => m.characterId === 'c1' && (m.emotionWord === '期待' || m.emotionWord === '胸を躍らせる')
      );
      expect(taroJoy).toBeDefined();
      expect(taroJoy?.characterName).toBe('太郎');
      expect(taroJoy?.valence).toBeGreaterThan(0);

      // Check Hanako's co-occurrence with smile/joy in Ch 1
      const hanakoJoy = mentions.find(
        (m) => m.characterId === 'c2' && (m.emotionWord === '笑顔' || m.emotionWord === '嬉しい')
      );
      expect(hanakoJoy).toBeDefined();
      expect(hanakoJoy?.characterName).toBe('花子');
    });

    it('supports character window mode for co-occurrence', () => {
      const mentions = tracker.analyzeCoOccurrences(sampleManuscript, sampleCharacters, {
        windowMode: 'character_window',
        windowSize: 40,
      });
      expect(mentions.length).toBeGreaterThan(0);
    });
  });

  describe('Time-series Progression & Valence Calculation', () => {
    it('segments manuscript into chapters and calculates 0%-100% time-series valence', () => {
      const result = tracker.analyze(sampleManuscript, sampleCharacters);

      expect(result.segments.length).toBe(3);
      expect(result.series.length).toBe(2);

      const taroSeries = result.series.find((s) => s.character.id === 'c1');
      expect(taroSeries).toBeDefined();
      expect(taroSeries?.points.length).toBe(3);

      // Check progress percentage progression
      const p0 = taroSeries!.points[0];
      const p1 = taroSeries!.points[1];
      const p2 = taroSeries!.points[2];

      expect(p0.progressPercentage).toBe(0);
      expect(p1.progressPercentage).toBe(50);
      expect(p2.progressPercentage).toBe(100);

      // Ch 1 (Joy/Hope) should have positive valence
      expect(p0.valence).toBeGreaterThan(0);

      // Ch 2 (Fear/Anger) should have negative valence
      expect(p1.valence).toBeLessThan(0);

      // Ch 3 (Relief/Joy) should be positive
      expect(p2.valence).toBeGreaterThan(0);
    });

    it('supports fixed percentage segmentation mode (e.g. 10 bins)', () => {
      const result = tracker.analyze(sampleManuscript, sampleCharacters, {
        segmentationMode: 'fixed_percentage',
        segmentCount: 5,
      });

      expect(result.segments.length).toBe(5);
      const taroSeries = result.series.find((s) => s.character.id === 'c1');
      expect(taroSeries?.points.length).toBe(5);
      expect(taroSeries?.points[0].progressPercentage).toBe(0);
      expect(taroSeries?.points[4].progressPercentage).toBe(100);
    });

    it('applies moving average smoothing when specified', () => {
      const unsmoothed = tracker.analyze(sampleManuscript, sampleCharacters, {
        smoothingWindow: 1,
      });
      const smoothed = tracker.analyze(sampleManuscript, sampleCharacters, {
        smoothingWindow: 3,
      });

      expect(unsmoothed.series.length).toBe(2);
      expect(smoothed.series.length).toBe(2);
    });
  });

  describe('Climax & Catharsis Point Automatic Detection', () => {
    it('identifies climax point at peak emotional amplitude', () => {
      const result = tracker.analyze(sampleManuscript, sampleCharacters);

      expect(result.climaxPoints.length).toBeGreaterThan(0);

      const taroClimax = result.climaxPoints.find((cp) => cp.characterId === 'c1');
      expect(taroClimax).toBeDefined();
      expect(taroClimax?.type).toBe('climax');
      expect(taroClimax?.amplitude).toBeGreaterThan(0);
      expect(taroClimax?.description).toContain('【クライマックス】');
    });

    it('identifies catharsis point at dramatic negative-to-positive recovery turning point', () => {
      const result = tracker.analyze(sampleManuscript, sampleCharacters);

      expect(result.catharsisPoints.length).toBeGreaterThan(0);

      const taroCatharsis = result.catharsisPoints.find((cp) => cp.characterId === 'c1');
      expect(taroCatharsis).toBeDefined();
      expect(taroCatharsis?.type).toBe('catharsis');
      expect(taroCatharsis?.progressPercentage).toBe(100);
      expect(taroCatharsis?.description).toContain('【カタルシス】');
    });
  });

  describe('SVG Arc Line Chart Rendering', () => {
    it('renders valid SVG line chart markup containing climax and catharsis visual markers', () => {
      const result = tracker.analyze(sampleManuscript, sampleCharacters);
      const svg = tracker.renderSvgArcChart(result);

      expect(svg).toContain('<svg');
      expect(svg).toContain('class="emotional-arc-svg-chart"');
      expect(svg).toContain('⚡クライマックス');
      expect(svg).toContain('✨カタルシス');
      expect(svg).toContain('</svg>');
    });
  });

  describe('Edge Cases', () => {
    it('handles empty manuscript text gracefully', () => {
      const result = tracker.analyze('', sampleCharacters);
      expect(result.segments.length).toBe(0);
      expect(result.series.length).toBe(2);
      expect(result.climaxPoints.length).toBe(0);
      expect(result.catharsisPoints.length).toBe(0);
    });

    it('handles characters with no mentions in text', () => {
      const unmentionedChar: CharacterDef = { id: 'c3', name: '次郎' };
      const result = tracker.analyze(sampleManuscript, [...sampleCharacters, unmentionedChar]);

      const jiroSeries = result.series.find((s) => s.character.id === 'c3');
      expect(jiroSeries).toBeDefined();
      expect(jiroSeries?.totalMentions).toBe(0);
      expect(jiroSeries?.averageValence).toBe(0);
    });
  });
});
