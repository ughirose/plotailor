import { describe, it, expect } from 'vitest';
import {
  GutterMarginCalculator,
  CalculationInput,
} from '../src/core/editor/GutterMarginCalculator';

describe('GutterMarginCalculator', () => {
  describe('calculateSpineThickness', () => {
    it('calculates spine thickness correctly for 200 pages with 0.08mm paper', () => {
      // 200 pages = 100 leaves. 100 * 0.08 = 8.00mm
      const result = GutterMarginCalculator.calculateSpineThickness(200, 0.08);
      expect(result.leafCount).toBe(100);
      expect(result.spineThicknessMm).toBe(8.0);
    });

    it('calculates spine thickness for 300 pages with 0.11mm paper', () => {
      // 300 pages = 150 leaves. 150 * 0.11 = 16.50mm
      const result = GutterMarginCalculator.calculateSpineThickness(300, 0.11);
      expect(result.leafCount).toBe(150);
      expect(result.spineThicknessMm).toBe(16.5);
    });

    it('rounds up odd page counts when computing leaf count', () => {
      // 201 pages = 101 leaves. 101 * 0.10 = 10.10mm
      const result = GutterMarginCalculator.calculateSpineThickness(201, 0.1);
      expect(result.leafCount).toBe(101);
      expect(result.spineThicknessMm).toBe(10.1);
    });

    it('includes cover thickness allowance when specified', () => {
      // 100 pages = 50 leaves. 50 * 0.09 + 0.3 (cover) = 4.80mm
      const result = GutterMarginCalculator.calculateSpineThickness(100, 0.09, 0.3);
      expect(result.spineThicknessMm).toBe(4.8);
    });
  });

  describe('calculate with Trim Presets', () => {
    it('calculates Bunko (A6) preset dimensions and dynamic gutter', () => {
      const input: CalculationInput = {
        totalPages: 200, // 100 leaves -> spine = 8mm
        paperThicknessMm: 0.08,
        trimSize: 'A6',
      };

      const result = GutterMarginCalculator.calculate(input);

      expect(result.trimSize).toBe('A6');
      expect(result.pageWidthMm).toBe(105);
      expect(result.pageHeightMm).toBe(148);
      expect(result.spineThicknessMm).toBe(8);

      // Base gutter = 15mm. Extra gutter = 8 * 0.2 = 1.6mm. Calculated gutter = 16.6mm
      expect(result.calculatedGutterMm).toBe(16.6);
      expect(result.calculatedForeEdgeMm).toBe(12);

      // Printable width = 105 - (16.6 + 12) = 76.4mm
      expect(result.printableWidthMm).toBe(76.4);
      // Printable height = 148 - (12 + 15) = 121mm
      expect(result.printableHeightMm).toBe(121);
    });

    it('calculates Shinsho preset dimensions', () => {
      const input: CalculationInput = {
        totalPages: 240, // 120 leaves * 0.09 = 10.8mm
        paperThicknessMm: 0.09,
        trimSize: 'SHINSHO',
      };

      const result = GutterMarginCalculator.calculate(input);

      expect(result.trimSize).toBe('SHINSHO');
      expect(result.pageWidthMm).toBe(103);
      expect(result.pageHeightMm).toBe(182);
      expect(result.spineThicknessMm).toBe(10.8);
      // Base gutter = 15mm + (10.8 * 0.2 = 2.16) = 17.16mm
      expect(result.calculatedGutterMm).toBe(17.16);
    });

    it('calculates B6 preset dimensions', () => {
      const input: CalculationInput = {
        totalPages: 160, // 80 leaves * 0.10 = 8.0mm
        paperThicknessMm: 0.1,
        trimSize: 'B6',
      };

      const result = GutterMarginCalculator.calculate(input);

      expect(result.trimSize).toBe('B6');
      expect(result.pageWidthMm).toBe(128);
      expect(result.pageHeightMm).toBe(182);
      // Base gutter = 18mm + (8 * 0.2 = 1.6) = 19.6mm
      expect(result.calculatedGutterMm).toBe(19.6);
    });

    it('calculates A5 preset dimensions', () => {
      const input: CalculationInput = {
        totalPages: 120, // 60 leaves * 0.11 = 6.6mm
        paperThicknessMm: 0.11,
        trimSize: 'A5',
      };

      const result = GutterMarginCalculator.calculate(input);

      expect(result.trimSize).toBe('A5');
      expect(result.pageWidthMm).toBe(148);
      expect(result.pageHeightMm).toBe(210);
      // Base gutter = 20mm + (6.6 * 0.2 = 1.32) = 21.32mm
      expect(result.calculatedGutterMm).toBe(21.32);
    });

    it('supports custom page dimensions and custom base margins', () => {
      const input: CalculationInput = {
        totalPages: 100,
        paperThicknessMm: 0.08,
        trimSize: 'CUSTOM',
        customPageWidthMm: 180,
        customPageHeightMm: 250,
        baseGutterMm: 25,
        baseForeEdgeMm: 20,
        topMarginMm: 22,
        bottomMarginMm: 25,
      };

      const result = GutterMarginCalculator.calculate(input);

      expect(result.pageWidthMm).toBe(180);
      expect(result.pageHeightMm).toBe(250);
      expect(result.spineThicknessMm).toBe(4);
      // Base gutter = 25mm + (4 * 0.2 = 0.8) = 25.8mm
      expect(result.calculatedGutterMm).toBe(25.8);
      expect(result.calculatedForeEdgeMm).toBe(20);
      expect(result.printableWidthMm).toBe(134.2);
      expect(result.printableHeightMm).toBe(203);
    });
  });

  describe('Binding Method Differences', () => {
    it('does not expand gutter margin for saddle stitch (SADDLE_STITCH)', () => {
      const input: CalculationInput = {
        totalPages: 32,
        paperThicknessMm: 0.09,
        trimSize: 'A5',
        bindingMethod: 'SADDLE_STITCH',
      };

      const result = GutterMarginCalculator.calculate(input);

      expect(result.bindingMethod).toBe('SADDLE_STITCH');
      // Saddle stitch base gutter remains base value (20mm)
      expect(result.calculatedGutterMm).toBe(20);
    });
  });

  describe('Facing Pages (見開き) and Opening Direction', () => {
    it('calculates correct margins for Right-to-Left (右開き / 縦書き) page layout', () => {
      const input: CalculationInput = {
        totalPages: 200,
        paperThicknessMm: 0.08,
        trimSize: 'A6',
        openingDirection: 'RIGHT_TO_LEFT',
      };

      // Odd page (page 1) -> Right page in spread
      // Right page has fore-edge on the right, gutter on the left
      const page1 = GutterMarginCalculator.getPageMarginDetail(1, input);
      expect(page1.isRightPage).toBe(true);
      expect(page1.leftMarginMm).toBe(page1.gutterMarginMm);
      expect(page1.rightMarginMm).toBe(page1.foreEdgeMarginMm);

      // Even page (page 2) -> Left page in spread
      // Left page has fore-edge on the left, gutter on the right
      const page2 = GutterMarginCalculator.getPageMarginDetail(2, input);
      expect(page2.isRightPage).toBe(false);
      expect(page2.leftMarginMm).toBe(page2.foreEdgeMarginMm);
      expect(page2.rightMarginMm).toBe(page2.gutterMarginMm);
    });

    it('calculates correct margins for Left-to-Right (左開き / 横書き) page layout', () => {
      const input: CalculationInput = {
        totalPages: 200,
        paperThicknessMm: 0.08,
        trimSize: 'A6',
        openingDirection: 'LEFT_TO_RIGHT',
      };

      // Odd page (page 1) -> Left page in spread
      const page1 = GutterMarginCalculator.getPageMarginDetail(1, input);
      expect(page1.isRightPage).toBe(false);
      expect(page1.leftMarginMm).toBe(page1.gutterMarginMm);
      expect(page1.rightMarginMm).toBe(page1.foreEdgeMarginMm);

      // Even page (page 2) -> Right page in spread
      const page2 = GutterMarginCalculator.getPageMarginDetail(2, input);
      expect(page2.isRightPage).toBe(true);
      expect(page2.leftMarginMm).toBe(page2.foreEdgeMarginMm);
      expect(page2.rightMarginMm).toBe(page2.gutterMarginMm);
    });

    it('returns facing page spread margin details via getSpreadMarginDetail', () => {
      const input: CalculationInput = {
        totalPages: 200,
        paperThicknessMm: 0.08,
        trimSize: 'A6',
        openingDirection: 'RIGHT_TO_LEFT',
      };

      const spread = GutterMarginCalculator.getSpreadMarginDetail(2, input);

      expect(spread.leftPage.pageNumber).toBe(2);
      expect(spread.rightPage.pageNumber).toBe(3);
      expect(spread.totalSpreadWidthMm).toBe(210); // 105 * 2
      expect(spread.spineThicknessMm).toBe(8);
    });
  });

  describe('Warnings Generation', () => {
    it('warns when page count is odd', () => {
      const input: CalculationInput = {
        totalPages: 101,
        paperThicknessMm: 0.08,
        trimSize: 'A6',
      };

      const result = GutterMarginCalculator.calculate(input);
      expect(result.warnings.some((w) => w.includes('奇数'))).toBe(true);
    });

    it('warns when page count is not a multiple of 4', () => {
      const input: CalculationInput = {
        totalPages: 102,
        paperThicknessMm: 0.08,
        trimSize: 'A6',
      };

      const result = GutterMarginCalculator.calculate(input);
      expect(result.warnings.some((w) => w.includes('4の倍数'))).toBe(true);
    });

    it('warns when spine thickness exceeds 30mm for perfect binding', () => {
      const input: CalculationInput = {
        totalPages: 700, // 350 * 0.1 = 35mm
        paperThicknessMm: 0.1,
        trimSize: 'A5',
        bindingMethod: 'PERFECT_BINDING',
      };

      const result = GutterMarginCalculator.calculate(input);
      expect(result.warnings.some((w) => w.includes('背幅が30mm'))).toBe(true);
    });

    it('warns when saddle stitch page count exceeds 64 pages', () => {
      const input: CalculationInput = {
        totalPages: 80,
        paperThicknessMm: 0.09,
        trimSize: 'A5',
        bindingMethod: 'SADDLE_STITCH',
      };

      const result = GutterMarginCalculator.calculate(input);
      expect(result.warnings.some((w) => w.includes('中綴じで64ページ'))).toBe(true);
    });

    it('warns when paper thickness is out of typical range', () => {
      const input: CalculationInput = {
        totalPages: 100,
        paperThicknessMm: 0.03, // unusually thin
        trimSize: 'A6',
      };

      const result = GutterMarginCalculator.calculate(input);
      expect(result.warnings.some((w) => w.includes('紙厚'))).toBe(true);
    });

    it('produces no warnings for ideal configuration', () => {
      const input: CalculationInput = {
        totalPages: 200, // multiple of 4
        paperThicknessMm: 0.08, // standard
        trimSize: 'A6',
        bindingMethod: 'PERFECT_BINDING',
      };

      const result = GutterMarginCalculator.calculate(input);
      expect(result.warnings).toEqual([]);
    });
  });

  describe('Presets Static Members', () => {
    it('contains valid TRIM_PRESETS', () => {
      expect(GutterMarginCalculator.TRIM_PRESETS.A6.widthMm).toBe(105);
      expect(GutterMarginCalculator.TRIM_PRESETS.SHINSHO.widthMm).toBe(103);
      expect(GutterMarginCalculator.TRIM_PRESETS.B6.widthMm).toBe(128);
      expect(GutterMarginCalculator.TRIM_PRESETS.A5.widthMm).toBe(148);
    });

    it('contains valid PAPER_PRESETS', () => {
      expect(GutterMarginCalculator.PAPER_PRESETS.length).toBeGreaterThanOrEqual(5);
      const joshitsu55 = GutterMarginCalculator.PAPER_PRESETS.find((p) => p.id === 'JOSHITSU_55');
      expect(joshitsu55?.thicknessMm).toBe(0.08);
    });
  });
});
