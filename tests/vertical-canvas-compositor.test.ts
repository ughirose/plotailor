// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { VerticalCanvasCompositor } from '../src/core/editor/VerticalCanvasCompositor.js';
import type { VerticalGlyphMetrics } from '../src/types/vertical-layout.js';

describe('VerticalCanvasCompositor (PR #739)', () => {
  let compositor: VerticalCanvasCompositor;

  beforeEach(() => {
    HTMLCanvasElement.prototype.getContext = () => null as any;
    compositor = new VerticalCanvasCompositor({
      width: 400,
      height: 600,
      fontSize: 20,
      lineHeight: 1.5,
    });
  });

  describe('calculateLayout', () => {
    it('calculates top-to-bottom and right-to-left coordinates', () => {
      const text = 'こんにちは';
      const metrics = compositor.calculateLayout(text);

      expect(metrics).toHaveLength(5);

      const lineSpacing = 20 * 1.5;
      const expectedX = 400 - lineSpacing + (lineSpacing - 20) / 2; // Rightmost line

      expect(metrics[0].x).toBeCloseTo(expectedX);
      expect(metrics[0].y).toBe(0);

      expect(metrics[1].x).toBeCloseTo(expectedX);
      expect(metrics[1].y).toBe(20);

      expect(metrics[4].x).toBeCloseTo(expectedX);
      expect(metrics[4].y).toBe(80);
    });

    it('handles line breaks and wraps to the next line (leftward)', () => {
      const text = '一行目\n二行目';
      const metrics = compositor.calculateLayout(text);

      const lineSpacing = 30; // 20 * 1.5
      const firstLineX = 400 - lineSpacing + (lineSpacing - 20) / 2;
      const secondLineX = firstLineX - lineSpacing;

      // 一行目 (Indices 0, 1, 2)
      expect(metrics[0].x).toBeCloseTo(firstLineX);
      expect(metrics[0].glyph).toBe('一');

      // \n is index 3
      expect(metrics[3].glyph).toBe('\n');

      // 二行目 (Indices 4, 5, 6)
      expect(metrics[4].x).toBeCloseTo(secondLineX);
      expect(metrics[4].glyph).toBe('二');
      expect(metrics[4].y).toBe(0);
    });

    it('auto-wraps based on canvas height', () => {
      // Canvas height is 600. Font size is 20. 600 / 20 = 30 chars per line max.
      // So index 29 is the 30th char (at y = 580)
      // index 30 is the 31st char, which should wrap and be at y = 0
      const text = 'あ'.repeat(35);
      const metrics = compositor.calculateLayout(text);

      expect(metrics[0].x).toBeGreaterThan(metrics[30].x); // Should have wrapped to a new line
      expect(metrics[30].y).toBe(0); // Restart from top
    });

    it('incorporates provided custom metrics (ruby, TCY, emphasis)', () => {
      const text = '12';
      const customData: Partial<VerticalGlyphMetrics>[] = [
        { isTcy: true, rubyText: 'じゅうに' },
        {},
      ];
      const metrics = compositor.calculateLayout(text, customData);

      expect(metrics[0].isTcy).toBe(true);
      expect(metrics[0].rubyText).toBe('じゅうに');
    });
  });

  describe('render', () => {
    it('executes canvas drawing operations without error', () => {
      const text = 'テスト';
      const metrics = compositor.calculateLayout(text, [
        { rubyText: 'て' },
        { emphasisStyle: 'dot' },
        {},
      ]);

      expect(() => compositor.render(metrics)).not.toThrow();
    });
  });

  describe('hitTest', () => {
    it('returns the correct index for exact coordinates', () => {
      const text = 'あいうえお';
      compositor.calculateLayout(text);

      const lineSpacing = 30;
      const expectedX = 400 - lineSpacing + (lineSpacing - 20) / 2;

      // Click center of first char
      const idx1 = compositor.hitTest(expectedX + 10, 10);
      expect(idx1).toBe(0);

      // Click center of third char
      const idx3 = compositor.hitTest(expectedX + 10, 50);
      expect(idx3).toBe(2);
    });

    it('returns -1 for out of bounds', () => {
      compositor.calculateLayout('テスト');

      expect(compositor.hitTest(-10, 50)).toBe(-1);
      expect(compositor.hitTest(500, 50)).toBe(-1);
    });
  });
});
