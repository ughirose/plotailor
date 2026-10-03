/**
 * ManuscriptSheetCalculator - Japanese manuscript sheet & typesetting calculator engine
 *
 * Accurately calculates Japanese manuscript sheet counts (原稿用紙枚数) and publication page counts
 * considering paragraph breaks, empty line grids, auto-indentation, Aozora markup, and Kinsoku Shori.
 */

export interface ManuscriptLayout {
  name?: string;
  charsPerLine: number;
  linesPerPage: number;
}

export type PresetType = '400' | '200' | 'bunko' | 'custom';

export interface ManuscriptCalculatorOptions {
  /**
   * Preset grid configuration.
   * - '400': 400字詰 (20字×20行)
   * - '200': 200字詰 (20字×10行)
   * - 'bunko': 文庫組版 (40字×17行)
   * - 'custom': Custom layout specified by charsPerLine and linesPerPage
   */
  preset?: PresetType;

  /**
   * Characters per line (used if preset is 'custom' or to override default).
   */
  charsPerLine?: number;

  /**
   * Lines per page (used if preset is 'custom' or to override default).
   */
  linesPerPage?: number;

  /**
   * Auto-indent non-dialogue prose lines by 1 full-width space if missing (default: true).
   */
  autoIndent?: boolean;

  /**
   * Strip Aozora Bunko tags (ruby 《...》, bouten 《《...》》, commands ［＃...］) before calculating (default: true).
   */
  stripAozoraMarkup?: boolean;

  /**
   * Cell occupancy per half-width character (default: 0.5, i.e., 2 half-width chars = 1 cell).
   */
  halfwidthRatio?: number;

  /**
   * Enable Kinsoku Shori line-end punctuation hanging for closing brackets/punctuation (default: true).
   */
  kinsokuShori?: boolean;

  /**
   * Layout used for estimating publication pages (default: 40字×17行 Bunko layout).
   */
  publicationLayout?: ManuscriptLayout | PresetType;
}

export interface LineDetails {
  lineNumber: number;
  text: string;
  gridCellsOccupied: number;
  isParagraphStart: boolean;
  isDialogue: boolean;
  isEmptyLine: boolean;
  pageNumber: number;
}

export interface ParagraphDetails {
  index: number;
  rawText: string;
  processedText: string;
  lineCount: number;
  charCount: number;
  isEmpty: boolean;
  isDialogue: boolean;
}

export interface ManuscriptMetrics {
  /**
   * Primary manuscript sheet count (総枚数), rounded up to nearest integer.
   */
  sheets: number;

  /**
   * Exact fractional manuscript sheet count (totalLines / linesPerPage).
   */
  exactSheets: number;

  /**
   * Estimated publication book pages (出版ページ換算値), rounded up.
   */
  publicationPages: number;

  /**
   * Exact fractional publication book pages (pubTotalLines / pubLinesPerPage).
   */
  exactPublicationPages: number;

  /**
   * Total calculated manuscript lines (総行数).
   */
  totalLines: number;

  /**
   * Raw input character count (実文字数), including spaces and newlines.
   */
  rawCharCount: number;

  /**
   * Total character count after markup processing, excluding newline characters.
   */
  totalChars: number;

  /**
   * Total character count excluding all whitespace (spaces, tabs, newlines, fullwidth spaces).
   */
  charCountExcludingWhitespace: number;

  /**
   * Number of paragraphs (excluding pure empty lines).
   */
  paragraphCount: number;

  /**
   * Number of empty lines (空行数).
   */
  emptyLinesCount: number;

  /**
   * Total grid cells occupied by characters and indents (使用マス数).
   */
  filledGridCells: number;

  /**
   * Total grid cell capacity of the manuscript sheets (sheets * charsPerLine * linesPerPage).
   */
  totalGridCapacity: number;

  /**
   * Grid filling ratio (filledGridCells / (totalLines * charsPerLine)).
   */
  gridFillingRatio: number;

  /**
   * Active manuscript grid layout settings.
   */
  layout: ManuscriptLayout;

  /**
   * Active publication page layout settings.
   */
  publicationLayout: ManuscriptLayout;

  /**
   * Detailed line breakdown (optional).
   */
  lines: LineDetails[];

  /**
   * Detailed paragraph breakdown (optional).
   */
  paragraphs: ParagraphDetails[];
}

export class ManuscriptSheetCalculator {
  public static readonly PRESETS: Record<PresetType, ManuscriptLayout> = {
    '400': {
      name: '400字詰原稿用紙 (20字×20行)',
      charsPerLine: 20,
      linesPerPage: 20,
    },
    '200': {
      name: '200字詰原稿用紙 (20字×10行)',
      charsPerLine: 20,
      linesPerPage: 10,
    },
    'bunko': {
      name: '文庫組版 (40字×17行)',
      charsPerLine: 40,
      linesPerPage: 17,
    },
    'custom': {
      name: 'カスタム組版',
      charsPerLine: 20,
      linesPerPage: 20,
    },
  };

  private static readonly DIALOGUE_OPEN_BRACKETS = new Set([
    '「', '『', '（', '【', '“', '‘', '［', '〔', '《', '<', '‹', '«', '“', '”',
  ]);

  private static readonly KINSOKU_END_CHARS = new Set([
    '」', '』', '）', '】', '”', '’', '〕', '］', '》', '>', '›', '»',
    '。', '、', '！', '？', '…', '‥', '・', '：', '；',
  ]);

  /**
   * Calculates detailed manuscript sheet and publication page metrics.
   */
  public static calculate(
    rawText: string,
    options: ManuscriptCalculatorOptions = {}
  ): ManuscriptMetrics {
    const layout = this.resolveLayout(options);
    const pubLayout = this.resolvePublicationLayout(options);

    const autoIndent = options.autoIndent ?? true;
    const stripAozora = options.stripAozoraMarkup ?? true;
    const halfwidthRatio = options.halfwidthRatio ?? 0.5;
    const kinsokuShori = options.kinsokuShori ?? true;

    const processedText = stripAozora ? this.stripAozoraMarkup(rawText) : rawText;

    // Split into paragraph raw lines
    const rawParagraphs = processedText.split(/\r?\n/);

    const paragraphDetailsList: ParagraphDetails[] = [];
    const lineDetailsList: LineDetails[] = [];

    let totalLinesCount = 0;
    let filledCellsCount = 0;
    let emptyLinesCount = 0;
    let nonEntityParagraphCount = 0;

    let currentLineNumber = 0;

    for (let pIdx = 0; pIdx < rawParagraphs.length; pIdx++) {
      let pText = rawParagraphs[pIdx];

      // Empty line check
      if (pText.length === 0) {
        emptyLinesCount++;
        totalLinesCount++;
        currentLineNumber++;

        const pageNum = Math.ceil(currentLineNumber / layout.linesPerPage);
        lineDetailsList.push({
          lineNumber: currentLineNumber,
          text: '',
          gridCellsOccupied: 0,
          isParagraphStart: true,
          isDialogue: false,
          isEmptyLine: true,
          pageNumber: pageNum,
        });

        paragraphDetailsList.push({
          index: pIdx,
          rawText: rawParagraphs[pIdx],
          processedText: '',
          lineCount: 1,
          charCount: 0,
          isEmpty: true,
          isDialogue: false,
        });
        continue;
      }

      nonEntityParagraphCount++;

      const isDialogue = this.isDialogueText(pText);

      // Auto-indentation for non-dialogue prose lines if missing
      if (autoIndent && !isDialogue && !this.startsWithSpaceOrIndent(pText)) {
        pText = '　' + pText;
      }

      const pLines = this.breakTextIntoLines(pText, layout.charsPerLine, halfwidthRatio, kinsokuShori);

      for (let lIdx = 0; lIdx < pLines.length; lIdx++) {
        const lineInfo = pLines[lIdx];
        currentLineNumber++;
        totalLinesCount++;
        filledCellsCount += lineInfo.gridCellsOccupied;

        const pageNum = Math.ceil(currentLineNumber / layout.linesPerPage);
        lineDetailsList.push({
          lineNumber: currentLineNumber,
          text: lineInfo.text,
          gridCellsOccupied: lineInfo.gridCellsOccupied,
          isParagraphStart: lIdx === 0,
          isDialogue,
          isEmptyLine: false,
          pageNumber: pageNum,
        });
      }

      paragraphDetailsList.push({
        index: pIdx,
        rawText: rawParagraphs[pIdx],
        processedText: pText,
        lineCount: pLines.length,
        charCount: Array.from(pText).length,
        isEmpty: false,
        isDialogue,
      });
    }

    // Publication layout line calculation
    const pubTotalLines = this.calculateTotalLines(processedText, pubLayout, {
      autoIndent,
      halfwidthRatio,
      kinsokuShori,
    });

    // Character Counts
    const rawCharCount = rawText.length;
    let totalChars = 0;
    let charCountExcludingWhitespace = 0;

    for (const ch of processedText) {
      if (ch !== '\r' && ch !== '\n') {
        totalChars++;
      }
      if (!/\s|\u3000/.test(ch)) {
        charCountExcludingWhitespace++;
      }
    }

    const sheets = Math.ceil(totalLinesCount / layout.linesPerPage);
    const exactSheets = totalLinesCount / layout.linesPerPage;

    const publicationPages = Math.ceil(pubTotalLines / pubLayout.linesPerPage);
    const exactPublicationPages = pubTotalLines / pubLayout.linesPerPage;

    const totalGridCapacity = sheets * layout.charsPerLine * layout.linesPerPage;
    const maxPossibleCellsInUsedLines = totalLinesCount * layout.charsPerLine;
    const gridFillingRatio = maxPossibleCellsInUsedLines > 0 ? filledCellsCount / maxPossibleCellsInUsedLines : 0;

    return {
      sheets,
      exactSheets,
      publicationPages,
      exactPublicationPages,
      totalLines: totalLinesCount,
      rawCharCount,
      totalChars,
      charCountExcludingWhitespace,
      paragraphCount: nonEntityParagraphCount,
      emptyLinesCount,
      filledGridCells: filledCellsCount,
      totalGridCapacity,
      gridFillingRatio,
      layout,
      publicationLayout: pubLayout,
      lines: lineDetailsList,
      paragraphs: paragraphDetailsList,
    };
  }

  /**
   * Quick estimation of sheet count from raw character count.
   */
  public static estimateFromCharCount(
    charCount: number,
    layout: ManuscriptLayout = this.PRESETS['400']
  ): { sheets: number; exactSheets: number } {
    const charsPerPage = layout.charsPerLine * layout.linesPerPage;
    const exactSheets = charCount / charsPerPage;
    return {
      sheets: Math.ceil(exactSheets),
      exactSheets,
    };
  }

  /**
   * Helper to return all preset layout definitions.
   */
  public static getPresets(): Record<PresetType, ManuscriptLayout> {
    return { ...this.PRESETS };
  }

  /**
   * Strips Aozora Bunko markup annotations (ruby, bouten, comments, control tags).
   */
  public static stripAozoraMarkup(text: string): string {
    return text
      // Bouten four angle bracket tags <<<<...>>>> or ＜＜＜＜...＞＞＞＞
      .replace(/(?:<{4,}|＜{4,})([^\n<>《》＜＞]+?)(?:>{4,}|＞{4,})/g, '$1')
      // Bouten 《《...》》
      .replace(/《《([^》\r\n]+)》》/g, '$1')
      // Explicit Ruby ｜親文字《るび》 or |親文字《るび》
      .replace(/[｜|]([^\n｜|《》<>＜＞]+?)(?:《|<<|＜＜)[^\n《》<>＜＞]+?(?:》|>>|＞＞)/g, '$1')
      // Implicit Kanji Ruby 漢字《るび》
      .replace(/([一-龠々〆ヵヶ\u3400-\u4dbf\uf900-\ufaff\u30a0-\u30ffA-Za-z0-9]+?)(?:《|<<|＜＜)[^\n《》<>＜＞]+?(?:》|>>|＞＞)/g, '$1')
      // Aozora command blocks ［＃...］ or [＃...]
      .replace(/[［\[]＃[^\r\n］\]]+?[］\]]/g, '')
      // Ruby sagari / Warichu / Command tags 〔＃...〕 or 〔割り注...〕 or 〔ルビ下がり...〕
      .replace(/〔(?:＃|割り注|ルビ下がり)[^\r\n〕]*?〕/g, '')
      // Comment Block %%...%%
      .replace(/%%[^\r\n%]+?%%/g, '')
      // Line comments starting with // at start of line or after newline
      .replace(/(?:^|\n)\/\/[^\r\n]*/g, '');
  }

  /**
   * Resolves the primary ManuscriptLayout from options.
   */
  private static resolveLayout(options: ManuscriptCalculatorOptions): ManuscriptLayout {
    const presetKey = options.preset ?? '400';
    const basePreset = this.PRESETS[presetKey] ?? this.PRESETS['400'];

    return {
      name: basePreset.name,
      charsPerLine: options.charsPerLine ?? basePreset.charsPerLine,
      linesPerPage: options.linesPerPage ?? basePreset.linesPerPage,
    };
  }

  /**
   * Resolves the PublicationLayout from options.
   */
  private static resolvePublicationLayout(options: ManuscriptCalculatorOptions): ManuscriptLayout {
    if (options.publicationLayout) {
      if (typeof options.publicationLayout === 'string') {
        const preset = this.PRESETS[options.publicationLayout] ?? this.PRESETS['bunko'];
        return { ...preset };
      }
      return { ...options.publicationLayout };
    }
    return { ...this.PRESETS['bunko'] };
  }

  /**
   * Checks if a string starts with Japanese open dialogue quotes or brackets.
   */
  private static isDialogueText(text: string): boolean {
    const trimmed = text.trimStart();
    if (trimmed.length === 0) return false;
    const firstChar = Array.from(trimmed)[0];
    return this.DIALOGUE_OPEN_BRACKETS.has(firstChar);
  }

  /**
   * Checks if text starts with full-width or half-width space or tab.
   */
  private static startsWithSpaceOrIndent(text: string): boolean {
    if (text.length === 0) return false;
    const first = text[0];
    return first === '　' || first === ' ' || first === '\t';
  }

  /**
   * Calculates total line count for a processed text on a given layout.
   */
  private static calculateTotalLines(
    processedText: string,
    layout: ManuscriptLayout,
    opts: { autoIndent: boolean; halfwidthRatio: number; kinsokuShori: boolean }
  ): number {
    const rawParagraphs = processedText.split(/\r?\n/);
    let totalLines = 0;

    for (const rawP of rawParagraphs) {
      if (rawP.length === 0) {
        totalLines++;
        continue;
      }

      let pText = rawP;
      const isDialogue = this.isDialogueText(pText);
      if (opts.autoIndent && !isDialogue && !this.startsWithSpaceOrIndent(pText)) {
        pText = '　' + pText;
      }

      const lines = this.breakTextIntoLines(
        pText,
        layout.charsPerLine,
        opts.halfwidthRatio,
        opts.kinsokuShori
      );
      totalLines += lines.length;
    }

    return totalLines;
  }

  /**
   * Breaks a single paragraph string into grid line segments based on charsPerLine with Gyoutou Kinsoku support.
   */
  private static breakTextIntoLines(
    text: string,
    charsPerLine: number,
    halfwidthRatio: number,
    kinsokuShori: boolean
  ): { text: string; gridCellsOccupied: number }[] {
    const characters = Array.from(text);
    const lines: { text: string; gridCellsOccupied: number }[] = [];

    let currentLineChars: string[] = [];
    let currentOccupied = 0;

    for (let i = 0; i < characters.length; i++) {
      const char = characters[i];
      const charWidth = this.getCharWidth(char, halfwidthRatio);

      if (currentOccupied + charWidth > charsPerLine) {
        // Gyoutou Kinsoku (行頭禁則): Closing punctuation must not start a new line.
        // Attach consecutive closing punctuation to current line.
        if (kinsokuShori && this.KINSOKU_END_CHARS.has(char)) {
          currentLineChars.push(char);
          currentOccupied += charWidth;
          continue;
        }

        if (currentLineChars.length > 0) {
          lines.push({
            text: currentLineChars.join(''),
            gridCellsOccupied: Math.ceil(currentOccupied),
          });
        }
        currentLineChars = [char];
        currentOccupied = charWidth;
      } else {
        currentLineChars.push(char);
        currentOccupied += charWidth;
      }
    }

    if (currentLineChars.length > 0 || lines.length === 0) {
      lines.push({
        text: currentLineChars.join(''),
        gridCellsOccupied: Math.ceil(currentOccupied),
      });
    }

    return lines;
  }

  /**
   * Gets character width (1.0 for full-width/CJK, halfwidthRatio for half-width ASCII).
   */
  private static getCharWidth(char: string, halfwidthRatio: number): number {
    const code = char.charCodeAt(0);
    // ASCII / Halfwidth range (32..126) and halfwidth katakana (FF61..FF9F)
    if ((code >= 0x0020 && code <= 0x007e) || (code >= 0xff61 && code <= 0xff9f)) {
      return halfwidthRatio;
    }
    return 1.0;
  }
}
