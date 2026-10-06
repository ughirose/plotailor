/**
 * VerticalInspectorGeometryBridge - 縦書き幾何座標・3層インスペクター装飾位置同期ブリッジ
 *
 * 縦書き（writing-mode: vertical-rl）組版における文字・行・段落の幾何配置を厳密に計算し、
 * 3層インスペクター（Tier 1: 校正波線, Tier 2: 設定バッジ, Tier 3: 伏線アンカー）の
 * 装飾エレメントおよびツールチップの絶対画面座標・スクロール補正位置を提供する。
 */

export type InspectorTier = 1 | 2 | 3;

export interface GeometryViewportOptions {
  containerWidth: number;
  containerHeight: number;
  fontSize: number;
  lineHeight: number; // 行送り倍率 (例: 1.8) または ピクセル指定 (fontSize以上)
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  charsPerLine?: number;
  scrollLeft?: number;
  scrollTop?: number;
  rubyWidth?: number; // ルビ幅 (デフォルト: fontSize * 0.5)
}

export interface InspectorTargetRange {
  id: string;
  startIndex: number;
  endIndex: number; // exclusive
  tier: InspectorTier;
  text?: string;
  label?: string;
  hasRuby?: boolean;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ColumnSegmentRect extends BoundingBox {
  columnIndex: number;
  startRow: number;
  endRow: number;
}

export interface TierDecorationPlacement {
  id: string;
  tier: InspectorTier;
  boundingUnion: BoundingBox;
  columnSegments: ColumnSegmentRect[];
  decoration: {
    type: 'underline' | 'badge' | 'anchor';
    rect: BoundingBox;
    styleProps?: Record<string, string | number>;
  };
  tooltipAnchor: {
    x: number;
    y: number;
    placement: 'left' | 'right' | 'top' | 'bottom';
  };
}

export interface CharCoordinate {
  index: number;
  char: string;
  columnIndex: number;
  rowIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export class VerticalInspectorGeometryBridge {
  private options: Required<GeometryViewportOptions>;

  constructor(options: GeometryViewportOptions) {
    const fontSize = Math.max(1, options.fontSize);
    const lineHeightVal =
      options.lineHeight < 5 ? fontSize * options.lineHeight : options.lineHeight;

    this.options = {
      containerWidth: options.containerWidth,
      containerHeight: options.containerHeight,
      fontSize,
      lineHeight: lineHeightVal,
      paddingTop: options.paddingTop ?? 24,
      paddingRight: options.paddingRight ?? 24,
      paddingBottom: options.paddingBottom ?? 24,
      paddingLeft: options.paddingLeft ?? 24,
      charsPerLine:
        options.charsPerLine ??
        Math.max(
          1,
          Math.floor(
            (options.containerHeight - (options.paddingTop ?? 24) - (options.paddingBottom ?? 24)) /
              fontSize
          )
        ),
      scrollLeft: options.scrollLeft ?? 0,
      scrollTop: options.scrollTop ?? 0,
      rubyWidth: options.rubyWidth ?? Math.round(fontSize * 0.5),
    };
  }

  /**
   * 現在のビューポート設定を取得
   */
  public getOptions(): Required<GeometryViewportOptions> {
    return { ...this.options };
  }

  /**
   * ビューポート・スクロール設定を更新
   */
  public updateOptions(newOptions: Partial<GeometryViewportOptions>): void {
    const fontSize = newOptions.fontSize ? Math.max(1, newOptions.fontSize) : this.options.fontSize;
    let lineHeightVal = this.options.lineHeight;
    if (newOptions.lineHeight !== undefined) {
      lineHeightVal =
        newOptions.lineHeight < 5 ? fontSize * newOptions.lineHeight : newOptions.lineHeight;
    }

    this.options = {
      ...this.options,
      ...newOptions,
      fontSize,
      lineHeight: lineHeightVal,
    };
  }

  /**
   * 与えられたテキスト全体の全文字の縦書き（vertical-rl）グリッド座標を算出
   */
  public computeCharCoordinates(text: string): CharCoordinate[] {
    const {
      containerWidth,
      fontSize,
      lineHeight,
      paddingTop,
      paddingRight,
      charsPerLine,
      scrollLeft,
      scrollTop,
    } = this.options;

    const chars = Array.from(text);
    const coords: CharCoordinate[] = [];

    let currentColumn = 0;
    let currentRow = 0;

    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];

      // 改行文字または最大行数到達時の折り返し
      if (ch === '\n') {
        const colX = containerWidth - paddingRight - (currentColumn + 1) * lineHeight - scrollLeft;
        const rowY = paddingTop + currentRow * fontSize - scrollTop;

        coords.push({
          index: i,
          char: ch,
          columnIndex: currentColumn,
          rowIndex: currentRow,
          x: colX,
          y: rowY,
          width: lineHeight,
          height: fontSize,
        });

        currentColumn += 1;
        currentRow = 0;
        continue;
      }

      if (currentRow >= charsPerLine) {
        currentColumn += 1;
        currentRow = 0;
      }

      const colX = containerWidth - paddingRight - (currentColumn + 1) * lineHeight - scrollLeft;
      const rowY = paddingTop + currentRow * fontSize - scrollTop;

      coords.push({
        index: i,
        char: ch,
        columnIndex: currentColumn,
        rowIndex: currentRow,
        x: colX,
        y: rowY,
        width: fontSize,
        height: fontSize,
      });

      currentRow += 1;
    }

    return coords;
  }

  /**
   * 対象インスペクターレンジ（Tier 1〜3）に対する幾何配置・装飾矩形・ツールチップ座標を算出
   */
  public computePlacements(
    text: string,
    ranges: InspectorTargetRange[]
  ): TierDecorationPlacement[] {
    const charCoords = this.computeCharCoordinates(text);
    const placements: TierDecorationPlacement[] = [];

    for (const range of ranges) {
      const placement = this.computeSinglePlacement(charCoords, range);
      if (placement) {
        placements.push(placement);
      }
    }

    return placements;
  }

  /**
   * 単一インスペクターレンジの幾何配置計算
   */
  public computeSinglePlacement(
    charCoords: CharCoordinate[],
    range: InspectorTargetRange
  ): TierDecorationPlacement | null {
    const { fontSize, lineHeight, rubyWidth } = this.options;

    // レンジに含まれる文字座標を抽出
    const targetChars = charCoords.filter(
      (c) => c.index >= range.startIndex && c.index < range.endIndex && c.char !== '\n'
    );

    if (targetChars.length === 0) {
      return null;
    }

    // 列（Column）ごとに文字をグルーピング
    const colMap = new Map<number, CharCoordinate[]>();
    for (const c of targetChars) {
      const list = colMap.get(c.columnIndex) || [];
      list.push(c);
      colMap.set(c.columnIndex, list);
    }

    const columnSegments: ColumnSegmentRect[] = [];
    const sortedCols = Array.from(colMap.keys()).sort((a, b) => a - b);

    for (const colIndex of sortedCols) {
      const charsInCol = colMap.get(colIndex)!;
      charsInCol.sort((a, b) => a.rowIndex - b.rowIndex);

      const first = charsInCol[0];
      const last = charsInCol[charsInCol.length - 1];

      const startRow = first.rowIndex;
      const endRow = last.rowIndex;
      const height = (endRow - startRow + 1) * fontSize;

      columnSegments.push({
        columnIndex: colIndex,
        startRow,
        endRow,
        x: first.x,
        y: first.y,
        width: fontSize,
        height,
      });
    }

    // 全セグメントの外接矩形（Bounding Union）
    const minX = Math.min(...columnSegments.map((s) => s.x));
    const maxX = Math.max(...columnSegments.map((s) => s.x + s.width));
    const minY = Math.min(...columnSegments.map((s) => s.y));
    const maxY = Math.max(...columnSegments.map((s) => s.y + s.height));

    const boundingUnion: BoundingBox = {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };

    // 3層ごとの装飾エレメント幾何計算
    let decoration: TierDecorationPlacement['decoration'];
    const primarySegment = columnSegments[0]; // 開始列（最も右）

    if (range.tier === 1) {
      // Tier 1: 校正波線・下線（文字の左側に沿う）
      const underlineX = primarySegment.x - 2;
      decoration = {
        type: 'underline',
        rect: {
          x: underlineX,
          y: primarySegment.y,
          width: 3,
          height: primarySegment.height,
        },
        styleProps: {
          color: '#ef4444', // 赤色波線
          strokeWidth: 2,
        },
      };
    } else if (range.tier === 2) {
      // Tier 2: 設定バッジ（単語の上端または左上に浮遊）
      const badgeWidth = 42;
      const badgeHeight = 18;
      const badgeX = primarySegment.x - (badgeWidth - fontSize) / 2;
      const badgeY = Math.max(4, primarySegment.y - badgeHeight - 4);

      decoration = {
        type: 'badge',
        rect: {
          x: badgeX,
          y: badgeY,
          width: badgeWidth,
          height: badgeHeight,
        },
        styleProps: {
          background: 'rgba(59, 130, 246, 0.9)', // 青色バッジ
          borderRadius: 4,
          fontSize: 10,
        },
      };
    } else {
      // Tier 3: 伏線アンカー（列の右側・ガター領域、ルビがあればルビ外側）
      const rubyOffset = range.hasRuby ? rubyWidth + 2 : 0;
      const anchorWidth = 16;
      const anchorHeight = 16;
      const anchorX = primarySegment.x + fontSize + 2 + rubyOffset;
      const anchorY = primarySegment.y;

      decoration = {
        type: 'anchor',
        rect: {
          x: anchorX,
          y: anchorY,
          width: anchorWidth,
          height: anchorHeight,
        },
        styleProps: {
          color: '#a855f7', // 紫色アンカー
          icon: 'anchor',
        },
      };
    }

    // ツールチップアンカー位置の算出
    // 縦書きでは列の左側（文章進行方向）に配置するのが最も自然
    let tooltipX = minX - 12;
    let tooltipY = minY;
    let placement: 'left' | 'right' | 'top' | 'bottom' = 'left';

    // 左端が画面外（左コンテナ端）を超える場合は右側に配置
    if (tooltipX < this.options.paddingLeft) {
      tooltipX = maxX + 12;
      placement = 'right';
    }

    return {
      id: range.id,
      tier: range.tier,
      boundingUnion,
      columnSegments,
      decoration,
      tooltipAnchor: {
        x: tooltipX,
        y: tooltipY,
        placement,
      },
    };
  }

  /**
   * 指定した画面座標 (clickX, clickY) にヒットするインスペクター装飾レンジを特定
   */
  public hitTest(
    clickX: number,
    clickY: number,
    placements: TierDecorationPlacement[]
  ): TierDecorationPlacement | null {
    // 優先度: 装飾エレメント直撃 -> 列セグメント内部
    for (const p of placements) {
      const d = p.decoration.rect;
      if (
        clickX >= d.x &&
        clickX <= d.x + d.width &&
        clickY >= d.y &&
        clickY <= d.y + d.height
      ) {
        return p;
      }
    }

    for (const p of placements) {
      for (const seg of p.columnSegments) {
        if (
          clickX >= seg.x &&
          clickX <= seg.x + seg.width &&
          clickY >= seg.y &&
          clickY <= seg.y + seg.height
        ) {
          return p;
        }
      }
    }

    return null;
  }
}
