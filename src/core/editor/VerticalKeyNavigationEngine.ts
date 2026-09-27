/**
 * VerticalKeyNavigationEngine - Geometric Cursor Movement & Arrow Key Translation Engine
 *
 * Provides pure geometric navigation logic for vertical writing mode (writing-mode: vertical-rl).
 *
 * Arrow Key Mappings for vertical-rl:
 * - ArrowUp:    In-line upward movement (previous character in text order)
 * - ArrowDown:  In-line downward movement (next character in text order)
 * - ArrowLeft:  Next visual line (left column in vertical-rl)
 * - ArrowRight: Previous visual line (right column in vertical-rl)
 */

export type ArrowKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

export interface VisualLine {
  lineIndex: number;
  startIndex: number;
  endIndex: number;
  text: string;
  isParagraphEnd: boolean;
}

export interface NavigationOptions {
  text: string;
  cursorOffset: number;
  key: ArrowKey;
  maxCharsPerLine?: number;
  goalCharIndex?: number;
}

export interface NavigationResult {
  newOffset: number;
  goalCharIndex: number;
  visualLineIndex: number;
  charIndexInLine: number;
}

export class VerticalKeyNavigationEngine {
  /**
   * Computes visual lines given raw text and optional maxCharsPerLine soft wrap width.
   */
  public static computeVisualLines(text: string, maxCharsPerLine?: number): VisualLine[] {
    const lines: VisualLine[] = [];
    if (text.length === 0) {
      return [
        {
          lineIndex: 0,
          startIndex: 0,
          endIndex: 0,
          text: '',
          isParagraphEnd: true,
        },
      ];
    }

    let lineIndex = 0;
    let pos = 0;

    while (pos <= text.length) {
      let nextNewline = text.indexOf('\n', pos);
      if (nextNewline === -1) {
        nextNewline = text.length;
      }

      const paraStart = pos;
      const paraEnd = nextNewline;
      const paraText = text.slice(paraStart, paraEnd);

      if (maxCharsPerLine && maxCharsPerLine > 0 && paraText.length > maxCharsPerLine) {
        let subPos = 0;
        while (subPos < paraText.length) {
          const subEnd = Math.min(subPos + maxCharsPerLine, paraText.length);
          const isLastSub = subEnd === paraText.length;
          lines.push({
            lineIndex: lineIndex++,
            startIndex: paraStart + subPos,
            endIndex: paraStart + subEnd,
            text: paraText.slice(subPos, subEnd),
            isParagraphEnd: isLastSub,
          });
          subPos = subEnd;
        }
      } else {
        lines.push({
          lineIndex: lineIndex++,
          startIndex: paraStart,
          endIndex: paraEnd,
          text: paraText,
          isParagraphEnd: true,
        });
      }

      pos = nextNewline + 1;
      if (nextNewline === text.length) {
        break;
      }
    }

    return lines;
  }

  /**
   * Finds the visual line index corresponding to a raw text offset.
   */
  public static findVisualLineIndex(lines: VisualLine[], offset: number): number {
    if (lines.length === 0) return 0;
    if (offset <= lines[0].startIndex) return 0;
    if (offset >= lines[lines.length - 1].endIndex) return lines.length - 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (offset >= line.startIndex && offset <= line.endIndex) {
        return i;
      }
    }

    return lines.length - 1;
  }

  /**
   * Calculates new cursor state following geometric arrow key movement in vertical-rl mode.
   */
  public static calculateNavigation(options: NavigationOptions): NavigationResult {
    const { text, cursorOffset, key, maxCharsPerLine, goalCharIndex } = options;

    const clampedOffset = Math.max(0, Math.min(text.length, cursorOffset));
    const lines = this.computeVisualLines(text, maxCharsPerLine);
    const currentLineIdx = this.findVisualLineIndex(lines, clampedOffset);
    const currentLine = lines[currentLineIdx];

    const currentCharIndexInLine = clampedOffset - currentLine.startIndex;

    let newOffset = clampedOffset;
    let newGoalCharIndex = goalCharIndex ?? currentCharIndexInLine;
    let targetLineIdx = currentLineIdx;

    switch (key) {
      case 'ArrowUp': {
        if (clampedOffset > 0) {
          newOffset = clampedOffset - 1;
        } else {
          newOffset = 0;
        }
        targetLineIdx = this.findVisualLineIndex(lines, newOffset);
        const targetLine = lines[targetLineIdx];
        newGoalCharIndex = Math.max(0, newOffset - targetLine.startIndex);
        break;
      }

      case 'ArrowDown': {
        if (clampedOffset < text.length) {
          newOffset = clampedOffset + 1;
        } else {
          newOffset = text.length;
        }
        targetLineIdx = this.findVisualLineIndex(lines, newOffset);
        const targetLine = lines[targetLineIdx];
        newGoalCharIndex = Math.max(0, newOffset - targetLine.startIndex);
        break;
      }

      case 'ArrowLeft': {
        const targetGoal = goalCharIndex ?? currentCharIndexInLine;
        if (currentLineIdx + 1 < lines.length) {
          targetLineIdx = currentLineIdx + 1;
        } else {
          targetLineIdx = currentLineIdx;
        }
        const targetLine = lines[targetLineIdx];
        const targetCharIdx = Math.min(targetGoal, targetLine.text.length);
        newOffset = targetLine.startIndex + targetCharIdx;
        newGoalCharIndex = targetGoal;
        break;
      }

      case 'ArrowRight': {
        const targetGoal = goalCharIndex ?? currentCharIndexInLine;
        if (currentLineIdx - 1 >= 0) {
          targetLineIdx = currentLineIdx - 1;
        } else {
          targetLineIdx = currentLineIdx;
        }
        const targetLine = lines[targetLineIdx];
        const targetCharIdx = Math.min(targetGoal, targetLine.text.length);
        newOffset = targetLine.startIndex + targetCharIdx;
        newGoalCharIndex = targetGoal;
        break;
      }
    }

    const finalLine = lines[targetLineIdx];
    const finalCharIdxInLine = Math.max(0, newOffset - finalLine.startIndex);

    return {
      newOffset,
      goalCharIndex: newGoalCharIndex,
      visualLineIndex: targetLineIdx,
      charIndexInLine: finalCharIdxInLine,
    };
  }
}
