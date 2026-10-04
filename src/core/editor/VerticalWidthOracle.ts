import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { Extension } from '@codemirror/state';
import { isVerticalMode } from './VerticalWritingExtension.js';

export const VERTICAL_LINE_WIDTH = 32; // px (strict geometric block axis size)
export const VERTICAL_FONT_SIZE = 16;  // px

/**
 * Geometric line width oracle for vertical-rl writing mode.
 * Provides invariant 32px-per-line block size calculation for unrendered off-screen lines,
 * completely preventing CodeMirror 6 origin drift and scroll jumping.
 */
export class VerticalWidthOracle {
  constructor(public readonly lineWidth: number = VERTICAL_LINE_WIDTH) {}

  /**
   * Estimates total horizontal block width for the entire document in vertical-rl mode.
   */
  estimateTotalWidth(lineCount: number): number {
    return Math.max(1, lineCount) * this.lineWidth;
  }

  /**
   * Estimates pixel offset from right origin for a specific 1-indexed line number.
   */
  estimateLineOffset(lineNumber: number): number {
    return Math.max(0, lineNumber - 1) * this.lineWidth;
  }

  /**
   * Estimates 1-indexed line number at a given pixel offset.
   */
  estimateLineFromOffset(offsetPx: number, totalLines: number): number {
    if (offsetPx <= 0) return 1;
    const line = Math.floor(offsetPx / this.lineWidth) + 1;
    return Math.min(totalLines, Math.max(1, line));
  }
}

export interface ScrollAnchorState {
  topLineNumber: number;
  topLineOffsetChars: number;
  expectedScrollOffset: number;
}

/**
 * Logical Line Scroll Anchor for vertical writing.
 * Instead of relying on volatile absolute pixel scrollLeft, captures the line number
 * and character offset at the active viewport edge and recalibrates scroll position
 * after DOM rendering or dynamic content expansion.
 */
export class VerticalScrollAnchorManager {
  private anchor: ScrollAnchorState | null = null;
  private oracle = new VerticalWidthOracle();

  /**
   * Captures the logical scroll anchor before DOM mutation or layout shift.
   */
  captureAnchor(view: EditorView): ScrollAnchorState | null {
    if (!isVerticalMode(view)) return null;

    const scrollDOM = view.scrollDOM;
    const scrollOffset = Math.abs(scrollDOM.scrollLeft);
    const doc = view.state.doc;
    const lineNumber = this.oracle.estimateLineFromOffset(scrollOffset, doc.lines);

    const line = doc.line(lineNumber);
    this.anchor = {
      topLineNumber: lineNumber,
      topLineOffsetChars: line.from,
      expectedScrollOffset: this.oracle.estimateLineOffset(lineNumber),
    };
    return this.anchor;
  }

  /**
   * Recalibrates scroll position based on captured logical anchor.
   */
  recalibrate(view: EditorView): boolean {
    if (!this.anchor || !isVerticalMode(view)) return false;

    const doc = view.state.doc;
    const targetLineNumber = Math.min(this.anchor.topLineNumber, doc.lines);
    const targetOffset = this.oracle.estimateLineOffset(targetLineNumber);

    const scrollDOM = view.scrollDOM;
    const currentOffset = Math.abs(scrollDOM.scrollLeft);

    // If drifted by more than half a line (16px), recalibrate to anchor
    if (Math.abs(currentOffset - targetOffset) >= VERTICAL_LINE_WIDTH / 2) {
      // For vertical-rl, scrollLeft can be negative or positive depending on browser engine
      const isNegative = scrollDOM.scrollLeft < 0;
      scrollDOM.scrollLeft = isNegative ? -targetOffset : targetOffset;
      return true;
    }

    return false;
  }

  clearAnchor() {
    this.anchor = null;
  }

  getAnchor(): ScrollAnchorState | null {
    return this.anchor;
  }
}

/**
 * CodeMirror 6 Theme enforcing strict geometric line grid in vertical mode:
 * - font-size: 16px
 * - line-height: 32px
 * - strict block size column alignment
 */
export const verticalGeometricGridTheme = EditorView.theme({
  '&.cm-vertical-rl .cm-content, .vertical-rl & .cm-content': {
    writingMode: 'vertical-rl',
    WebkitWritingMode: 'vertical-rl',
    fontSize: `${VERTICAL_FONT_SIZE}px`,
    lineHeight: `${VERTICAL_LINE_WIDTH}px`,
  },
  '&.cm-vertical-rl .cm-line, .vertical-rl & .cm-line': {
    minWidth: `${VERTICAL_LINE_WIDTH}px`,
    width: `${VERTICAL_LINE_WIDTH}px`,
    boxSizing: 'border-box',
    lineHeight: `${VERTICAL_LINE_WIDTH}px`,
    fontSize: `${VERTICAL_FONT_SIZE}px`,
  },
});

/**
 * ViewPlugin that applies the Vertical Width Oracle and Scroll Anchor stabilization.
 */
export const verticalScrollAnchorPlugin = ViewPlugin.fromClass(
  class {
    private anchorManager = new VerticalScrollAnchorManager();

    constructor(public view: EditorView) {}

    update(update: ViewUpdate) {
      if (!isVerticalMode(update.view)) return;

      if (update.docChanged) {
        this.anchorManager.captureAnchor(update.view);
      }

      if (update.geometryChanged) {
        this.anchorManager.recalibrate(update.view);
      }
    }
  }
);

export function verticalWidthOracleExtension(): Extension {
  return [
    verticalGeometricGridTheme,
    verticalScrollAnchorPlugin,
  ];
}
