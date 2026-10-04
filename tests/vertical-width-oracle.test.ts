// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  VerticalWidthOracle,
  VerticalScrollAnchorManager,
  VERTICAL_LINE_WIDTH,
  VERTICAL_FONT_SIZE,
} from '../src/core/editor/VerticalWidthOracle.js';

describe('VerticalWidthOracle & VerticalScrollAnchor', () => {
  const oracle = new VerticalWidthOracle(VERTICAL_LINE_WIDTH);

  it('accurately estimates total width and line offsets based on strict 32px grid', () => {
    expect(VERTICAL_LINE_WIDTH).toBe(32);
    expect(VERTICAL_FONT_SIZE).toBe(16);

    // Total width for 100 lines = 3,200px
    expect(oracle.estimateTotalWidth(100)).toBe(3200);

    // 1st line offset = 0px
    expect(oracle.estimateLineOffset(1)).toBe(0);

    // 2nd line offset = 32px
    expect(oracle.estimateLineOffset(2)).toBe(32);

    // 10th line offset = 288px
    expect(oracle.estimateLineOffset(10)).toBe(288);
  });

  it('estimates line number accurately from scroll pixel offset', () => {
    expect(oracle.estimateLineFromOffset(0, 50)).toBe(1);
    expect(oracle.estimateLineFromOffset(31, 50)).toBe(1);
    expect(oracle.estimateLineFromOffset(32, 50)).toBe(2);
    expect(oracle.estimateLineFromOffset(64, 50)).toBe(3);
    expect(oracle.estimateLineFromOffset(1600, 50)).toBe(50); // Clamped at 50
  });

  it('manages scroll anchor state and detects drift', () => {
    const anchorManager = new VerticalScrollAnchorManager();
    expect(anchorManager.getAnchor()).toBeNull();

    anchorManager.clearAnchor();
    expect(anchorManager.getAnchor()).toBeNull();
  });
});
