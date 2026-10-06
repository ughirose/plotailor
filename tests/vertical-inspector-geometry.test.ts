import { describe, it, expect } from 'vitest';
import {
  VerticalInspectorGeometryBridge,
  type InspectorDecorationItem,
  type RubySpanInfo,
  type ScrollOffset,
} from '../src/core/editor/VerticalInspectorGeometryBridge.js';

describe('VerticalInspectorGeometryBridge', () => {
  it('calculates vertical-rl character geometries (RTL columns, top-down char progression)', () => {
    const bridge = new VerticalInspectorGeometryBridge({
      fontSize: 16,
      lineHeight: 2.0, // linePitch = 32px
      originX: 800,
      originY: 0,
      maxCharsPerLine: 10,
    });

    const text = 'あいうえお';
    const geometries = bridge.calculateCharacterGeometries(text);

    expect(geometries.length).toBe(5);

    // Column 0 is furthest right
    // colX = 800 - 32 + (32 - 16)/2 = 776
    expect(geometries[0].columnIndex).toBe(0);
    expect(geometries[0].rect.left).toBe(776);
    expect(geometries[0].rect.top).toBe(0);

    // Progression along Y axis in same column
    expect(geometries[1].rect.top).toBe(16);
    expect(geometries[2].rect.top).toBe(32);
    expect(geometries[4].rect.top).toBe(64);
  });

  it('handles explicit newlines and wraps to next column on the left', () => {
    const bridge = new VerticalInspectorGeometryBridge({
      fontSize: 16,
      lineHeight: 2.0, // linePitch = 32px
      originX: 800,
      originY: 0,
      maxCharsPerLine: 10,
    });

    const text = 'ABC\nDEF';
    const geometries = bridge.calculateCharacterGeometries(text);

    // 'A', 'B', 'C', '\n' in column 0
    expect(geometries[0].columnIndex).toBe(0); // A
    expect(geometries[1].columnIndex).toBe(0); // B
    expect(geometries[2].columnIndex).toBe(0); // C
    expect(geometries[3].columnIndex).toBe(0); // \n

    // 'D', 'E', 'F' in column 1 (to the left of col 0)
    expect(geometries[4].columnIndex).toBe(1); // D
    expect(geometries[5].columnIndex).toBe(1); // E

    // Column 1 is to the left of Column 0
    expect(geometries[4].rect.left).toBeLessThan(geometries[0].rect.left);
  });

  it('wraps characters at maxCharsPerLine limit', () => {
    const bridge = new VerticalInspectorGeometryBridge({
      fontSize: 16,
      lineHeight: 2.0,
      originX: 800,
      originY: 0,
      maxCharsPerLine: 3,
    });

    const text = '12345';
    const geometries = bridge.calculateCharacterGeometries(text);

    // 1, 2, 3 in col 0
    expect(geometries[0].columnIndex).toBe(0);
    expect(geometries[2].columnIndex).toBe(0);

    // 4, 5 wrapped to col 1
    expect(geometries[3].columnIndex).toBe(1);
    expect(geometries[4].columnIndex).toBe(1);
  });

  it('expands bounding box for Ruby annotations on right side', () => {
    const bridge = new VerticalInspectorGeometryBridge({
      fontSize: 16,
      lineHeight: 2.0,
      rubyFontSize: 8,
      rubyGap: 2,
      originX: 800,
      originY: 0,
    });

    const text = '青空';
    const rubySpans: RubySpanInfo[] = [
      { from: 0, to: 2, rubyText: 'あおぞら' },
    ];

    const rangeGeom = bridge.calculateRangeGeometry(0, 2, text, rubySpans);

    expect(rangeGeom.hasRuby).toBe(true);
    expect(rangeGeom.fragments.length).toBe(1);

    const baseCharGeoms = bridge.calculateCharacterGeometries(text, rubySpans);
    const baseRight = baseCharGeoms[0].rect.right;

    // Bounding box right should be expanded past base text right by ruby (8px + 2px gap = 10px)
    expect(rangeGeom.boundingBox.right).toBe(baseRight + 8 + 2);
  });

  it('splits multi-column ranges across line wrap boundaries into fragments', () => {
    const bridge = new VerticalInspectorGeometryBridge({
      fontSize: 16,
      lineHeight: 2.0,
      maxCharsPerLine: 3,
      originX: 800,
    });

    const text = 'あいうえおかきく'; // 8 chars, 3 chars/col -> 3 columns
    const rangeGeom = bridge.calculateRangeGeometry(0, 8, text);

    expect(rangeGeom.fragments.length).toBe(3);
    expect(rangeGeom.fragments[0].columnIndex).toBe(0);
    expect(rangeGeom.fragments[1].columnIndex).toBe(1);
    expect(rangeGeom.fragments[2].columnIndex).toBe(2);

    // Bounding box encloses all fragments
    expect(rangeGeom.boundingBox.left).toBe(rangeGeom.fragments[2].rect.left);
    expect(rangeGeom.boundingBox.right).toBe(rangeGeom.fragments[0].rect.right);
  });

  it('calculates Tier 1 (wavy_line) decoration placement', () => {
    const bridge = new VerticalInspectorGeometryBridge({
      fontSize: 16,
      lineHeight: 2.0,
      originX: 800,
    });

    const item: InspectorDecorationItem = {
      id: 'item-t1',
      tier: 1,
      type: 'wavy_line',
      from: 0,
      to: 3,
      label: '表記揺れ警告',
    };

    const placement = bridge.calculateTierDecorationPlacement(item, 'あいう');

    expect(placement.tier).toBe(1);
    expect(placement.tier1WavyLineRects).toBeDefined();
    expect(placement.tier1WavyLineRects!.length).toBe(1);

    // Wavy line is drawn along the right edge of the fragment column
    const wavyRect = placement.tier1WavyLineRects![0];
    expect(wavyRect.left).toBe(placement.screenBoundingBox.right);
  });

  it('calculates Tier 2 (badge) decoration placement', () => {
    const bridge = new VerticalInspectorGeometryBridge({
      fontSize: 16,
      lineHeight: 2.0,
      originX: 800,
    });

    const item: InspectorDecorationItem = {
      id: 'item-t2',
      tier: 2,
      type: 'badge',
      from: 0,
      to: 4,
      label: '設定語句バッジ',
      badgeText: 'キャラ',
    };

    const placement = bridge.calculateTierDecorationPlacement(item, 'ヴァレリウス');

    expect(placement.tier).toBe(2);
    expect(placement.tier2BadgePosition).toBeDefined();
    expect(placement.tier2BadgePosition!.x).toBeGreaterThan(placement.screenBoundingBox.right);
  });

  it('calculates Tier 3 (foreshadowing_anchor) decoration anchor points', () => {
    const bridge = new VerticalInspectorGeometryBridge({
      fontSize: 16,
      lineHeight: 2.0,
      originX: 800,
    });

    const item: InspectorDecorationItem = {
      id: 'item-t3',
      tier: 3,
      type: 'foreshadowing_anchor',
      from: 0,
      to: 5,
      label: '伏線回収アンカー',
    };

    const placement = bridge.calculateTierDecorationPlacement(item, '赤き月の予言');

    expect(placement.tier).toBe(3);
    expect(placement.tier3AnchorPoints).toBeDefined();
    expect(placement.tier3AnchorPoints!.start).toBeDefined();
    expect(placement.tier3AnchorPoints!.end).toBeDefined();
    expect(placement.tier3AnchorPoints!.center).toBeDefined();

    // Start point Y should be top of first char, end point Y should be bottom of last char
    expect(placement.tier3AnchorPoints!.start.y).toBeLessThan(placement.tier3AnchorPoints!.end.y);
  });

  it('applies scroll offsets and container offsets to screen coordinates', () => {
    const bridge = new VerticalInspectorGeometryBridge({
      fontSize: 16,
      lineHeight: 2.0,
      originX: 800,
      originY: 50,
      containerOffsetLeft: 100,
      containerOffsetTop: 20,
    });

    const scrollOffset: ScrollOffset = {
      scrollLeft: 200,
      scrollTop: 30,
    };

    const item: InspectorDecorationItem = {
      id: 'item-1',
      tier: 1,
      type: 'wavy_line',
      from: 0,
      to: 2,
      label: 'テスト',
    };

    const placement = bridge.calculateTierDecorationPlacement(item, 'テスト', scrollOffset);

    // screenLeft = localLeft - scrollLeft + containerOffsetLeft
    // screenLeft = localLeft - 200 + 100 = localLeft - 100
    expect(placement.screenBoundingBox.left).toBe(placement.boundingBox.left - 200 + 100);
    expect(placement.screenBoundingBox.top).toBe(placement.boundingBox.top - 30 + 20);
  });

  it('places tooltips to the left preferred side and auto-flips on boundary collision', () => {
    const bridge = new VerticalInspectorGeometryBridge({
      containerWidth: 800,
      containerHeight: 600,
    });

    // Normal case: target rect is near center/right
    const normalTargetRect = { left: 400, top: 100, width: 32, height: 100, right: 432, bottom: 200 };
    const normalPlacement = bridge.calculateTooltipPlacement(normalTargetRect, {
      tooltipWidth: 200,
      preferredPosition: 'left',
    });

    expect(normalPlacement.position).toBe('left');
    expect(normalPlacement.x).toBe(400 - 200 - 8); // left - tooltipWidth - gap

    // Edge collision case: target rect is near left boundary (e.g. left = 50)
    const edgeTargetRect = { left: 50, top: 100, width: 32, height: 100, right: 82, bottom: 200 };
    const flippedPlacement = bridge.calculateTooltipPlacement(edgeTargetRect, {
      tooltipWidth: 200,
      preferredPosition: 'left',
    });

    // Auto-flips to 'right' because 50 - 200 - 8 < 0
    expect(flippedPlacement.position).toBe('right');
    expect(flippedPlacement.x).toBe(82 + 8); // right + gap
  });
});
