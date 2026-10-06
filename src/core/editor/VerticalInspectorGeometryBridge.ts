/**
 * VerticalInspectorGeometryBridge.ts
 *
 * Implements vertical writing mode (writing-mode: vertical-rl) geometric coordinate
 * calculation and 3-Tier Inspector decoration alignment bridge for Plotailor Literature IDE.
 *
 * Features:
 * - Geometric coordinate math for vertical-rl (right-to-left column progression, top-to-bottom text progression).
 * - Multi-column line wrapping boundary detection and fragment range splitting.
 * - Precision bounding box calculation with Ruby text annotation offset alignment.
 * - Tier 1 (wavy line), Tier 2 (badge), and Tier 3 (foreshadowing anchor) decoration positioning.
 * - Screen absolute coordinate conversion with scroll offset compensation and auto-flip tooltip placement.
 */

export type WritingMode = 'vertical-rl' | 'horizontal-tb';

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface BridgeLayoutOptions {
  writingMode?: WritingMode; // Default: 'vertical-rl'
  fontSize?: number; // Default: 16
  lineHeight?: number; // Line height multiplier, default: 2.0
  linePitch?: number; // Calculated or explicit pitch (px), default: fontSize * lineHeight (32px)
  maxCharsPerLine?: number; // Max characters per column before wrapping (default: 30)
  maxLineHeightPx?: number; // Max line height in px before wrapping
  originX?: number; // Far right column X coordinate (default: 800)
  originY?: number; // Top Y coordinate (default: 0)
  containerWidth?: number; // Container width
  containerHeight?: number; // Container height
  containerOffsetLeft?: number; // DOM container bounding box left
  containerOffsetTop?: number; // DOM container bounding box top
  rubyFontSize?: number; // Default: fontSize / 2 (8px)
  rubyGap?: number; // Default: 2px
  includeRubyInBoundingBox?: boolean; // Expand bounding box to encompass ruby annotations (default: true)
}

export interface ScrollOffset {
  scrollLeft: number;
  scrollTop: number;
}

export interface RubySpanInfo {
  from: number;
  to: number;
  rubyText: string;
}

export interface CharacterGeometry {
  index: number;
  char: string;
  columnIndex: number;
  lineCharIndex: number;
  rect: Rect;
  hasRuby: boolean;
  rubyText?: string;
  rubyRect?: Rect;
}

export interface ColumnFragment {
  columnIndex: number;
  fromIndex: number;
  toIndex: number;
  rect: Rect;
  text: string;
  hasRuby: boolean;
}

export interface RangeGeometry {
  from: number;
  to: number;
  text: string;
  fragments: ColumnFragment[];
  boundingBox: Rect;
  hasRuby: boolean;
}

export type InspectorTier = 1 | 2 | 3;
export type InspectorType = 'wavy_line' | 'badge' | 'foreshadowing_anchor';

export interface InspectorDecorationItem {
  id: string;
  tier: InspectorTier;
  type: InspectorType;
  from: number;
  to: number;
  label: string;
  detail?: string;
  badgeText?: string;
  sourceEntityId?: string;
}

export interface TooltipPlacementOptions {
  tooltipWidth?: number; // Default 200
  tooltipHeight?: number; // Default 100
  preferredPosition?: 'left' | 'right' | 'top' | 'bottom'; // Default 'left' in vertical-rl
  gap?: number; // Default 8
}

export interface TooltipPlacement {
  x: number;
  y: number;
  position: 'left' | 'right' | 'top' | 'bottom';
  anchorPoint: Point;
  targetRect: Rect;
}

export interface ScreenColumnFragment {
  columnIndex: number;
  rect: Rect;
  screenRect: Rect;
}

export interface TierDecorationPlacement {
  item: InspectorDecorationItem;
  tier: InspectorTier;
  type: InspectorType;
  boundingBox: Rect;
  screenBoundingBox: Rect;
  fragments: ScreenColumnFragment[];
  tier1WavyLineRects?: Rect[];
  tier2BadgePosition?: Point;
  tier3AnchorPoints?: {
    start: Point;
    end: Point;
    center: Point;
  };
  tooltipPlacement: TooltipPlacement;
}

export class VerticalInspectorGeometryBridge {
  private options: Required<BridgeLayoutOptions>;

  constructor(options?: BridgeLayoutOptions) {
    const fontSize = options?.fontSize ?? 16;
    const lineHeight = options?.lineHeight ?? 2.0;
    const linePitch = options?.linePitch ?? fontSize * lineHeight;
    const originX = options?.originX ?? (options?.containerWidth ?? 800);

    this.options = {
      writingMode: options?.writingMode ?? 'vertical-rl',
      fontSize,
      lineHeight,
      linePitch,
      maxCharsPerLine: options?.maxCharsPerLine ?? 30,
      maxLineHeightPx: options?.maxLineHeightPx ?? ((options?.maxCharsPerLine ?? 30) * fontSize),
      originX,
      originY: options?.originY ?? 0,
      containerWidth: options?.containerWidth ?? 800,
      containerHeight: options?.containerHeight ?? 600,
      containerOffsetLeft: options?.containerOffsetLeft ?? 0,
      containerOffsetTop: options?.containerOffsetTop ?? 0,
      rubyFontSize: options?.rubyFontSize ?? Math.max(6, Math.floor(fontSize / 2)),
      rubyGap: options?.rubyGap ?? 2,
      includeRubyInBoundingBox: options?.includeRubyInBoundingBox ?? true,
    };
  }

  public getOptions(): Required<BridgeLayoutOptions> {
    return { ...this.options };
  }

  public setOptions(newOptions: Partial<BridgeLayoutOptions>): void {
    const updated = { ...this.options, ...newOptions };
    if (newOptions.fontSize !== undefined || newOptions.lineHeight !== undefined) {
      if (newOptions.linePitch === undefined) {
        updated.linePitch = updated.fontSize * updated.lineHeight;
      }
    }
    this.options = updated;
  }

  /**
   * Helper to merge multiple Rects into a single bounding box.
   */
  public static createBoundingBox(rects: Rect[]): Rect {
    if (rects.length === 0) {
      return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 };
    }

    let minLeft = Infinity;
    let minTop = Infinity;
    let maxRight = -Infinity;
    let maxBottom = -Infinity;

    for (const r of rects) {
      if (r.left < minLeft) minLeft = r.left;
      if (r.top < minTop) minTop = r.top;
      if (r.right > maxRight) maxRight = r.right;
      if (r.bottom > maxBottom) maxBottom = r.bottom;
    }

    return {
      left: minLeft,
      top: minTop,
      width: Math.max(0, maxRight - minLeft),
      height: Math.max(0, maxBottom - minTop),
      right: maxRight,
      bottom: maxBottom,
    };
  }

  /**
   * Converts a local Rect or Point to absolute screen space using scroll and container offsets.
   */
  public toScreenRect(rect: Rect, scrollOffset?: ScrollOffset): Rect {
    const scrollLeft = scrollOffset?.scrollLeft ?? 0;
    const scrollTop = scrollOffset?.scrollTop ?? 0;
    const left = rect.left - scrollLeft + this.options.containerOffsetLeft;
    const top = rect.top - scrollTop + this.options.containerOffsetTop;

    return {
      left,
      top,
      width: rect.width,
      height: rect.height,
      right: left + rect.width,
      bottom: top + rect.height,
    };
  }

  public toScreenPoint(point: Point, scrollOffset?: ScrollOffset): Point {
    const scrollLeft = scrollOffset?.scrollLeft ?? 0;
    const scrollTop = scrollOffset?.scrollTop ?? 0;
    return {
      x: point.x - scrollLeft + this.options.containerOffsetLeft,
      y: point.y - scrollTop + this.options.containerOffsetTop,
    };
  }

  /**
   * Calculates character-level geometry for given text in vertical-rl layout.
   */
  public calculateCharacterGeometries(
    text: string,
    rubySpans: RubySpanInfo[] = []
  ): CharacterGeometry[] {
    const geometries: CharacterGeometry[] = [];
    const {
      fontSize,
      linePitch,
      maxCharsPerLine,
      originX,
      originY,
      rubyFontSize,
      rubyGap,
    } = this.options;

    const chars = Array.from(text);
    let currentColumn = 0;
    let currentCharInCol = 0;

    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];

      // Explicit newline or line wrap limit reached
      if (char === '\n' || (currentCharInCol >= maxCharsPerLine && currentCharInCol > 0)) {
        if (char === '\n') {
          // Record newline character geometry in current column
          const colX = originX - (currentColumn + 1) * linePitch + (linePitch - fontSize) / 2;
          const charY = originY + currentCharInCol * fontSize;

          geometries.push({
            index: i,
            char: '\n',
            columnIndex: currentColumn,
            lineCharIndex: currentCharInCol,
            rect: {
              left: colX,
              top: charY,
              width: fontSize,
              height: fontSize,
              right: colX + fontSize,
              bottom: charY + fontSize,
            },
            hasRuby: false,
          });

          currentColumn++;
          currentCharInCol = 0;
          continue;
        } else {
          // Wrap to next column
          currentColumn++;
          currentCharInCol = 0;
        }
      }

      // Calculate column X position (Right-to-Left: column 0 is furthest right)
      const colX = originX - (currentColumn + 1) * linePitch + (linePitch - fontSize) / 2;
      const charY = originY + currentCharInCol * fontSize;

      const charRect: Rect = {
        left: colX,
        top: charY,
        width: fontSize,
        height: fontSize,
        right: colX + fontSize,
        bottom: charY + fontSize,
      };

      // Check if character falls within any Ruby annotation span
      const matchingRuby = rubySpans.find((r) => i >= r.from && i < r.to);
      const hasRuby = !!matchingRuby;

      let rubyRect: Rect | undefined;
      if (hasRuby) {
        // In vertical-rl mode, Ruby text is positioned on the RIGHT side of base text column
        const rubyLeft = charRect.right + rubyGap;
        const rubyTop = charRect.top;
        rubyRect = {
          left: rubyLeft,
          top: rubyTop,
          width: rubyFontSize,
          height: fontSize,
          right: rubyLeft + rubyFontSize,
          bottom: rubyTop + fontSize,
        };
      }

      geometries.push({
        index: i,
        char,
        columnIndex: currentColumn,
        lineCharIndex: currentCharInCol,
        rect: charRect,
        hasRuby,
        rubyText: matchingRuby?.rubyText,
        rubyRect,
      });

      currentCharInCol++;
    }

    return geometries;
  }

  /**
   * Calculates geometric bounding box and line fragment rects for a character range [from, to).
   */
  public calculateRangeGeometry(
    from: number,
    to: number,
    text: string,
    rubySpans: RubySpanInfo[] = []
  ): RangeGeometry {
    const allGeometries = this.calculateCharacterGeometries(text, rubySpans);
    const clampedFrom = Math.max(0, Math.min(from, allGeometries.length));
    const clampedTo = Math.max(clampedFrom, Math.min(to, allGeometries.length));

    const targetGeometries = allGeometries.slice(clampedFrom, clampedTo);
    const slicedText = text.slice(clampedFrom, clampedTo);

    if (targetGeometries.length === 0) {
      const fallbackRect: Rect = { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 };
      return {
        from: clampedFrom,
        to: clampedTo,
        text: '',
        fragments: [],
        boundingBox: fallbackRect,
        hasRuby: false,
      };
    }

    // Group geometries by columnIndex to build column fragments
    const columnMap = new Map<number, CharacterGeometry[]>();
    let rangeHasRuby = false;

    for (const geom of targetGeometries) {
      if (geom.hasRuby) rangeHasRuby = true;
      const list = columnMap.get(geom.columnIndex) || [];
      list.push(geom);
      columnMap.set(geom.columnIndex, list);
    }

    const fragments: ColumnFragment[] = [];
    const fragmentRects: Rect[] = [];

    columnMap.forEach((geoms, colIndex) => {
      const charRects = geoms.map((g) => g.rect);
      let colRect = VerticalInspectorGeometryBridge.createBoundingBox(charRects);

      const colHasRuby = geoms.some((g) => g.hasRuby);

      // Expand right boundary if ruby annotations are present
      if (this.options.includeRubyInBoundingBox && colHasRuby) {
        const rubyRects = geoms.filter((g) => g.rubyRect).map((g) => g.rubyRect!);
        if (rubyRects.length > 0) {
          const rubyBox = VerticalInspectorGeometryBridge.createBoundingBox(rubyRects);
          colRect = VerticalInspectorGeometryBridge.createBoundingBox([colRect, rubyBox]);
        }
      }

      fragments.push({
        columnIndex: colIndex,
        fromIndex: geoms[0].index,
        toIndex: geoms[geoms.length - 1].index + 1,
        rect: colRect,
        text: geoms.map((g) => g.char).join(''),
        hasRuby: colHasRuby,
      });

      fragmentRects.push(colRect);
    });

    const boundingBox = VerticalInspectorGeometryBridge.createBoundingBox(fragmentRects);

    return {
      from: clampedFrom,
      to: clampedTo,
      text: slicedText,
      fragments,
      boundingBox,
      hasRuby: rangeHasRuby,
    };
  }

  /**
   * Precise geometric placement calculation for 3-Tier Inspector decorations and tooltips.
   */
  public calculateTierDecorationPlacement(
    item: InspectorDecorationItem,
    text: string,
    scrollOffset?: ScrollOffset,
    rubySpans: RubySpanInfo[] = [],
    tooltipOptions?: TooltipPlacementOptions
  ): TierDecorationPlacement {
    const rangeGeom = this.calculateRangeGeometry(item.from, item.to, text, rubySpans);
    const screenBoundingBox = this.toScreenRect(rangeGeom.boundingBox, scrollOffset);

    const screenFragments: ScreenColumnFragment[] = rangeGeom.fragments.map((frag) => ({
      columnIndex: frag.columnIndex,
      rect: frag.rect,
      screenRect: this.toScreenRect(frag.rect, scrollOffset),
    }));

    let tier1WavyLineRects: Rect[] | undefined;
    let tier2BadgePosition: Point | undefined;
    let tier3AnchorPoints: TierDecorationPlacement['tier3AnchorPoints'];

    if (item.tier === 1 || item.type === 'wavy_line') {
      // Tier 1: Wave underline rects along right edge of each fragment column
      tier1WavyLineRects = screenFragments.map((frag) => ({
        left: frag.screenRect.right,
        top: frag.screenRect.top,
        width: 2,
        height: frag.screenRect.height,
        right: frag.screenRect.right + 2,
        bottom: frag.screenRect.bottom,
      }));
    }

    if (item.tier === 2 || item.type === 'badge') {
      // Tier 2: Badge positioned at top-right of first fragment column
      const firstFrag = screenFragments[0];
      tier2BadgePosition = {
        x: (firstFrag ? firstFrag.screenRect.right : screenBoundingBox.right) + 4,
        y: (firstFrag ? firstFrag.screenRect.top : screenBoundingBox.top) - 2,
      };
    }

    if (item.tier === 3 || item.type === 'foreshadowing_anchor') {
      // Tier 3: Anchor points for foreshadowing link bridge
      const firstFrag = screenFragments[0];
      const lastFrag = screenFragments[screenFragments.length - 1];

      const startPoint: Point = firstFrag
        ? { x: (firstFrag.screenRect.left + firstFrag.screenRect.right) / 2, y: firstFrag.screenRect.top }
        : { x: screenBoundingBox.left + screenBoundingBox.width / 2, y: screenBoundingBox.top };

      const endPoint: Point = lastFrag
        ? { x: (lastFrag.screenRect.left + lastFrag.screenRect.right) / 2, y: lastFrag.screenRect.bottom }
        : { x: screenBoundingBox.left + screenBoundingBox.width / 2, y: screenBoundingBox.bottom };

      const centerPoint: Point = {
        x: screenBoundingBox.left + screenBoundingBox.width / 2,
        y: screenBoundingBox.top + screenBoundingBox.height / 2,
      };

      tier3AnchorPoints = {
        start: startPoint,
        end: endPoint,
        center: centerPoint,
      };
    }

    const tooltipPlacement = this.calculateTooltipPlacement(screenBoundingBox, tooltipOptions);

    return {
      item,
      tier: item.tier,
      type: item.type,
      boundingBox: rangeGeom.boundingBox,
      screenBoundingBox,
      fragments: screenFragments,
      tier1WavyLineRects,
      tier2BadgePosition,
      tier3AnchorPoints,
      tooltipPlacement,
    };
  }

  /**
   * Tooltip positioning with auto-flip boundary collision handling for vertical-rl layout.
   */
  public calculateTooltipPlacement(
    targetScreenRect: Rect,
    options?: TooltipPlacementOptions
  ): TooltipPlacement {
    const width = options?.tooltipWidth ?? 200;
    const height = options?.tooltipHeight ?? 100;
    const preferredPos = options?.preferredPosition ?? 'left';
    const gap = options?.gap ?? 8;

    let position: 'left' | 'right' | 'top' | 'bottom' = preferredPos;
    let x = 0;
    let y = 0;
    let anchorPoint: Point = { x: 0, y: 0 };

    if (position === 'left') {
      // Preferred left position for vertical-rl (reading column progress to left)
      x = targetScreenRect.left - width - gap;
      y = targetScreenRect.top;
      anchorPoint = { x: targetScreenRect.left, y: targetScreenRect.top + Math.min(20, targetScreenRect.height / 2) };

      // Auto-flip if overflowing left screen boundary (< 0)
      if (x < 0) {
        position = 'right';
        x = targetScreenRect.right + gap;
        anchorPoint = { x: targetScreenRect.right, y: targetScreenRect.top + Math.min(20, targetScreenRect.height / 2) };
      }
    } else if (position === 'right') {
      x = targetScreenRect.right + gap;
      y = targetScreenRect.top;
      anchorPoint = { x: targetScreenRect.right, y: targetScreenRect.top + Math.min(20, targetScreenRect.height / 2) };

      // Auto-flip if overflowing container right boundary
      if (x + width > this.options.containerWidth + this.options.containerOffsetLeft) {
        position = 'left';
        x = targetScreenRect.left - width - gap;
        anchorPoint = { x: targetScreenRect.left, y: targetScreenRect.top + Math.min(20, targetScreenRect.height / 2) };
      }
    } else if (position === 'top') {
      x = targetScreenRect.left + (targetScreenRect.width - width) / 2;
      y = targetScreenRect.top - height - gap;
      anchorPoint = { x: targetScreenRect.left + targetScreenRect.width / 2, y: targetScreenRect.top };

      if (y < 0) {
        position = 'bottom';
        y = targetScreenRect.bottom + gap;
        anchorPoint = { x: targetScreenRect.left + targetScreenRect.width / 2, y: targetScreenRect.bottom };
      }
    } else {
      // 'bottom'
      x = targetScreenRect.left + (targetScreenRect.width - width) / 2;
      y = targetScreenRect.bottom + gap;
      anchorPoint = { x: targetScreenRect.left + targetScreenRect.width / 2, y: targetScreenRect.bottom };
    }

    return {
      x,
      y,
      position,
      anchorPoint,
      targetRect: targetScreenRect,
    };
  }
}
