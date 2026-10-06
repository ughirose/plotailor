import { describe, it, expect } from 'vitest';
import {
  VerticalInspectorGeometryBridge,
  type GeometryViewportOptions,
  type InspectorTargetRange,
} from '../src/core/editor/VerticalInspectorGeometryBridge.js';

describe('VerticalInspectorGeometryBridge', () => {
  const defaultOptions: GeometryViewportOptions = {
    containerWidth: 800,
    containerHeight: 600,
    fontSize: 16,
    lineHeight: 32, // 32px
    paddingTop: 20,
    paddingRight: 20,
    paddingBottom: 20,
    paddingLeft: 20,
    charsPerLine: 10,
    scrollLeft: 0,
    scrollTop: 0,
  };

  it('computes correct vertical-rl coordinates (right to left, top to bottom)', () => {
    const bridge = new VerticalInspectorGeometryBridge(defaultOptions);
    const text = '吾輩は猫である';
    const coords = bridge.computeCharCoordinates(text);

    expect(coords.length).toBe(7);

    // 1st column (columnIndex = 0)
    // colX = 800 - 20 - (0 + 1) * 32 = 748
    expect(coords[0].columnIndex).toBe(0);
    expect(coords[0].rowIndex).toBe(0);
    expect(coords[0].x).toBe(748);
    expect(coords[0].y).toBe(20);

    // 2nd character in same column
    expect(coords[1].columnIndex).toBe(0);
    expect(coords[1].rowIndex).toBe(1);
    expect(coords[1].x).toBe(748);
    expect(coords[1].y).toBe(36); // 20 + 1 * 16

    // Last character 'る'
    expect(coords[6].rowIndex).toBe(6);
    expect(coords[6].y).toBe(20 + 6 * 16);
  });

  it('handles manual line breaks and advances to the left column', () => {
    const bridge = new VerticalInspectorGeometryBridge(defaultOptions);
    const text = '第一行\n第二行';
    const coords = bridge.computeCharCoordinates(text);

    expect(coords.length).toBe(7);

    // '第' in line 1: col 0, row 0
    expect(coords[0].columnIndex).toBe(0);
    expect(coords[0].x).toBe(748);

    // '\n'
    expect(coords[3].char).toBe('\n');
    expect(coords[3].columnIndex).toBe(0);

    // '第' in line 2: col 1, row 0
    // colX = 800 - 20 - (1 + 1) * 32 = 716
    expect(coords[4].columnIndex).toBe(1);
    expect(coords[4].rowIndex).toBe(0);
    expect(coords[4].x).toBe(716);
    expect(coords[4].y).toBe(20);
  });

  it('wraps to next column when charsPerLine limit is reached', () => {
    const bridge = new VerticalInspectorGeometryBridge({
      ...defaultOptions,
      charsPerLine: 3,
    });
    const text = 'アイウエオ';
    const coords = bridge.computeCharCoordinates(text);

    expect(coords[0].columnIndex).toBe(0);
    expect(coords[1].columnIndex).toBe(0);
    expect(coords[2].columnIndex).toBe(0);

    // 4th char wraps to col 1
    expect(coords[3].columnIndex).toBe(1);
    expect(coords[3].rowIndex).toBe(0);
    expect(coords[3].x).toBe(716);

    expect(coords[4].columnIndex).toBe(1);
    expect(coords[4].rowIndex).toBe(1);
  });

  it('calculates Tier 1 (Orthography underline/wave) placement', () => {
    const bridge = new VerticalInspectorGeometryBridge(defaultOptions);
    const text = '誤字のある文章です';
    const ranges: InspectorTargetRange[] = [
      {
        id: 't1_error',
        startIndex: 0,
        endIndex: 2, // '誤字'
        tier: 1,
      },
    ];

    const placements = bridge.computePlacements(text, ranges);
    expect(placements.length).toBe(1);

    const p = placements[0];
    expect(p.tier).toBe(1);
    expect(p.decoration.type).toBe('underline');
    expect(p.decoration.rect.x).toBe(748 - 2); // primary.x - 2
    expect(p.decoration.rect.y).toBe(20);
    expect(p.decoration.rect.height).toBe(32); // 2 chars * 16px
  });

  it('calculates Tier 2 (Lore entity badge) placement', () => {
    const bridge = new VerticalInspectorGeometryBridge(defaultOptions);
    const text = 'アリスは歩いた';
    const ranges: InspectorTargetRange[] = [
      {
        id: 't2_alice',
        startIndex: 0,
        endIndex: 3, // 'アリス'
        tier: 2,
        label: '人物',
      },
    ];

    const placements = bridge.computePlacements(text, ranges);
    expect(placements.length).toBe(1);

    const p = placements[0];
    expect(p.tier).toBe(2);
    expect(p.decoration.type).toBe('badge');
    expect(p.decoration.rect.height).toBe(18);
  });

  it('calculates Tier 3 (Narrative foreshadowing anchor) placement with ruby offset', () => {
    const bridge = new VerticalInspectorGeometryBridge(defaultOptions);
    const text = '星辰の残響が鳴り響く';
    const rangesWithoutRuby: InspectorTargetRange[] = [
      {
        id: 't3_normal',
        startIndex: 0,
        endIndex: 4,
        tier: 3,
        hasRuby: false,
      },
    ];

    const rangesWithRuby: InspectorTargetRange[] = [
      {
        id: 't3_ruby',
        startIndex: 0,
        endIndex: 4,
        tier: 3,
        hasRuby: true,
      },
    ];

    const p1 = bridge.computePlacements(text, rangesWithoutRuby)[0];
    const p2 = bridge.computePlacements(text, rangesWithRuby)[0];

    expect(p1.decoration.type).toBe('anchor');
    expect(p2.decoration.type).toBe('anchor');
    // Ruby anchor should be shifted right by ruby width (8px)
    expect(p2.decoration.rect.x).toBeGreaterThan(p1.decoration.rect.x);
  });

  it('splits multi-column ranges into column segments with correct bounding union', () => {
    const bridge = new VerticalInspectorGeometryBridge({
      ...defaultOptions,
      charsPerLine: 3,
    });
    // 0:ア, 1:イ, 2:ウ (col 0) | 3:エ, 4:オ, 5:カ (col 1)
    const text = 'アイウエオカ';
    const ranges: InspectorTargetRange[] = [
      {
        id: 'multi_col',
        startIndex: 1, // 'イ' (col 0, row 1)
        endIndex: 5,   // 'オ' (col 1, row 1) inclusive
        tier: 1,
      },
    ];

    const placements = bridge.computePlacements(text, ranges);
    expect(placements.length).toBe(1);

    const p = placements[0];
    expect(p.columnSegments.length).toBe(2);

    // Segment 1 (col 0): 'イ', 'ウ' (rows 1-2)
    expect(p.columnSegments[0].columnIndex).toBe(0);
    expect(p.columnSegments[0].startRow).toBe(1);
    expect(p.columnSegments[0].endRow).toBe(2);
    expect(p.columnSegments[0].height).toBe(32);

    // Segment 2 (col 1): 'エ', 'オ' (rows 0-1)
    expect(p.columnSegments[1].columnIndex).toBe(1);
    expect(p.columnSegments[1].startRow).toBe(0);
    expect(p.columnSegments[1].endRow).toBe(1);
    expect(p.columnSegments[1].height).toBe(32);

    // Bounding union contains both columns
    expect(p.boundingUnion.width).toBeGreaterThan(16);
  });

  it('applies scroll offsets correctly', () => {
    const bridge = new VerticalInspectorGeometryBridge({
      ...defaultOptions,
      scrollLeft: 50,
      scrollTop: 30,
    });
    const text = '吾輩';
    const coords = bridge.computeCharCoordinates(text);

    // base x: 748, base y: 20
    expect(coords[0].x).toBe(748 - 50);
    expect(coords[0].y).toBe(20 - 30);
  });

  it('performs hit testing on decoration rect and text segments', () => {
    const bridge = new VerticalInspectorGeometryBridge(defaultOptions);
    const text = '神殿の秘宝';
    const ranges: InspectorTargetRange[] = [
      {
        id: 'target',
        startIndex: 0,
        endIndex: 2, // '神殿'
        tier: 3,
      },
    ];

    const placements = bridge.computePlacements(text, ranges);
    const p = placements[0];

    // Hit decoration anchor
    const anchorHit = bridge.hitTest(
      p.decoration.rect.x + 2,
      p.decoration.rect.y + 2,
      placements
    );
    expect(anchorHit?.id).toBe('target');

    // Hit character segment
    const segmentHit = bridge.hitTest(
      p.columnSegments[0].x + 2,
      p.columnSegments[0].y + 2,
      placements
    );
    expect(segmentHit?.id).toBe('target');

    // Miss outside
    const miss = bridge.hitTest(10, 10, placements);
    expect(miss).toBeNull();
  });
});
