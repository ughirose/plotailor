/**
 * KinsokuEngine - Japanese Kinsoku Shori (Prohibition Rules) and Hanging Punctuation Engine
 * 
 * Complies with 3-Pane Literature IDE Constitution:
 * - Pure orthography and typesetting layout engine
 * - Line-head (行頭禁則) and Line-tail (行末禁則) prohibition violation detection
 * - Monospace typesetting simulator with hanging punctuation (ぶら下げ組み) and push-down (追い出し)
 */

export interface KinsokuRuleConfig {
  lineHeadProhibitedChars: string[];
  lineTailProhibitedChars: string[];
  hangingChars: string[];
  columnsPerLine: number;
  allowHanging: boolean;
}

export interface KinsokuViolation {
  type: 'line-head' | 'line-tail';
  char: string;
  lineIndex: number;
  colIndex: number;
  offset: number;
  suggestedAction: 'push-down' | 'hang' | 'push-up';
}

export interface KinsokuSimulationLine {
  text: string;
  originalStartOffset: number;
  isHanging: boolean;
  hangingChar?: string;
  violations: KinsokuViolation[];
}

export interface KinsokuSimulationResult {
  lines: KinsokuSimulationLine[];
  totalViolations: number;
  hangingCount: number;
  rawText: string;
}

export const DEFAULT_LINE_HEAD_PROHIBITED = [
  '、', '。', '，', '．', '！', '？', '!', '?',
  '）', '」', '』', '〕', '〉', '》', '】', '｝', ']', '}', ')', '＞', '>',
  'ー', '〜', '…', '‥', '：', '；', ':', ';',
  '々', 'ヽ', 'ヾ', 'ゝ', 'ゞ', 'ッ', 'っ', 'ャ', 'ゃ', 'ュ', 'ゅ', 'ョ', 'ょ', 'ァ', 'ぁ', 'ィ', 'ぃ', 'ゥ', 'ぅ', 'ェ', 'ぇ', 'ォ', 'ぉ'
];

export const DEFAULT_LINE_TAIL_PROHIBITED = [
  '（', '「', '『', '〔', '〈', '《', '【', '｛', '[', '{', '(', '＜', '<',
  '￥', '$', '€', '£', '＃', '#'
];

export const DEFAULT_HANGING_CHARS = ['、', '。', '，', '．'];

export class KinsokuEngine {
  private config: KinsokuRuleConfig;
  private headProhibitedSet: Set<string>;
  private tailProhibitedSet: Set<string>;
  private hangingSet: Set<string>;

  constructor(config?: Partial<KinsokuRuleConfig>) {
    this.config = {
      lineHeadProhibitedChars: config?.lineHeadProhibitedChars ?? DEFAULT_LINE_HEAD_PROHIBITED,
      lineTailProhibitedChars: config?.lineTailProhibitedChars ?? DEFAULT_LINE_TAIL_PROHIBITED,
      hangingChars: config?.hangingChars ?? DEFAULT_HANGING_CHARS,
      columnsPerLine: config?.columnsPerLine ?? 40,
      allowHanging: config?.allowHanging ?? true,
    };

    this.headProhibitedSet = new Set(this.config.lineHeadProhibitedChars);
    this.tailProhibitedSet = new Set(this.config.lineTailProhibitedChars);
    this.hangingSet = new Set(this.config.hangingChars);
  }

  public getConfig(): KinsokuRuleConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<KinsokuRuleConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.headProhibitedSet = new Set(this.config.lineHeadProhibitedChars);
    this.tailProhibitedSet = new Set(this.config.lineTailProhibitedChars);
    this.hangingSet = new Set(this.config.hangingChars);
  }

  public isLineHeadProhibited(char: string): boolean {
    return this.headProhibitedSet.has(char);
  }

  public isLineTailProhibited(char: string): boolean {
    return this.tailProhibitedSet.has(char);
  }

  public isHangingChar(char: string): boolean {
    return this.hangingSet.has(char);
  }

  public calculateCharWidth(char: string): number {
    const code = char.charCodeAt(0);
    // Half-width ASCII and kana
    if ((code >= 0x0020 && code <= 0x007e) || (code >= 0xff61 && code <= 0xff9f)) {
      return 1;
    }
    return 2;
  }

  /**
   * Detects prohibited characters at line boundaries of a fixed column grid.
   */
  public detectViolations(text: string, columnsPerLine?: number): KinsokuViolation[] {
    const cols = columnsPerLine ?? this.config.columnsPerLine;
    const simulation = this.simulateTypesetting(text, cols, false);
    return simulation.lines.flatMap((l) => l.violations);
  }

  /**
   * Typesetting simulation with Japanese Kinsoku Shori and Hanging Punctuation.
   */
  public simulateTypesetting(
    text: string,
    columnsPerLine?: number,
    allowHanging?: boolean
  ): KinsokuSimulationResult {
    const maxCols = columnsPerLine ?? this.config.columnsPerLine;
    const canHang = allowHanging ?? this.config.allowHanging;

    const rawParagraphs = text.split('\n');
    const resultLines: KinsokuSimulationLine[] = [];
    let currentGlobalOffset = 0;
    let hangingCount = 0;
    let totalViolations = 0;

    for (let pIdx = 0; pIdx < rawParagraphs.length; pIdx++) {
      const paragraph = rawParagraphs[pIdx];
      let pOffset = 0;

      while (pOffset < paragraph.length) {
        let currentWidth = 0;
        let lineChars: string[] = [];
        let lineOffsetStart = currentGlobalOffset + pOffset;
        let sliceIdx = pOffset;

        while (sliceIdx < paragraph.length) {
          const ch = paragraph[sliceIdx];
          const w = this.calculateCharWidth(ch);

          if (currentWidth + w > maxCols) {
            // Check if hanging punctuation applies for the very next character
            if (canHang && this.isHangingChar(ch) && currentWidth === maxCols) {
              // Allow hanging beyond the boundary by 1 character
              lineChars.push(ch);
              sliceIdx++;
              hangingCount++;
              break;
            }
            break;
          }

          lineChars.push(ch);
          currentWidth += w;
          sliceIdx++;
        }

        // Now inspect boundary rules
        const lineText = lineChars.join('');
        const violations: KinsokuViolation[] = [];

        // Check line-tail prohibition on the current line
        const lastChar = lineChars[lineChars.length - 1];
        if (sliceIdx < paragraph.length && lastChar && this.isLineTailProhibited(lastChar)) {
          violations.push({
            type: 'line-tail',
            char: lastChar,
            lineIndex: resultLines.length,
            colIndex: lineChars.length - 1,
            offset: lineOffsetStart + lineChars.length - 1,
            suggestedAction: 'push-down',
          });
        }

        // Check line-head prohibition on the start of the next slice
        if (sliceIdx < paragraph.length) {
          const nextChar = paragraph[sliceIdx];
          if (this.isLineHeadProhibited(nextChar)) {
            // If hanging is disabled or it's not a hanging character
            if (!canHang || !this.isHangingChar(nextChar)) {
              violations.push({
                type: 'line-head',
                char: nextChar,
                lineIndex: resultLines.length + 1,
                colIndex: 0,
                offset: currentGlobalOffset + sliceIdx,
                suggestedAction: 'push-down',
              });
            }
          }
        }

        const isLineHanging = lineChars.length > 0 && canHang && this.isHangingChar(lastChar) && currentWidth >= maxCols;

        totalViolations += violations.length;
        resultLines.push({
          text: lineText,
          originalStartOffset: lineOffsetStart,
          isHanging: isLineHanging,
          hangingChar: isLineHanging ? lastChar : undefined,
          violations,
        });

        pOffset = sliceIdx;
      }

      if (paragraph.length === 0) {
        resultLines.push({
          text: '',
          originalStartOffset: currentGlobalOffset,
          isHanging: false,
          violations: [],
        });
      }

      currentGlobalOffset += paragraph.length + 1; // +1 for newline
    }

    return {
      lines: resultLines,
      totalViolations,
      hangingCount,
      rawText: text,
    };
  }
}
