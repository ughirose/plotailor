/**
 * KinsokuAlignmentEngine - Japanese Kinsoku Prohibition Offset Mapping & Guideline Synchronous Alignment Engine
 *
 * Complies with 3-Pane Literature IDE Constitution:
 * - Pure orthography and typesetting layout engine
 * - Corrects discrepancies between editor character indices and 40-character (or custom) guidelines wrapping
 * - Precise offset mapping considering fullwidth (2 columns) / halfwidth (1 column) characters and Ruby notation exclusion/inclusion
 * - Synchronous detection and millisecond timing of line-head (行頭禁則, 追い出し) and line-tail (行末禁則, ぶら下げ) prohibition positions
 */

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

export interface KinsokuAlignmentConfig {
  columnsPerLine: number; // Default 40
  lineHeadProhibitedChars: string[];
  lineTailProhibitedChars: string[];
  hangingChars: string[];
  allowHanging: boolean; // Default true
  excludeRuby: boolean;  // Default true
}

export interface KinsokuBoundaryViolation {
  id: string;
  type: 'line-head' | 'line-tail';
  char: string;
  rawOffset: number;       // Index in editor raw text
  displayOffset: number;   // Index in ruby-stripped display text
  lineIndex: number;       // 0-based visual line index
  colIndex: number;        // Column position on visual line (0 to columnsPerLine)
  action: 'push-down' | 'hang';
  timestampMs: number;     // Synchronous execution timestamp
}

export interface AlignmentMapEntry {
  rawOffset: number;        // Index in editor raw text
  displayOffset: number;    // Index in ruby-stripped display text
  visualLine: number;       // Line index in guideline layout
  visualCol: number;        // Column position in guideline layout (0..columnsPerLine)
  charWidth: number;        // Column width (0 for excluded ruby markup, 1 or 2 otherwise)
  isRubyMarkup: boolean;    // Whether this char is part of ruby markup (｜, 《, ルビ, 》) if excluded
  isPushedDown: boolean;    // Whether shifted due to 追い出し
  isHanging: boolean;       // Whether hanging on line tail due to ぶら下げ
}

export interface AlignedLine {
  lineIndex: number;
  rawText: string;
  displayText: string;
  rawStartOffset: number;
  rawEndOffset: number;
  displayStartOffset: number;
  displayEndOffset: number;
  columnWidth: number;
  isHanging: boolean;
  hangingChar?: string;
  violations: KinsokuBoundaryViolation[];
}

export interface AlignmentResult {
  lines: AlignedLine[];
  violations: KinsokuBoundaryViolation[];
  mapEntries: AlignmentMapEntry[];
  totalRawChars: number;
  totalDisplayChars: number;
  totalLines: number;
  computationTimeMs: number;
}

interface DisplayCharInfo {
  char: string;
  displayOffset: number;
  rawOffset: number;
  charWidth: number;
  isRubyParent: boolean;
}

interface RawCharInfo {
  char: string;
  rawOffset: number;
  displayOffset: number;
  isRubyMarkup: boolean;
  charWidth: number;
}

export class KinsokuAlignmentEngine {
  private config: KinsokuAlignmentConfig;
  private headProhibitedSet: Set<string>;
  private tailProhibitedSet: Set<string>;
  private hangingSet: Set<string>;

  constructor(config?: Partial<KinsokuAlignmentConfig>) {
    this.config = {
      columnsPerLine: config?.columnsPerLine ?? 40,
      lineHeadProhibitedChars: config?.lineHeadProhibitedChars ?? DEFAULT_LINE_HEAD_PROHIBITED,
      lineTailProhibitedChars: config?.lineTailProhibitedChars ?? DEFAULT_LINE_TAIL_PROHIBITED,
      hangingChars: config?.hangingChars ?? DEFAULT_HANGING_CHARS,
      allowHanging: config?.allowHanging ?? true,
      excludeRuby: config?.excludeRuby ?? true,
    };

    this.headProhibitedSet = new Set(this.config.lineHeadProhibitedChars);
    this.tailProhibitedSet = new Set(this.config.lineTailProhibitedChars);
    this.hangingSet = new Set(this.config.hangingChars);
  }

  public getConfig(): KinsokuAlignmentConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<KinsokuAlignmentConfig>): void {
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
    if (!char) return 0;
    const code = char.charCodeAt(0);
    // Half-width ASCII and half-width Katakana
    if ((code >= 0x0020 && code <= 0x007e) || (code >= 0xff61 && code <= 0xff9f)) {
      return 1;
    }
    return 2;
  }

  /**
   * Performs full synchronous alignment calculation and generates bidirectional offset map entries.
   */
  public alignText(rawText: string): AlignmentResult {
    const startTime = performance.now();

    const { rawCharInfos, displayCharInfos, displayString } = this.parseRubyAndBuildCharMaps(rawText);

    const paragraphs = displayString.split('\n');
    const lines: AlignedLine[] = [];
    const violations: KinsokuBoundaryViolation[] = [];
    const mapEntries: AlignmentMapEntry[] = new Array(rawText.length);

    let globalDisplayIndex = 0;
    let globalRawIndex = 0;
    let currentLineIndex = 0;

    // Track raw offsets to map entries
    for (const rInfo of rawCharInfos) {
      mapEntries[rInfo.rawOffset] = {
        rawOffset: rInfo.rawOffset,
        displayOffset: rInfo.displayOffset,
        visualLine: 0,
        visualCol: 0,
        charWidth: rInfo.charWidth,
        isRubyMarkup: rInfo.isRubyMarkup,
        isPushedDown: false,
        isHanging: false,
      };
    }

    const maxCols = this.config.columnsPerLine;

    for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
      const pDisplayStr = paragraphs[pIdx];
      const pDisplayLength = pDisplayStr.length;
      let pDisplayOffset = 0;

      if (pDisplayLength === 0) {
        // Empty paragraph line
        const rawStart = globalRawIndex;
        let rawEnd = rawStart;
        if (globalRawIndex < rawText.length && rawText[globalRawIndex] === '\n') {
          mapEntries[globalRawIndex].visualLine = currentLineIndex;
          mapEntries[globalRawIndex].visualCol = 0;
          globalRawIndex += 1;
          rawEnd = globalRawIndex;
        }

        lines.push({
          lineIndex: currentLineIndex,
          rawText: '',
          displayText: '',
          rawStartOffset: rawStart,
          rawEndOffset: rawEnd,
          displayStartOffset: globalDisplayIndex,
          displayEndOffset: globalDisplayIndex,
          columnWidth: 0,
          isHanging: false,
          violations: [],
        });

        currentLineIndex += 1;
        continue;
      }

      while (pDisplayOffset < pDisplayLength) {
        let lineDisplayChars: DisplayCharInfo[] = [];
        let lineColWidth = 0;
        let dIdx = pDisplayOffset;

        while (dIdx < pDisplayLength) {
          const dCharInfo = displayCharInfos[globalDisplayIndex + dIdx];
          const w = dCharInfo.charWidth;

          if (lineColWidth + w > maxCols) {
            // Check for hanging punctuation at line boundary
            if (
              this.config.allowHanging &&
              lineColWidth === maxCols &&
              this.isHangingChar(dCharInfo.char)
            ) {
              lineDisplayChars.push(dCharInfo);
              lineColWidth += w;
              dIdx++;

              const violation: KinsokuBoundaryViolation = {
                id: `v-${startTime}-${violations.length}`,
                type: 'line-head',
                char: dCharInfo.char,
                rawOffset: dCharInfo.rawOffset,
                displayOffset: dCharInfo.displayOffset,
                lineIndex: currentLineIndex,
                colIndex: lineColWidth,
                action: 'hang',
                timestampMs: performance.now() - startTime,
              };
              violations.push(violation);
            }
            break;
          }

          lineDisplayChars.push(dCharInfo);
          lineColWidth += w;
          dIdx++;
        }

        // Apply Kinsoku Shori rules (Line-head & Line-tail prohibition)
        const lineViolations: KinsokuBoundaryViolation[] = [];

        // Check Line-tail prohibition on last char of current line
        if (dIdx < pDisplayLength && lineDisplayChars.length > 0) {
          let lastDChar = lineDisplayChars[lineDisplayChars.length - 1];
          if (this.isLineTailProhibited(lastDChar.char)) {
            // Push down last character to next line
            lineDisplayChars.pop();
            dIdx--;
            lineColWidth -= lastDChar.charWidth;

            const v: KinsokuBoundaryViolation = {
              id: `v-${startTime}-${violations.length}`,
              type: 'line-tail',
              char: lastDChar.char,
              rawOffset: lastDChar.rawOffset,
              displayOffset: lastDChar.displayOffset,
              lineIndex: currentLineIndex,
              colIndex: lineColWidth,
              action: 'push-down',
              timestampMs: performance.now() - startTime,
            };
            lineViolations.push(v);
            violations.push(v);
          }
        }

        // Check Line-head prohibition on first char of next slice
        if (dIdx < pDisplayLength) {
          const nextDChar = displayCharInfos[globalDisplayIndex + dIdx];
          if (
            this.isLineHeadProhibited(nextDChar.char) &&
            (!this.config.allowHanging || !this.isHangingChar(nextDChar.char))
          ) {
            // Push down last char of current line so nextDChar is not alone at line head
            if (lineDisplayChars.length > 0) {
              const pushedDChar = lineDisplayChars.pop()!;
              dIdx--;
              lineColWidth -= pushedDChar.charWidth;

              const v: KinsokuBoundaryViolation = {
                id: `v-${startTime}-${violations.length}`,
                type: 'line-head',
                char: nextDChar.char,
                rawOffset: nextDChar.rawOffset,
                displayOffset: nextDChar.displayOffset,
                lineIndex: currentLineIndex + 1,
                colIndex: 0,
                action: 'push-down',
                timestampMs: performance.now() - startTime,
              };
              lineViolations.push(v);
              violations.push(v);
            }
          }
        }

        const isHangingLine =
          lineDisplayChars.length > 0 &&
          this.config.allowHanging &&
          this.isHangingChar(lineDisplayChars[lineDisplayChars.length - 1].char) &&
          lineColWidth > maxCols;

        const lineDisplayText = lineDisplayChars.map((c) => c.char).join('');
        const lineDisplayStart = lineDisplayChars.length > 0 ? lineDisplayChars[0].displayOffset : globalDisplayIndex + pDisplayOffset;
        const lineDisplayEnd = lineDisplayChars.length > 0 ? lineDisplayChars[lineDisplayChars.length - 1].displayOffset + 1 : lineDisplayStart;

        // Calculate rawStart and rawEnd for this visual line
        let lineRawStart = lineDisplayChars.length > 0 ? lineDisplayChars[0].rawOffset : globalRawIndex;
        let lineRawEnd = lineDisplayChars.length > 0 ? lineDisplayChars[lineDisplayChars.length - 1].rawOffset + 1 : lineRawStart;

        // Expand lineRawEnd to include attached ruby markup if excludeRuby is true
        if (this.config.excludeRuby && lineDisplayChars.length > 0) {
          const lastDisp = lineDisplayChars[lineDisplayChars.length - 1];
          let rIndex = lastDisp.rawOffset + 1;
          while (rIndex < rawText.length && rawCharInfos[rIndex]?.isRubyMarkup) {
            lineRawEnd = rIndex + 1;
            rIndex++;
          }
        }

        // Map entries for each display char on this line
        let colTracker = 0;
        for (const dInfo of lineDisplayChars) {
          // Map raw parent char
          if (mapEntries[dInfo.rawOffset]) {
            mapEntries[dInfo.rawOffset].visualLine = currentLineIndex;
            mapEntries[dInfo.rawOffset].visualCol = colTracker;
            mapEntries[dInfo.rawOffset].isHanging = isHangingLine && colTracker >= maxCols;
          }

          // If excludeRuby is enabled, map associated ruby markup chars
          if (this.config.excludeRuby) {
            // Ruby prefix pipe before
            let prevR = dInfo.rawOffset - 1;
            while (prevR >= 0 && rawCharInfos[prevR]?.isRubyMarkup && rawCharInfos[prevR]?.displayOffset === dInfo.displayOffset) {
              mapEntries[prevR].visualLine = currentLineIndex;
              mapEntries[prevR].visualCol = colTracker;
              prevR--;
            }
            // Ruby brackets after
            let nextR = dInfo.rawOffset + 1;
            while (nextR < rawText.length && rawCharInfos[nextR]?.isRubyMarkup && rawCharInfos[nextR]?.displayOffset === dInfo.displayOffset) {
              mapEntries[nextR].visualLine = currentLineIndex;
              mapEntries[nextR].visualCol = colTracker + dInfo.charWidth;
              nextR++;
            }
          }

          colTracker += dInfo.charWidth;
        }

        const rawSubstring = rawText.slice(lineRawStart, lineRawEnd);

        lines.push({
          lineIndex: currentLineIndex,
          rawText: rawSubstring,
          displayText: lineDisplayText,
          rawStartOffset: lineRawStart,
          rawEndOffset: lineRawEnd,
          displayStartOffset: lineDisplayStart,
          displayEndOffset: lineDisplayEnd,
          columnWidth: lineColWidth,
          isHanging: isHangingLine,
          hangingChar: isHangingLine ? lineDisplayChars[lineDisplayChars.length - 1].char : undefined,
          violations: lineViolations,
        });

        pDisplayOffset = dIdx;
        globalRawIndex = lineRawEnd;
        currentLineIndex++;
      }

      if (pIdx < paragraphs.length - 1) {
        // Handle newline character
        if (globalRawIndex < rawText.length && rawText[globalRawIndex] === '\n') {
          mapEntries[globalRawIndex].visualLine = currentLineIndex - 1;
          mapEntries[globalRawIndex].visualCol = lines[lines.length - 1]?.columnWidth ?? 0;
          globalRawIndex += 1;
        }
        globalDisplayIndex += pDisplayLength;
      }
    }

    // Fill any unmapped trailing raw entries (e.g. newline or trailing whitespace)
    for (let i = 0; i < rawText.length; i++) {
      if (!mapEntries[i]) {
        const lastLineIdx = Math.max(0, lines.length - 1);
        const lastLineCols = lines[lastLineIdx]?.columnWidth ?? 0;
        mapEntries[i] = {
          rawOffset: i,
          displayOffset: rawCharInfos[i]?.displayOffset ?? 0,
          visualLine: lastLineIdx,
          visualCol: lastLineCols,
          charWidth: rawCharInfos[i]?.charWidth ?? 0,
          isRubyMarkup: rawCharInfos[i]?.isRubyMarkup ?? false,
          isPushedDown: false,
          isHanging: false,
        };
      }
    }

    const endTime = performance.now();

    return {
      lines,
      violations,
      mapEntries,
      totalRawChars: rawText.length,
      totalDisplayChars: displayString.length,
      totalLines: lines.length,
      computationTimeMs: endTime - startTime,
    };
  }

  /**
   * Detects prohibited character violations along guideline boundaries without full line map generation.
   */
  public detectKinsokuBoundaries(rawText: string): KinsokuBoundaryViolation[] {
    const result = this.alignText(rawText);
    return result.violations;
  }

  /**
   * Maps a raw editor character offset (UTF-16 code unit offset) to visual line and column coordinates.
   */
  public rawToVisualOffset(
    rawOffset: number,
    result?: AlignmentResult
  ): { lineIndex: number; colIndex: number; isRubyMarkup: boolean; isPushedDown: boolean; isHanging: boolean } {
    if (rawOffset <= 0) {
      return { lineIndex: 0, colIndex: 0, isRubyMarkup: false, isPushedDown: false, isHanging: false };
    }

    const res = result ?? this.alignText('');

    if (res.mapEntries[rawOffset]) {
      const entry = res.mapEntries[rawOffset];
      return {
        lineIndex: entry.visualLine,
        colIndex: entry.visualCol,
        isRubyMarkup: entry.isRubyMarkup,
        isPushedDown: entry.isPushedDown,
        isHanging: entry.isHanging,
      };
    }

    if (rawOffset >= res.totalRawChars) {
      const lastLine = res.lines[res.lines.length - 1];
      if (lastLine) {
        return {
          lineIndex: lastLine.lineIndex,
          colIndex: lastLine.columnWidth,
          isRubyMarkup: false,
          isPushedDown: false,
          isHanging: false,
        };
      }
    }

    return { lineIndex: 0, colIndex: 0, isRubyMarkup: false, isPushedDown: false, isHanging: false };
  }

  /**
   * Maps visual line and column coordinates back to the closest raw editor character offset.
   */
  public visualToRawOffset(
    lineIndex: number,
    colIndex: number,
    result: AlignmentResult
  ): number {
    if (lineIndex < 0) return 0;
    if (lineIndex >= result.lines.length) return result.totalRawChars;

    const targetLine = result.lines[lineIndex];
    if (!targetLine) return result.totalRawChars;

    const entriesOnLine = result.mapEntries.filter((e) => e.visualLine === lineIndex);
    if (entriesOnLine.length === 0) return targetLine.rawStartOffset;

    let closestEntry = entriesOnLine[0];
    let minDiff = Math.abs(closestEntry.visualCol - colIndex);

    for (let i = 1; i < entriesOnLine.length; i++) {
      const entry = entriesOnLine[i];
      const diff = Math.abs(entry.visualCol - colIndex);
      if (diff < minDiff) {
        minDiff = diff;
        closestEntry = entry;
      }
    }

    return closestEntry.rawOffset;
  }

  /**
   * Helper: Parses ruby markup (Aozora/Kakuyomu syntax) and builds raw <-> display character maps.
   */
  private parseRubyAndBuildCharMaps(rawText: string): {
    rawCharInfos: RawCharInfo[];
    displayCharInfos: DisplayCharInfo[];
    displayString: string;
  } {
    const rawCharInfos: RawCharInfo[] = new Array(rawText.length);
    const displayCharInfos: DisplayCharInfo[] = [];

    const excludeRuby = this.config.excludeRuby;

    if (!excludeRuby) {
      // Include all ruby markup in display text
      let displayString = '';
      for (let i = 0; i < rawText.length; i++) {
        const ch = rawText[i];
        const width = this.calculateCharWidth(ch);
        const displayOffset = ch === '\n' ? displayCharInfos.length : displayCharInfos.length;

        rawCharInfos[i] = {
          char: ch,
          rawOffset: i,
          displayOffset,
          isRubyMarkup: false,
          charWidth: width,
        };

        if (ch !== '\n') {
          displayCharInfos.push({
            char: ch,
            displayOffset,
            rawOffset: i,
            charWidth: width,
            isRubyParent: false,
          });
          displayString += ch;
        } else {
          displayString += '\n';
        }
      }

      return { rawCharInfos, displayCharInfos, displayString };
    }

    // Process with excludeRuby = true
    // Parse ruby patterns: ｜親《ルビ》 or |親《ルビ》 or 漢字《ルビ》
    const rubySpans: { parentStart: number; parentEnd: number; rubyStart: number; rubyEnd: number; pipeIndex?: number }[] = [];

    // 1. Explicit Ruby: [｜|]親文字《ルビ》
    const explicitRe = /([｜|])([^《\r\n]+)《([^》\r\n]*)》/g;
    let m: RegExpExecArray | null;
    while ((m = explicitRe.exec(rawText)) !== null) {
      const pipeIndex = m.index;
      const parentStart = m.index + m[1].length;
      const parentEnd = parentStart + m[2].length;
      const rubyStart = parentEnd; // includes 《
      const rubyEnd = m.index + m[0].length; // includes 》

      rubySpans.push({ parentStart, parentEnd, rubyStart, rubyEnd, pipeIndex });
    }

    // 2. Implicit Kanji Ruby: 漢字《ルビ》
    const implicitRe = /([\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]+)《([^》\r\n]*)》/g;
    while ((m = implicitRe.exec(rawText)) !== null) {
      const start = m.index;
      const end = m.index + m[0].length;
      const overlaps = rubySpans.some((s) => Math.max(start, s.pipeIndex ?? s.parentStart) < Math.min(end, s.rubyEnd));

      if (!overlaps) {
        const parentStart = m.index;
        const parentEnd = parentStart + m[1].length;
        const rubyStart = parentEnd;
        const rubyEnd = end;

        rubySpans.push({ parentStart, parentEnd, rubyStart, rubyEnd });
      }
    }

    rubySpans.sort((a, b) => (a.pipeIndex ?? a.parentStart) - (b.pipeIndex ?? b.parentStart));

    // Construct rawCharInfos and displayCharInfos
    let displayString = '';
    let currentDisplayIndex = 0;
    let rIdx = 0;

    while (rIdx < rawText.length) {
      const span = rubySpans.find((s) => rIdx >= (s.pipeIndex ?? s.parentStart) && rIdx < s.rubyEnd);

      if (span) {
        // Inside ruby span
        if (span.pipeIndex !== undefined && rIdx === span.pipeIndex) {
          // Pipe char
          rawCharInfos[rIdx] = {
            char: rawText[rIdx],
            rawOffset: rIdx,
            displayOffset: currentDisplayIndex,
            isRubyMarkup: true,
            charWidth: 0,
          };
          rIdx++;
        } else if (rIdx >= span.parentStart && rIdx < span.parentEnd) {
          // Parent text char
          const ch = rawText[rIdx];
          const w = this.calculateCharWidth(ch);

          rawCharInfos[rIdx] = {
            char: ch,
            rawOffset: rIdx,
            displayOffset: currentDisplayIndex,
            isRubyMarkup: false,
            charWidth: w,
          };

          displayCharInfos.push({
            char: ch,
            displayOffset: currentDisplayIndex,
            rawOffset: rIdx,
            charWidth: w,
            isRubyParent: true,
          });

          displayString += ch;
          currentDisplayIndex++;
          rIdx++;
        } else if (rIdx >= span.rubyStart && rIdx < span.rubyEnd) {
          // Ruby markup 《ルビ》
          const parentLastDisplayOffset = Math.max(0, currentDisplayIndex - 1);
          rawCharInfos[rIdx] = {
            char: rawText[rIdx],
            rawOffset: rIdx,
            displayOffset: parentLastDisplayOffset,
            isRubyMarkup: true,
            charWidth: 0,
          };
          rIdx++;
        }
      } else {
        // Plain text char
        const ch = rawText[rIdx];
        const w = this.calculateCharWidth(ch);

        if (ch === '\n') {
          rawCharInfos[rIdx] = {
            char: ch,
            rawOffset: rIdx,
            displayOffset: currentDisplayIndex,
            isRubyMarkup: false,
            charWidth: 0,
          };
          displayString += '\n';
          rIdx++;
        } else {
          rawCharInfos[rIdx] = {
            char: ch,
            rawOffset: rIdx,
            displayOffset: currentDisplayIndex,
            isRubyMarkup: false,
            charWidth: w,
          };

          displayCharInfos.push({
            char: ch,
            displayOffset: currentDisplayIndex,
            rawOffset: rIdx,
            charWidth: w,
            isRubyParent: false,
          });

          displayString += ch;
          currentDisplayIndex++;
          rIdx++;
        }
      }
    }

    return { rawCharInfos, displayCharInfos, displayString };
  }
}
