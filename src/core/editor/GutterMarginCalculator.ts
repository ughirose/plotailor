/**
 * GutterMarginCalculator - Spine thickness and dynamic gutter/fore-edge margin calculator
 * for commercial publishing and indie (doujinshi) print production.
 *
 * Calculates spine width (束厚/背幅) from page count and paper thickness,
 * dynamically computes optimum gutter (ノド元) and fore-edge (小口) margins for facing pages,
 * and supports standard JIS and print presets (A6 文庫, 新書, B6, A5).
 */

export type TrimSize = 'A6' | 'SHINSHO' | 'B6' | 'A5' | 'CUSTOM';
export type BindingMethod = 'PERFECT_BINDING' | 'SADDLE_STITCH';
export type OpeningDirection = 'RIGHT_TO_LEFT' | 'LEFT_TO_RIGHT';

export interface TrimPreset {
  id: TrimSize;
  name: string;
  widthMm: number;
  heightMm: number;
  defaultBaseGutterMm: number;
  defaultBaseForeEdgeMm: number;
  defaultTopMm: number;
  defaultBottomMm: number;
}

export interface PaperPreset {
  id: string;
  name: string;
  thicknessMm: number;
  description: string;
}

export interface CalculationInput {
  totalPages: number;
  paperThicknessMm: number;
  trimSize?: TrimSize;
  customPageWidthMm?: number;
  customPageHeightMm?: number;
  baseGutterMm?: number;
  baseForeEdgeMm?: number;
  topMarginMm?: number;
  bottomMarginMm?: number;
  bindingMethod?: BindingMethod;
  openingDirection?: OpeningDirection;
  coverThicknessMm?: number;
  gutterExpansionFactor?: number;
}

export interface PageMarginDetail {
  pageNumber: number;
  isEven: boolean;
  isRightPage: boolean;
  leftMarginMm: number;
  rightMarginMm: number;
  gutterMarginMm: number;
  foreEdgeMarginMm: number;
  topMarginMm: number;
  bottomMarginMm: number;
  printableWidthMm: number;
  printableHeightMm: number;
}

export interface SpreadMarginDetail {
  leftPage: PageMarginDetail;
  rightPage: PageMarginDetail;
  spineThicknessMm: number;
  totalSpreadWidthMm: number;
}

export interface CalculationResult {
  spineThicknessMm: number;
  leafCount: number;
  calculatedGutterMm: number;
  calculatedForeEdgeMm: number;
  topMarginMm: number;
  bottomMarginMm: number;
  printableWidthMm: number;
  printableHeightMm: number;
  trimSize: TrimSize;
  pageWidthMm: number;
  pageHeightMm: number;
  bindingMethod: BindingMethod;
  openingDirection: OpeningDirection;
  paperThicknessMm: number;
  coverThicknessMm: number;
  warnings: string[];
}

export class GutterMarginCalculator {
  /** Standard Trim Presets */
  public static readonly TRIM_PRESETS: Record<TrimSize, TrimPreset> = {
    A6: {
      id: 'A6',
      name: '文庫判 (A6)',
      widthMm: 105,
      heightMm: 148,
      defaultBaseGutterMm: 15,
      defaultBaseForeEdgeMm: 12,
      defaultTopMm: 12,
      defaultBottomMm: 15,
    },
    SHINSHO: {
      id: 'SHINSHO',
      name: '新書判',
      widthMm: 103,
      heightMm: 182,
      defaultBaseGutterMm: 15,
      defaultBaseForeEdgeMm: 12,
      defaultTopMm: 14,
      defaultBottomMm: 16,
    },
    B6: {
      id: 'B6',
      name: 'B6判 (単行本)',
      widthMm: 128,
      heightMm: 182,
      defaultBaseGutterMm: 18,
      defaultBaseForeEdgeMm: 14,
      defaultTopMm: 15,
      defaultBottomMm: 18,
    },
    A5: {
      id: 'A5',
      name: 'A5判 (学術誌・同人誌)',
      widthMm: 148,
      heightMm: 210,
      defaultBaseGutterMm: 20,
      defaultBaseForeEdgeMm: 15,
      defaultTopMm: 18,
      defaultBottomMm: 20,
    },
    CUSTOM: {
      id: 'CUSTOM',
      name: 'カスタムサイズ',
      widthMm: 105,
      heightMm: 148,
      defaultBaseGutterMm: 15,
      defaultBaseForeEdgeMm: 12,
      defaultTopMm: 12,
      defaultBottomMm: 15,
    },
  };

  /** Standard Paper Thickness Presets */
  public static readonly PAPER_PRESETS: PaperPreset[] = [
    {
      id: 'JOSHITSU_55',
      name: '上質紙 55kg',
      thicknessMm: 0.08,
      description: '標準的な文庫・新書の本文用紙（約0.08mm）',
    },
    {
      id: 'JOSHITSU_70',
      name: '上質紙 70kg',
      thicknessMm: 0.09,
      description: 'やや厚手の本文用紙・同人誌標準（約0.09mm）',
    },
    {
      id: 'SHOKYO_72_5',
      name: '書籍用紙 72.5kg',
      thicknessMm: 0.1,
      description: '淡いクリーム色の商業小説本文用紙（約0.10mm）',
    },
    {
      id: 'JOSHITSU_90',
      name: '上質紙 90kg',
      thicknessMm: 0.11,
      description: 'イラスト本・表紙・しっかりした本文用紙（約0.11mm）',
    },
    {
      id: 'BULKY_14',
      name: 'バルキー紙・漫画用紙',
      thicknessMm: 0.14,
      description: '厚手で軽量なコミック誌・高嵩高紙（約0.14mm）',
    },
  ];

  /**
   * Calculates spine thickness (束厚/背幅) in mm.
   */
  public static calculateSpineThickness(
    totalPages: number,
    paperThicknessMm: number,
    coverThicknessMm = 0
  ): { spineThicknessMm: number; leafCount: number } {
    const validPages = Math.max(0, totalPages);
    const validPaperThickness = Math.max(0, paperThicknessMm);
    const validCoverThickness = Math.max(0, coverThicknessMm);

    const leafCount = Math.ceil(validPages / 2);
    const spineThicknessMm = GutterMarginCalculator.roundTo(
      leafCount * validPaperThickness + validCoverThickness,
      2
    );

    return { spineThicknessMm, leafCount };
  }

  /**
   * Main calculation method to compute optimum gutter margin, fore-edge margin,
   * printable area, spine thickness, and quality warnings.
   */
  public static calculate(input: CalculationInput): CalculationResult {
    const totalPages = Math.max(1, input.totalPages);
    const paperThicknessMm = Math.max(0.01, input.paperThicknessMm);
    const trimSize = input.trimSize ?? 'A6';
    const preset = GutterMarginCalculator.TRIM_PRESETS[trimSize];

    const pageWidthMm =
      trimSize === 'CUSTOM' && input.customPageWidthMm !== undefined
        ? input.customPageWidthMm
        : preset.widthMm;

    const pageHeightMm =
      trimSize === 'CUSTOM' && input.customPageHeightMm !== undefined
        ? input.customPageHeightMm
        : preset.heightMm;

    const baseGutterMm = input.baseGutterMm ?? preset.defaultBaseGutterMm;
    const baseForeEdgeMm = input.baseForeEdgeMm ?? preset.defaultBaseForeEdgeMm;
    const topMarginMm = input.topMarginMm ?? preset.defaultTopMm;
    const bottomMarginMm = input.bottomMarginMm ?? preset.defaultBottomMm;

    const bindingMethod = input.bindingMethod ?? 'PERFECT_BINDING';
    const openingDirection = input.openingDirection ?? 'RIGHT_TO_LEFT';
    const coverThicknessMm = input.coverThicknessMm ?? 0;
    const gutterExpansionFactor = input.gutterExpansionFactor ?? 0.2;

    const { spineThicknessMm, leafCount } = GutterMarginCalculator.calculateSpineThickness(
      totalPages,
      paperThicknessMm,
      coverThicknessMm
    );

    let calculatedGutterMm = baseGutterMm;
    if (bindingMethod === 'PERFECT_BINDING') {
      const extraGutter = spineThicknessMm * gutterExpansionFactor;
      calculatedGutterMm = GutterMarginCalculator.roundTo(baseGutterMm + extraGutter, 2);
    } else {
      calculatedGutterMm = baseGutterMm;
    }

    const calculatedForeEdgeMm = baseForeEdgeMm;

    const printableWidthMm = GutterMarginCalculator.roundTo(
      pageWidthMm - (calculatedGutterMm + calculatedForeEdgeMm),
      2
    );

    const printableHeightMm = GutterMarginCalculator.roundTo(
      pageHeightMm - (topMarginMm + bottomMarginMm),
      2
    );

    const warnings = GutterMarginCalculator.generateWarnings({
      totalPages,
      paperThicknessMm,
      spineThicknessMm,
      printableWidthMm,
      printableHeightMm,
      bindingMethod,
    });

    return {
      spineThicknessMm,
      leafCount,
      calculatedGutterMm,
      calculatedForeEdgeMm,
      topMarginMm,
      bottomMarginMm,
      printableWidthMm,
      printableHeightMm,
      trimSize,
      pageWidthMm,
      pageHeightMm,
      bindingMethod,
      openingDirection,
      paperThicknessMm,
      coverThicknessMm,
      warnings,
    };
  }

  /**
   * Gets specific page margin details for a given page number.
   */
  public static getPageMarginDetail(
    pageNumber: number,
    input: CalculationInput
  ): PageMarginDetail {
    const calcResult = GutterMarginCalculator.calculate(input);
    const isEven = pageNumber % 2 === 0;

    let isRightPage: boolean;
    if (calcResult.openingDirection === 'RIGHT_TO_LEFT') {
      // Right-opening (右開き - vertical text): Odd pages are on the right, even pages on the left
      isRightPage = !isEven;
    } else {
      // Left-opening (左開き - horizontal text): Even pages are on the right, odd pages on the left
      isRightPage = isEven;
    }

    let leftMarginMm: number;
    let rightMarginMm: number;

    if (isRightPage) {
      // For right page: Right side is fore-edge (小口), Left side is gutter (ノド)
      leftMarginMm = calcResult.calculatedGutterMm;
      rightMarginMm = calcResult.calculatedForeEdgeMm;
    } else {
      // For left page: Left side is fore-edge (小口), Right side is gutter (ノド)
      leftMarginMm = calcResult.calculatedForeEdgeMm;
      rightMarginMm = calcResult.calculatedGutterMm;
    }

    return {
      pageNumber,
      isEven,
      isRightPage,
      leftMarginMm,
      rightMarginMm,
      gutterMarginMm: calcResult.calculatedGutterMm,
      foreEdgeMarginMm: calcResult.calculatedForeEdgeMm,
      topMarginMm: calcResult.topMarginMm,
      bottomMarginMm: calcResult.bottomMarginMm,
      printableWidthMm: calcResult.printableWidthMm,
      printableHeightMm: calcResult.printableHeightMm,
    };
  }

  /**
   * Gets facing pages (見開き) spread margin detail given left page or right page number.
   */
  public static getSpreadMarginDetail(
    leftPageNumber: number,
    input: CalculationInput
  ): SpreadMarginDetail {
    const calcResult = GutterMarginCalculator.calculate(input);

    const leftPage = GutterMarginCalculator.getPageMarginDetail(leftPageNumber, input);
    const rightPageNumber = leftPageNumber + 1;
    const rightPage = GutterMarginCalculator.getPageMarginDetail(rightPageNumber, input);

    const totalSpreadWidthMm = GutterMarginCalculator.roundTo(
      calcResult.pageWidthMm * 2,
      2
    );

    return {
      leftPage,
      rightPage,
      spineThicknessMm: calcResult.spineThicknessMm,
      totalSpreadWidthMm,
    };
  }

  private static generateWarnings(params: {
    totalPages: number;
    paperThicknessMm: number;
    spineThicknessMm: number;
    printableWidthMm: number;
    printableHeightMm: number;
    bindingMethod: BindingMethod;
  }): string[] {
    const warnings: string[] = [];

    if (params.totalPages % 2 !== 0) {
      warnings.push(
        '総ページ数が奇数です。商業出版・印刷仕様では総ページ数を偶数（通常4の倍数）に揃えてください。'
      );
    } else if (params.totalPages % 4 !== 0) {
      warnings.push(
        '総ページ数が4の倍数ではありません。折記号・面付け（台割）の調整が必要になる場合があります。'
      );
    }

    if (params.printableWidthMm < 50) {
      warnings.push(
        `版面幅（${params.printableWidthMm}mm）が狭すぎます（推奨50mm以上）。余白設定や判型を見直してください。`
      );
    }

    if (params.printableHeightMm < 80) {
      warnings.push(
        `版面高（${params.printableHeightMm}mm）が狭すぎます。天地余白設定を見直してください。`
      );
    }

    if (params.bindingMethod === 'PERFECT_BINDING' && params.spineThicknessMm > 30) {
      warnings.push(
        `背幅が30mm（${params.spineThicknessMm}mm）を超えています。大型製本仕様への変更や分冊を検討してください。`
      );
    }

    if (params.bindingMethod === 'SADDLE_STITCH' && params.totalPages > 64) {
      warnings.push(
        `中綴じで64ページ（${params.totalPages}p）を超えています。中央部が浮きやすいため無線綴じを推奨します。`
      );
    }

    if (params.paperThicknessMm < 0.05 || params.paperThicknessMm > 0.2) {
      warnings.push(
        `指定された紙厚（${params.paperThicknessMm}mm）は一般的な書籍本文用紙（0.08mm〜0.11mm）の範囲外です。`
      );
    }

    return warnings;
  }

  private static roundTo(value: number, decimals: number): number {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }
}
