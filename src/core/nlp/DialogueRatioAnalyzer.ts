/**
 * DialogueRatioAnalyzer - Pure Function Core Engine for Dialogue Ratio & Pacing Analysis
 *
 * Computes dialogue (会話文: 「」/『』) vs narrative (地の文) character count ratios
 * for paragraphs, chapters, and full manuscript documents.
 *
 * Features:
 * - Pure functions with zero side-effects.
 * - Handles Japanese quote brackets (「」, 『』) and optional Aozora markup stripping.
 * - Evaluates pacing status: BALANCED (黄金比), DIALOGUE_DENSE (会話過密), NARRATIVE_HEAVY (説明過多).
 * - Identifies dense dialogue streaks and long narrative explanation blocks.
 */

export type PacingStatus = 'BALANCED' | 'DIALOGUE_DENSE' | 'NARRATIVE_HEAVY';

export interface DialogueBracket {
  open: string;
  close: string;
}

export interface DialogueRatioConfig {
  /** Upper ratio threshold above which dialogue is considered dense (default: 0.70 = 70%) */
  denseDialogueRatioThreshold?: number;
  /** Lower ratio threshold below which text is considered narrative heavy (default: 0.15 = 15%) */
  heavyNarrativeRatioThreshold?: number;
  /** Maximum consecutive dialogue-only paragraphs before triggering a DIALOGUE_DENSE diagnostic (default: 4) */
  maxConsecutiveDialogueParagraphs?: number;
  /** Maximum consecutive narrative characters without dialogue before triggering a NARRATIVE_HEAVY diagnostic (default: 500) */
  maxNarrativeCharsWithoutDialogue?: number;
  /** Brackets used to identify dialogue (default: 「」 and 『』) */
  brackets?: DialogueBracket[];
  /** Whether to strip Aozora ruby/bouten markup before counting characters (default: true) */
  stripAozoraMarkup?: boolean;
}

export const DEFAULT_DIALOGUE_RATIO_CONFIG: Required<DialogueRatioConfig> = {
  denseDialogueRatioThreshold: 0.70,
  heavyNarrativeRatioThreshold: 0.15,
  maxConsecutiveDialogueParagraphs: 4,
  maxNarrativeCharsWithoutDialogue: 500,
  brackets: [
    { open: '「', close: '」' },
    { open: '『', close: '』' },
  ],
  stripAozoraMarkup: true,
};

export interface ParagraphAnalysis {
  paragraphIndex: number;
  rawText: string;
  cleanText: string;
  dialogueCharCount: number;
  narrativeCharCount: number;
  totalCharCount: number;
  dialogueRatio: number;
  narrativeRatio: number;
  dialogueCount: number;
  pacingStatus: PacingStatus;
  isDialogueOnly: boolean;
  isNarrativeOnly: boolean;
}

export interface PacingDiagnostic {
  id: string;
  type: 'DIALOGUE_DENSE' | 'NARRATIVE_HEAVY';
  severity: 'warning' | 'info';
  startIndex: number;
  endIndex: number;
  paragraphRange: [number, number];
  message: string;
  ratio: number;
}

export interface ChapterAnalysis {
  chapterTitle: string;
  chapterIndex: number;
  paragraphAnalyses: ParagraphAnalysis[];
  totalDialogueCharCount: number;
  totalNarrativeCharCount: number;
  totalCharCount: number;
  overallDialogueRatio: number;
  overallNarrativeRatio: number;
  overallPacingStatus: PacingStatus;
  diagnostics: PacingDiagnostic[];
}

export interface DocumentAnalysis {
  chapters: ChapterAnalysis[];
  totalDialogueCharCount: number;
  totalNarrativeCharCount: number;
  totalCharCount: number;
  overallDialogueRatio: number;
  overallNarrativeRatio: number;
  overallPacingStatus: PacingStatus;
  diagnostics: PacingDiagnostic[];
}

/**
 * Helper: Strips Aozora markup (ruby, bouten, markers) to compute accurate reading character count.
 */
export function stripAozoraMarkup(text: string): string {
  if (!text) return '';
  return text
    // Strip ｜漢字《かんじ》 or 漢字《かんじ》
    .replace(/(?:｜([^《\n\r]+)《[^》\n\r]+》|([\u4E00-\u9FFF々〆ヵヶ]+)《[^》\n\r]+》)/g, (_m, p1, p2) => p1 || p2)
    // Strip 《《傍点》》
    .replace(/《《([^》\n\r]+)》》/g, '$1')
    // Strip ［＃...］ formatting commands
    .replace(/［＃[^］\n\r]+］/g, '')
    // Strip 〔...〕 ruby sagari
    .replace(/〔[^〕\n\r]+〕/g, '');
}

/**
 * Extracts dialogue and narrative text segments from a text string.
 */
export function extractTextSegments(
  text: string,
  brackets: DialogueBracket[] = DEFAULT_DIALOGUE_RATIO_CONFIG.brackets
): {
  dialogueSegments: string[];
  narrativeSegments: string[];
  dialogueCharCount: number;
  narrativeCharCount: number;
} {
  const dialogueSegments: string[] = [];
  const narrativeSegments: string[] = [];
  let dialogueCharCount = 0;
  let narrativeCharCount = 0;

  if (!text) {
    return { dialogueSegments, narrativeSegments, dialogueCharCount, narrativeCharCount };
  }

  const openChars = new Set(brackets.map((b) => b.open));
  const closeToOpenMap = new Map(brackets.map((b) => [b.close, b.open]));

  let insideDialogue = false;
  let currentOpenBracket: string | null = null;
  let currentSegment = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (!insideDialogue) {
      if (openChars.has(char)) {
        if (currentSegment.length > 0) {
          narrativeSegments.push(currentSegment);
          const cleanNarrative = currentSegment.replace(/[\s\r\n]/g, '');
          narrativeCharCount += cleanNarrative.length;
          currentSegment = '';
        }
        insideDialogue = true;
        currentOpenBracket = char;
      } else {
        currentSegment += char;
      }
    } else {
      if (closeToOpenMap.get(char) === currentOpenBracket) {
        dialogueSegments.push(currentSegment);
        const cleanDialogue = currentSegment.replace(/[\s\r\n]/g, '');
        dialogueCharCount += cleanDialogue.length;
        currentSegment = '';
        insideDialogue = false;
        currentOpenBracket = null;
      } else {
        currentSegment += char;
      }
    }
  }

  if (currentSegment.length > 0) {
    if (insideDialogue) {
      dialogueSegments.push(currentSegment);
      const cleanDialogue = currentSegment.replace(/[\s\r\n]/g, '');
      dialogueCharCount += cleanDialogue.length;
    } else {
      narrativeSegments.push(currentSegment);
      const cleanNarrative = currentSegment.replace(/[\s\r\n]/g, '');
      narrativeCharCount += cleanNarrative.length;
    }
  }

  return {
    dialogueSegments,
    narrativeSegments,
    dialogueCharCount,
    narrativeCharCount,
  };
}

/**
 * Pure function: Analyzes a single paragraph text.
 */
export function analyzeParagraph(
  rawText: string,
  paragraphIndex: number = 0,
  config: DialogueRatioConfig = {}
): ParagraphAnalysis {
  const mergedConfig = { ...DEFAULT_DIALOGUE_RATIO_CONFIG, ...config };
  const cleanText = mergedConfig.stripAozoraMarkup ? stripAozoraMarkup(rawText) : rawText;

  const { dialogueSegments, dialogueCharCount, narrativeCharCount } = extractTextSegments(
    cleanText,
    mergedConfig.brackets
  );

  const totalCharCount = dialogueCharCount + narrativeCharCount;
  const dialogueRatio = totalCharCount > 0 ? dialogueCharCount / totalCharCount : 0;
  const narrativeRatio = totalCharCount > 0 ? narrativeCharCount / totalCharCount : 0;

  let pacingStatus: PacingStatus = 'BALANCED';
  if (totalCharCount > 0) {
    if (dialogueRatio >= mergedConfig.denseDialogueRatioThreshold) {
      pacingStatus = 'DIALOGUE_DENSE';
    } else if (dialogueRatio <= mergedConfig.heavyNarrativeRatioThreshold) {
      pacingStatus = 'NARRATIVE_HEAVY';
    }
  }

  const isDialogueOnly = dialogueCharCount > 0 && narrativeCharCount === 0;
  const isNarrativeOnly = narrativeCharCount > 0 && dialogueCharCount === 0;

  return {
    paragraphIndex,
    rawText,
    cleanText,
    dialogueCharCount,
    narrativeCharCount,
    totalCharCount,
    dialogueRatio,
    narrativeRatio,
    dialogueCount: dialogueSegments.length,
    pacingStatus,
    isDialogueOnly,
    isNarrativeOnly,
  };
}

/**
 * Pure function: Analyzes a chapter or text section consisting of paragraphs.
 */
export function analyzeChapter(
  chapterText: string,
  chapterTitle: string = '第1章',
  chapterIndex: number = 0,
  config: DialogueRatioConfig = {}
): ChapterAnalysis {
  const mergedConfig = { ...DEFAULT_DIALOGUE_RATIO_CONFIG, ...config };

  // Split text into paragraphs by newline
  const rawParagraphs = chapterText.split(/\r?\n/).filter((p) => p.trim().length > 0);

  const paragraphAnalyses: ParagraphAnalysis[] = rawParagraphs.map((para, idx) =>
    analyzeParagraph(para, idx, mergedConfig)
  );

  let totalDialogueCharCount = 0;
  let totalNarrativeCharCount = 0;

  paragraphAnalyses.forEach((p) => {
    totalDialogueCharCount += p.dialogueCharCount;
    totalNarrativeCharCount += p.narrativeCharCount;
  });

  const totalCharCount = totalDialogueCharCount + totalNarrativeCharCount;
  const overallDialogueRatio = totalCharCount > 0 ? totalDialogueCharCount / totalCharCount : 0;
  const overallNarrativeRatio = totalCharCount > 0 ? totalNarrativeCharCount / totalCharCount : 0;

  let overallPacingStatus: PacingStatus = 'BALANCED';
  if (totalCharCount > 0) {
    if (overallDialogueRatio >= mergedConfig.denseDialogueRatioThreshold) {
      overallPacingStatus = 'DIALOGUE_DENSE';
    } else if (overallDialogueRatio <= mergedConfig.heavyNarrativeRatioThreshold) {
      overallPacingStatus = 'NARRATIVE_HEAVY';
    }
  }

  // Generate diagnostics for streak/heavy sections
  const diagnostics: PacingDiagnostic[] = [];

  // 1. Check consecutive dialogue paragraphs streak
  let consecutiveDialogueCount = 0;
  let streakStartIdx = 0;

  paragraphAnalyses.forEach((p, idx) => {
    if (p.isDialogueOnly || (p.dialogueRatio >= 0.8 && p.dialogueCharCount > 0)) {
      if (consecutiveDialogueCount === 0) {
        streakStartIdx = idx;
      }
      consecutiveDialogueCount++;
    } else {
      if (consecutiveDialogueCount >= mergedConfig.maxConsecutiveDialogueParagraphs) {
        diagnostics.push({
          id: `diag-dense-ch${chapterIndex}-${streakStartIdx}-${idx - 1}`,
          type: 'DIALOGUE_DENSE',
          severity: 'warning',
          startIndex: streakStartIdx,
          endIndex: idx - 1,
          paragraphRange: [streakStartIdx, idx - 1],
          message: `第${streakStartIdx + 1}〜${idx}段落で会話文が${consecutiveDialogueCount}行連続して過密です。情景や地の文を挿入してテンポを整えてください。`,
          ratio: 1.0,
        });
      }
      consecutiveDialogueCount = 0;
    }
  });

  if (consecutiveDialogueCount >= mergedConfig.maxConsecutiveDialogueParagraphs) {
    const endIdx = paragraphAnalyses.length - 1;
    diagnostics.push({
      id: `diag-dense-ch${chapterIndex}-${streakStartIdx}-${endIdx}`,
      type: 'DIALOGUE_DENSE',
      severity: 'warning',
      startIndex: streakStartIdx,
      endIndex: endIdx,
      paragraphRange: [streakStartIdx, endIdx],
      message: `第${streakStartIdx + 1}〜${endIdx + 1}段落で会話文が${consecutiveDialogueCount}行連続して過密です。情景や地の文を挿入してテンポを整えてください。`,
      ratio: 1.0,
    });
  }

  // 2. Check long narrative blocks without dialogue
  let narrativeCharsStreak = 0;
  let narrativeStreakStartIdx = 0;

  paragraphAnalyses.forEach((p, idx) => {
    if (p.dialogueCount === 0) {
      if (narrativeCharsStreak === 0) {
        narrativeStreakStartIdx = idx;
      }
      narrativeCharsStreak += p.narrativeCharCount;
    } else {
      if (narrativeCharsStreak >= mergedConfig.maxNarrativeCharsWithoutDialogue) {
        diagnostics.push({
          id: `diag-heavy-ch${chapterIndex}-${narrativeStreakStartIdx}-${idx - 1}`,
          type: 'NARRATIVE_HEAVY',
          severity: 'info',
          startIndex: narrativeStreakStartIdx,
          endIndex: idx - 1,
          paragraphRange: [narrativeStreakStartIdx, idx - 1],
          message: `第${narrativeStreakStartIdx + 1}〜${idx}段落で地の文が${narrativeCharsStreak}文字連続し説明過多です。会話や動作を交えてテンポを改善することを推奨します。`,
          ratio: 0.0,
        });
      }
      narrativeCharsStreak = 0;
    }
  });

  if (narrativeCharsStreak >= mergedConfig.maxNarrativeCharsWithoutDialogue) {
    const endIdx = paragraphAnalyses.length - 1;
    diagnostics.push({
      id: `diag-heavy-ch${chapterIndex}-${narrativeStreakStartIdx}-${endIdx}`,
      type: 'NARRATIVE_HEAVY',
      severity: 'info',
      startIndex: narrativeStreakStartIdx,
      endIndex: endIdx,
      paragraphRange: [narrativeStreakStartIdx, endIdx],
      message: `第${narrativeStreakStartIdx + 1}〜${endIdx + 1}段落で地の文が${narrativeCharsStreak}文字連続し説明過多です。会話や動作を交えてテンポを改善することを推奨します。`,
      ratio: 0.0,
    });
  }

  return {
    chapterTitle,
    chapterIndex,
    paragraphAnalyses,
    totalDialogueCharCount,
    totalNarrativeCharCount,
    totalCharCount,
    overallDialogueRatio,
    overallNarrativeRatio,
    overallPacingStatus,
    diagnostics,
  };
}

/**
 * Pure function: Analyzes a full manuscript document with chapters or section splits.
 */
export function analyzeDocument(
  docText: string,
  config: DialogueRatioConfig = {}
): DocumentAnalysis {
  if (!docText || docText.trim().length === 0) {
    return {
      chapters: [],
      totalDialogueCharCount: 0,
      totalNarrativeCharCount: 0,
      totalCharCount: 0,
      overallDialogueRatio: 0,
      overallNarrativeRatio: 0,
      overallPacingStatus: 'BALANCED',
      diagnostics: [],
    };
  }

  // Split document into chapters if chapter headers exist (# Chapter or 第...章/話)
  const chapterSplitter = /(?:\r?\n|^)(?=(?:#+\s+|第[0-9一二三四五六七八九十百千]+[章話節]))/g;
  const rawChapters = docText.split(chapterSplitter).filter((c) => c.trim().length > 0);

  const chapters: ChapterAnalysis[] = rawChapters.map((cText, idx) => {
    const titleMatch = cText.trim().match(/^(?:#+\s+|)(第[0-9一二三四五六七八九十百千]+[章話節][^\n\r]*|.*)/);
    const title = titleMatch ? titleMatch[1].trim() : `第${idx + 1}章`;
    return analyzeChapter(cText, title, idx, config);
  });

  let totalDialogueCharCount = 0;
  let totalNarrativeCharCount = 0;
  const diagnostics: PacingDiagnostic[] = [];

  chapters.forEach((ch) => {
    totalDialogueCharCount += ch.totalDialogueCharCount;
    totalNarrativeCharCount += ch.totalNarrativeCharCount;
    diagnostics.push(...ch.diagnostics);
  });

  const totalCharCount = totalDialogueCharCount + totalNarrativeCharCount;
  const overallDialogueRatio = totalCharCount > 0 ? totalDialogueCharCount / totalCharCount : 0;
  const overallNarrativeRatio = totalCharCount > 0 ? totalNarrativeCharCount / totalCharCount : 0;

  const mergedConfig = { ...DEFAULT_DIALOGUE_RATIO_CONFIG, ...config };
  let overallPacingStatus: PacingStatus = 'BALANCED';
  if (totalCharCount > 0) {
    if (overallDialogueRatio >= mergedConfig.denseDialogueRatioThreshold) {
      overallPacingStatus = 'DIALOGUE_DENSE';
    } else if (overallDialogueRatio <= mergedConfig.heavyNarrativeRatioThreshold) {
      overallPacingStatus = 'NARRATIVE_HEAVY';
    }
  }

  return {
    chapters,
    totalDialogueCharCount,
    totalNarrativeCharCount,
    totalCharCount,
    overallDialogueRatio,
    overallNarrativeRatio,
    overallPacingStatus,
    diagnostics,
  };
}
