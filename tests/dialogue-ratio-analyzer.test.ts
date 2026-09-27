import { describe, it, expect } from 'vitest';
import {
  stripAozoraMarkup,
  extractTextSegments,
  analyzeParagraph,
  analyzeChapter,
  analyzeDocument,
  DEFAULT_DIALOGUE_RATIO_CONFIG,
  ThreePaneWorkspace,
} from '../src/index.js';

describe('DialogueRatioAnalyzer - Pure Function Unit Tests', () => {
  describe('stripAozoraMarkup()', () => {
    it('returns empty string for empty input', () => {
      expect(stripAozoraMarkup('')).toBe('');
    });

    it('returns unmodified text if no Aozora markup is present', () => {
      const text = '王都の夜空には二つの月が冷たく輝いていた。';
      expect(stripAozoraMarkup(text)).toBe(text);
    });

    it('strips explicit and implicit Aozora ruby markup', () => {
      const explicit = '｜ヴァレリウス《ばれりうす》将軍';
      expect(stripAozoraMarkup(explicit)).toBe('ヴァレリウス将軍');

      const implicit = '漢字《かんじ》の例';
      expect(stripAozoraMarkup(implicit)).toBe('漢字の例');
    });

    it('strips bouten markers and formatting commands', () => {
      const bouten = 'それは《《極めて重要》》な［＃「伏線」に傍点］である〔ルビ下がり〕。';
      expect(stripAozoraMarkup(bouten)).toBe('それは極めて重要なである。');
    });
  });

  describe('extractTextSegments()', () => {
    it('handles empty text', () => {
      const res = extractTextSegments('');
      expect(res.dialogueSegments).toEqual([]);
      expect(res.narrativeSegments).toEqual([]);
      expect(res.dialogueCharCount).toBe(0);
      expect(res.narrativeCharCount).toBe(0);
    });

    it('separates narrative and dialogue enclosed in 「」 and 『』', () => {
      const text = '「準備はいいか」と彼は問い、『当然だ』と答えた。';
      const res = extractTextSegments(text);

      expect(res.dialogueSegments).toEqual(['準備はいいか', '当然だ']);
      expect(res.narrativeSegments).toEqual(['と彼は問い、', 'と答えた。']);
      expect(res.dialogueCharCount).toBe(6 + 3); // 9 chars
      expect(res.narrativeCharCount).toBe(6 + 5); // 11 chars
    });

    it('handles unclosed brackets gracefully', () => {
      const text = '「途中で切れた会話';
      const res = extractTextSegments(text);

      expect(res.dialogueSegments).toEqual(['途中で切れた会話']);
      expect(res.dialogueCharCount).toBe(8);
      expect(res.narrativeCharCount).toBe(0);
    });
  });

  describe('analyzeParagraph()', () => {
    it('analyzes pure narrative paragraph as NARRATIVE_HEAVY', () => {
      const text = '崩落の轟音が去り、封印の祭壇には冷たい静寂だけが残されていた。';
      const res = analyzeParagraph(text, 0);

      expect(res.dialogueCharCount).toBe(0);
      expect(res.narrativeCharCount).toBe(31);
      expect(res.totalCharCount).toBe(31);
      expect(res.dialogueRatio).toBe(0);
      expect(res.narrativeRatio).toBe(1.0);
      expect(res.pacingStatus).toBe('NARRATIVE_HEAVY');
      expect(res.isNarrativeOnly).toBe(true);
      expect(res.isDialogueOnly).toBe(false);
    });

    it('analyzes pure dialogue paragraph as DIALOGUE_DENSE', () => {
      const text = '「ここまで来れば、追手も諦めるかしら」';
      const res = analyzeParagraph(text, 1);

      expect(res.dialogueCharCount).toBe(17);
      expect(res.narrativeCharCount).toBe(0);
      expect(res.dialogueRatio).toBe(1.0);
      expect(res.pacingStatus).toBe('DIALOGUE_DENSE');
      expect(res.isDialogueOnly).toBe(true);
      expect(res.isNarrativeOnly).toBe(false);
    });

    it('analyzes mixed text with balanced golden ratio pacing', () => {
      // Dialogue: 16 chars, Narrative: 14 chars -> ratio 16/30 = 0.533 (BALANCED)
      const text = '「ここまで来れば追手も諦めるかしら」と彼女は小さく吐息をついた。';
      const res = analyzeParagraph(text, 2);

      expect(res.dialogueCharCount).toBe(16);
      expect(res.narrativeCharCount).toBe(14);
      expect(res.pacingStatus).toBe('BALANCED');
    });

    it('respects custom threshold configuration', () => {
      const text = '「会話文」と地の文テキスト。'; // dialogue 3 chars, narrative 8 chars -> ratio 3/11 = 0.27
      const customConfig = {
        denseDialogueRatioThreshold: 0.20, // Lower threshold so 0.27 becomes DIALOGUE_DENSE
      };
      const res = analyzeParagraph(text, 0, customConfig);
      expect(res.pacingStatus).toBe('DIALOGUE_DENSE');
    });

    it('handles empty paragraph text gracefully', () => {
      const res = analyzeParagraph('', 0);
      expect(res.totalCharCount).toBe(0);
      expect(res.dialogueRatio).toBe(0);
      expect(res.pacingStatus).toBe('BALANCED');
    });

    it('strips Aozora ruby during paragraph analysis when enabled', () => {
      const text = '「｜紫電の剣《しでんのけん》を受け取れ」'; // "紫電の剣を受け取れ" = 9 chars
      const res = analyzeParagraph(text, 0, { stripAozoraMarkup: true });

      expect(res.dialogueCharCount).toBe(9);
      expect(res.cleanText).toBe('「紫電の剣を受け取れ」');
    });
  });

  describe('analyzeChapter()', () => {
    it('aggregates paragraph analyses and determines chapter pacing', () => {
      const chapterText = `
崩落の轟音が去り、封印の祭壇には冷たい静寂だけが残されていた。
「ここまで来れば、追手も諦めるかしら」
「息を整えたら出発するぞ。入口まではまだ距離がある」とカインは応えた。
      `.trim();

      const chapter = analyzeChapter(chapterText, '第1章', 1);

      expect(chapter.chapterTitle).toBe('第1章');
      expect(chapter.paragraphAnalyses.length).toBe(3);
      expect(chapter.totalCharCount).toBeGreaterThan(0);
      expect(chapter.overallDialogueRatio).toBeGreaterThan(0);
      expect(chapter.overallDialogueRatio).toBeLessThan(1.0);
    });

    it('flags DIALOGUE_DENSE diagnostic when consecutive dialogue paragraphs exceed threshold', () => {
      const denseText = `
「一つ目の台詞」
「二つ目の台詞」
「三つ目の台詞」
「四つ目の台詞」
「五つ目の台詞」
      `.trim();

      const chapter = analyzeChapter(denseText, '会話連続章', 0, {
        maxConsecutiveDialogueParagraphs: 4,
      });

      expect(chapter.overallPacingStatus).toBe('DIALOGUE_DENSE');
      expect(chapter.diagnostics.length).toBe(1);
      expect(chapter.diagnostics[0].type).toBe('DIALOGUE_DENSE');
      expect(chapter.diagnostics[0].severity).toBe('warning');
      expect(chapter.diagnostics[0].message).toContain('会話文が5行連続して過密です');
    });

    it('flags NARRATIVE_HEAVY diagnostic when consecutive narrative characters exceed threshold', () => {
      // Long narrative block > 100 chars
      const longNarrative = 'あ'.repeat(120);
      const chapter = analyzeChapter(longNarrative, '説明過多章', 0, {
        maxNarrativeCharsWithoutDialogue: 100,
      });

      expect(chapter.overallPacingStatus).toBe('NARRATIVE_HEAVY');
      expect(chapter.diagnostics.length).toBe(1);
      expect(chapter.diagnostics[0].type).toBe('NARRATIVE_HEAVY');
      expect(chapter.diagnostics[0].severity).toBe('info');
      expect(chapter.diagnostics[0].message).toContain('地の文が120文字連続し説明過多です');
    });

    it('flushes streak diagnostics at end of chapter if streak extends to last paragraph', () => {
      const denseText = `
地の文の挿入。
「会話一」
「会話二」
「会話三」
「会話四」
      `.trim();

      const chapter = analyzeChapter(denseText, '章末連続章', 0, {
        maxConsecutiveDialogueParagraphs: 4,
      });

      expect(chapter.diagnostics.length).toBe(1);
      expect(chapter.diagnostics[0].type).toBe('DIALOGUE_DENSE');
      expect(chapter.diagnostics[0].paragraphRange).toEqual([1, 4]);
    });
  });

  describe('analyzeDocument()', () => {
    it('handles empty manuscript text', () => {
      const doc = analyzeDocument('');
      expect(doc.chapters.length).toBe(0);
      expect(doc.totalCharCount).toBe(0);
      expect(doc.overallDialogueRatio).toBe(0);
      expect(doc.overallPacingStatus).toBe('BALANCED');
      expect(doc.diagnostics.length).toBe(0);
    });

    it('analyzes multi-chapter document and aggregates metrics and diagnostics', () => {
      const docText = `
第1章 旅立ち
王都の夜空には二つの月が冷たく輝いていた。
「ここから始まるのか」

第2章 遭遇
「止まれ！」
「誰だ！」
「名を名乗れ！」
「答える必要はない！」
      `.trim();

      const doc = analyzeDocument(docText, {
        maxConsecutiveDialogueParagraphs: 3,
      });

      expect(doc.chapters.length).toBe(2);
      expect(doc.chapters[0].chapterTitle).toBe('第1章 旅立ち');
      expect(doc.chapters[1].chapterTitle).toBe('第2章 遭遇');

      expect(doc.totalCharCount).toBeGreaterThan(0);
      expect(doc.overallDialogueRatio).toBeGreaterThan(0);
      expect(doc.diagnostics.length).toBeGreaterThan(0);
      expect(doc.diagnostics.some((d) => d.type === 'DIALOGUE_DENSE')).toBe(true);
    });
  });

  describe('ThreePaneWorkspace Integration', () => {
    it('updates pacing analysis on text change and renders pacing inspector in right pane', () => {
      const workspace = new ThreePaneWorkspace();

      workspace.onTextChange('「いざ勝負！」と剣を構えた。', false);

      const state = workspace.getState();
      expect(state.pacingAnalysis).toBeDefined();
      expect(state.pacingAnalysis.totalCharCount).toBeGreaterThan(0);

      workspace.setRightTab('pacing-inspector');
      const model = workspace.renderWorkspaceModel();

      expect(model.rightPane.activeTab).toBe('pacing-inspector');
      expect(model.rightPane.contentHtml).toContain('会話比率:');
      expect(model.rightPane.contentHtml).toContain('テンポ判定:');
    });
  });
});
