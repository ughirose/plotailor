// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CharacterHeatmapEngine,
  ThreePaneWorkspace,
  type CharacterTermDef,
  type ChapterSegment,
  type SparklineRenderOptions,
} from '../src/index.js';

describe('CharacterHeatmapEngine - Core Functionality', () => {
  let heatmapEngine: CharacterHeatmapEngine;

  beforeEach(() => {
    heatmapEngine = new CharacterHeatmapEngine();
  });

  describe('Manuscript Chapter Segmentation', () => {
    it('segments manuscript by Japanese chapter headers (第一章, 第2話, etc.)', () => {
      const text = `第一章 王都の出会い
ヴァレリウス将軍が王都に着任した。

第2話 北の砦の危機
アーサーは北の砦で待機していた。

Episode 3 決戦の時
紫電の剣が閃光を放った。`;

      const chapters = heatmapEngine.segmentText(text);

      expect(chapters.length).toBe(3);
      expect(chapters[0].title).toBe('第一章 王都の出会い');
      expect(chapters[1].title).toBe('第2話 北の砦の危機');
      expect(chapters[2].title).toBe('Episode 3 決戦の時');
      expect(chapters[0].text).toContain('ヴァレリウス将軍が王都に着任した');
      expect(chapters[1].text).toContain('アーサーは北の砦で待機していた');
    });

    it('captures intro text prior to the first matched chapter header', () => {
      const text = `これは物語の序章・前置きテキストです。

第一章 王都への旅
主人公が旅立った。`;

      const chapters = heatmapEngine.segmentText(text);

      expect(chapters.length).toBe(2);
      expect(chapters[0].title).toBe('序文・前置き');
      expect(chapters[0].text).toContain('これは物語の序章');
      expect(chapters[1].title).toBe('第一章 王都への旅');
    });

    it('falls back to character chunking when no chapter headers are present', () => {
      const longText = 'A'.repeat(3200); // > 1500 chars chunk size
      const chapters = heatmapEngine.segmentText(longText, { chunkSize: 1000 });

      expect(chapters.length).toBe(4);
      expect(chapters[0].title).toBe('区間 1');
      expect(chapters[1].title).toBe('区間 2');
      expect(chapters[0].text.length).toBe(1000);
      expect(chapters[3].text.length).toBe(200);
    });

    it('returns single "全編" chapter if text is under chunkSize and has no headers', () => {
      const shortText = '王都の夜空に星が輝いていた。';
      const chapters = heatmapEngine.segmentText(shortText, { chunkSize: 1500 });

      expect(chapters.length).toBe(1);
      expect(chapters[0].title).toBe('全編');
      expect(chapters[0].text).toBe(shortText);
    });

    it('handles custom pre-segmented chapters if supplied', () => {
      const custom: ChapterSegment[] = [
        { id: 'custom-1', title: 'カスタム1', chapterIndex: 0, text: 'ヴァレリウス', startOffset: 0, endOffset: 6 },
        { id: 'custom-2', title: 'カスタム2', chapterIndex: 1, text: 'アーサー', startOffset: 6, endOffset: 10 },
      ];

      const chapters = heatmapEngine.segmentText('ignored text', { customSegments: custom });
      expect(chapters).toEqual(custom);
    });

    it('returns empty array for empty or whitespace text', () => {
      expect(heatmapEngine.segmentText('')).toEqual([]);
      expect(heatmapEngine.segmentText('   \n  ')).toEqual([]);
    });
  });

  describe('Mention Counting & Frequency Analysis', () => {
    const targets: CharacterTermDef[] = [
      { id: 'c1', name: 'ヴァレリウス将軍', aliases: ['ヴァレリウス'], color: '#cfa85c' },
      { id: 'c2', name: 'アーサー', color: '#6366f1' },
      { id: 'c3', name: '紫電の剣', color: '#10b981' },
      { id: 'c4', name: '非登場キャラ', color: '#888888' },
    ];

    it('accurately counts canonical name and alias mentions per chapter', () => {
      const text = `第一章
ヴァレリウス将軍が立ち上がった。ヴァレリウスは剣を取った。

第二章
アーサーとヴァレリウス将軍が合流した。アーサーが微笑んだ。

第三章
紫電の剣が輝いた。紫電の剣を振り下ろした。`;

      const result = heatmapEngine.analyze(text, targets);

      expect(result.chapters.length).toBe(3);
      expect(result.totalManuscriptLength).toBe(text.length);

      // Valerius series
      const valSeries = result.series.find((s) => s.target.id === 'c1')!;
      expect(valSeries.totalCount).toBe(3); // Ch1: 2, Ch2: 1, Ch3: 0
      expect(valSeries.maxCount).toBe(2);
      expect(valSeries.maxChapterTitle).toBe('第一章');
      expect(valSeries.frequencies[0].count).toBe(2);
      expect(valSeries.frequencies[1].count).toBe(1);
      expect(valSeries.frequencies[2].count).toBe(0);

      // Arthur series
      const arthurSeries = result.series.find((s) => s.target.id === 'c2')!;
      expect(arthurSeries.totalCount).toBe(2);
      expect(arthurSeries.maxChapterTitle).toBe('第二章');

      // Non-existent character
      const ghostSeries = result.series.find((s) => s.target.id === 'c4')!;
      expect(ghostSeries.totalCount).toBe(0);
      expect(ghostSeries.maxCount).toBe(0);
    });

    it('escapes special regex characters in character names or aliases', () => {
      const specialTarget: CharacterTermDef = {
        id: 'spec',
        name: 'ヴァレリウス[将軍]',
        aliases: ['アーサー(従卒)'],
      };

      const text = '第一章\nヴァレリウス[将軍]とアーサー(従卒)が並んだ。';
      const count = heatmapEngine.countMentions(text, specialTarget);
      expect(count).toBe(2);
    });

    it('calculates mention density per 1,000 characters correctly', () => {
      const text = '第一章\n' + 'ヴァレリウス将軍'.repeat(10); // 80 chars + header
      const result = heatmapEngine.analyze(text, targets);
      const series = result.series.find((s) => s.target.id === 'c1')!;

      expect(series.frequencies[0].density).toBeGreaterThan(0);
      expect(series.frequencies[0].count).toBe(10);
    });
  });

  describe('SVG Sparkline Rendering', () => {
    const series: any = {
      target: { id: 'c1', name: 'ヴァレリウス将軍', color: '#cfa85c' },
      totalCount: 5,
      maxCount: 3,
      maxChapterTitle: '第二章',
      frequencies: [
        { chapterId: 'ch-1', chapterTitle: '第一章', chapterIndex: 0, count: 1, density: 10 },
        { chapterId: 'ch-2', chapterTitle: '第二章', chapterIndex: 1, count: 3, density: 30 },
        { chapterId: 'ch-3', chapterTitle: '第三章', chapterIndex: 2, count: 1, density: 10 },
      ],
    };

    it('generates valid SVG markup with path, polygon area, and dots', () => {
      const svg = heatmapEngine.renderSvgSparkline(series, {
        width: 200,
        height: 40,
        strokeColor: '#cfa85c',
        showDots: true,
      });

      expect(svg).toContain('<svg');
      expect(svg).toContain('class="character-sparkline"');
      expect(svg).toContain('<path');
      expect(svg).toContain('<polygon');
      expect(svg).toContain('<circle');
      expect(svg).toContain('aria-label="ヴァレリウス将軍 出現度推移スパークライン"');
      expect(svg).toContain('第一章: 1回');
      expect(svg).toContain('第二章: 3回');
    });

    it('renders horizontal baseline SVG for single chapter data', () => {
      const singleSeries: any = {
        target: { id: 'c1', name: '単一章キャラ', color: '#6366f1' },
        totalCount: 2,
        maxCount: 2,
        maxChapterTitle: '全編',
        frequencies: [
          { chapterId: 'ch-1', chapterTitle: '全編', chapterIndex: 0, count: 2, density: 20 },
        ],
      };

      const svg = heatmapEngine.renderSvgSparkline(singleSeries);
      expect(svg).toContain('<svg');
      expect(svg).toContain('<path');
      expect(svg).toContain('<circle');
    });

    it('renders dashed baseline SVG for empty frequency points', () => {
      const emptySeries: any = {
        target: { id: 'c1', name: 'データなし' },
        totalCount: 0,
        maxCount: 0,
        maxChapterTitle: '-',
        frequencies: [],
      };

      const svg = heatmapEngine.renderSvgSparkline(emptySeries);
      expect(svg).toContain('<line');
      expect(svg).toContain('stroke-dasharray="2,2"');
    });
  });

  describe('SVG Heatmap Matrix Rendering', () => {
    it('renders multi-character x multi-chapter SVG grid matrix', () => {
      const targets: CharacterTermDef[] = [
        { id: 'c1', name: 'ヴァレリウス' },
        { id: 'c2', name: 'アーサー' },
      ];
      const text = `第一章\nヴァレリウス\n第二章\nアーサー`;
      const result = heatmapEngine.analyze(text, targets);

      const svg = heatmapEngine.renderSvgHeatmapMatrix(result, { showLabels: true });

      expect(svg).toContain('class="heatmap-matrix-svg"');
      expect(svg).toContain('<rect');
      expect(svg).toContain('ヴァレリウス');
      expect(svg).toContain('アーサー');
      expect(svg).toContain('第一章');
      expect(svg).toContain('第二章');
    });

    it('returns fallback message SVG when analysis result has no chapters or series', () => {
      const emptyResult = { chapters: [], series: [], totalManuscriptLength: 0 };
      const svg = heatmapEngine.renderSvgHeatmapMatrix(emptyResult);

      expect(svg).toContain('データなし');
    });
  });

  describe('Canvas Sparkline Renderer', () => {
    function createMockContext(): CanvasRenderingContext2D {
      return {
        canvas: { width: 200, height: 40 },
        clearRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        setLineDash: vi.fn(),
        closePath: vi.fn(),
        strokeStyle: '',
        fillStyle: '',
        lineWidth: 1,
        lineCap: 'butt',
        lineJoin: 'miter',
      } as unknown as CanvasRenderingContext2D;
    }

    it('draws sparkline onto Canvas 2D context without error', () => {
      const ctx = createMockContext();

      const series: any = {
        target: { id: 'c1', name: 'アーサー', color: '#6366f1' },
        totalCount: 3,
        maxCount: 2,
        maxChapterTitle: '第一章',
        frequencies: [
          { chapterId: 'ch-1', chapterTitle: '第一章', chapterIndex: 0, count: 2, density: 20 },
          { chapterId: 'ch-2', chapterTitle: '第二章', chapterIndex: 1, count: 1, density: 10 },
        ],
      };

      heatmapEngine.renderCanvasSparkline(ctx, series);

      expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 200, 40);
      expect(ctx.beginPath).toHaveBeenCalled();
      expect(ctx.stroke).toHaveBeenCalled();
      expect(ctx.fill).toHaveBeenCalled();
    });

    it('handles empty frequencies on Canvas context gracefully', () => {
      const ctx = createMockContext();

      const emptySeries: any = {
        target: { id: 'c1', name: '空' },
        totalCount: 0,
        maxCount: 0,
        maxChapterTitle: '-',
        frequencies: [],
      };

      heatmapEngine.renderCanvasSparkline(ctx, emptySeries);

      expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 200, 40);
      expect(ctx.setLineDash).toHaveBeenCalledWith([2, 2]);
      expect(ctx.stroke).toHaveBeenCalled();
    });
  });
});

describe('ThreePaneWorkspace & Heatmap Right Dock Integration', () => {
  it('calculates character frequency heatmap automatically on text updates', () => {
    const workspace = new ThreePaneWorkspace();

    const text = `第一章 王都
ヴァレリウス将軍が剣を取った。

第二章 北の砦
アーサーがヴァレリウス将軍の知らせを受けた。`;

    workspace.onTextChange(text, false);

    const state = workspace.getState();
    expect(state.heatmapResult).not.toBeNull();
    expect(state.heatmapResult!.chapters.length).toBe(2);

    const valSeries = state.heatmapResult!.series.find((s) => s.target.name === 'ヴァレリウス')!;
    expect(valSeries.totalCount).toBe(2);
  });

  it('renders character-heatmap dock tab in 3-pane model non-modally', () => {
    const workspace = new ThreePaneWorkspace();
    workspace.onTextChange('第一章\nヴァレリウス将軍が到着した。', false);

    workspace.setRightTab('character-heatmap');

    const model = workspace.renderWorkspaceModel();
    expect(model.rightPane.activeTab).toBe('character-heatmap');
    expect(model.rightPane.contentHtml).toContain('📊 登場人物・用語 出現頻度ヒートマップ');
    expect(model.rightPane.contentHtml).toContain('heatmap-matrix-svg');
    expect(model.rightPane.contentHtml).toContain('character-sparkline');
  });

  it('updates heatmap dynamically when custom character targets are configured', () => {
    const workspace = new ThreePaneWorkspace();
    const customTargets: CharacterTermDef[] = [
      { id: 't1', name: '魔導石', aliases: ['魔道石'] },
    ];

    workspace.setCharacterTargets(customTargets);
    workspace.onTextChange('第一章\n彼は魔導石を手に入れた。', false);

    const state = workspace.getState();
    expect(state.heatmapResult!.series.length).toBe(1);
    expect(state.heatmapResult!.series[0].target.name).toBe('魔導石');
    expect(state.heatmapResult!.series[0].totalCount).toBe(1);
  });
});
