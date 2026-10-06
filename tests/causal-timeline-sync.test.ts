import { describe, it, expect } from 'vitest';
import {
  CausalTimelineSyncEngine,
  type CausalNodeInput,
  type CausalEdgeInput,
} from '../src/core/editor/CausalTimelineSyncEngine.js';

describe('CausalTimelineSyncEngine', () => {
  it('analyzes clean DAG and returns 100 integrity score', () => {
    const nodes: CausalNodeInput[] = [
      {
        id: 'n1',
        label: '古代遺物の発見',
        chapterId: 'ch1',
        chapterIndex: 0,
        storyDay: 1,
        lineNumber: 10,
        charOffset: 50,
      },
      {
        id: 'n2',
        label: '魔導結界の起動',
        chapterId: 'ch2',
        chapterIndex: 1,
        storyDay: 2,
        lineNumber: 15,
        charOffset: 80,
      },
    ];

    const edges: CausalEdgeInput[] = [
      { fromId: 'n1', toId: 'n2', relationType: 'causes' },
    ];

    const engine = new CausalTimelineSyncEngine(nodes, edges);
    const result = engine.analyzeAndSynchronize();

    expect(result.metrics.isCleanDag).toBe(true);
    expect(result.metrics.integrityScore).toBe(100);
    expect(result.metrics.cycleConflictCount).toBe(0);
    expect(result.metrics.timeParadoxCount).toBe(0);
    expect(result.conflicts.length).toBe(0);

    const n1 = result.nodes.find((n) => n.id === 'n1')!;
    expect(n1.status).toBe('NORMAL');
    expect(n1.isConflict).toBe(false);
    expect(n1.highlightColor).toBe('#3b82f6');
    expect(n1.jumpAnchor.lineNumber).toBe(10);
  });

  it('detects cyclic conflicts (A -> B -> C -> A) and assigns red conflict highlights', () => {
    const nodes: CausalNodeInput[] = [
      { id: 'a', label: '事象A', chapterId: 'ch1', chapterIndex: 0 },
      { id: 'b', label: '事象B', chapterId: 'ch2', chapterIndex: 1 },
      { id: 'c', label: '事象C', chapterId: 'ch3', chapterIndex: 2 },
    ];

    const edges: CausalEdgeInput[] = [
      { fromId: 'a', toId: 'b' },
      { fromId: 'b', toId: 'c' },
      { fromId: 'c', toId: 'a' }, // cycle!
    ];

    const engine = new CausalTimelineSyncEngine(nodes, edges);
    const result = engine.analyzeAndSynchronize();

    expect(result.metrics.isCleanDag).toBe(false);
    expect(result.metrics.cycleConflictCount).toBe(3);
    expect(result.metrics.integrityScore).toBeLessThan(100);

    const nodeA = result.nodes.find((n) => n.id === 'a')!;
    expect(nodeA.status).toBe('CYCLE_CONFLICT');
    expect(nodeA.isConflict).toBe(true);
    expect(nodeA.conflictType).toBe('cycle');
    expect(nodeA.highlightColor).toBe('#ef4444');

    expect(result.conflicts.length).toBeGreaterThan(0);
    expect(result.conflicts[0].category).toBe('cycle');
  });

  it('detects chronological reversal (Time Paradox) when cause occurs after effect', () => {
    const nodes: CausalNodeInput[] = [
      {
        id: 'cause',
        label: '秘密結社の結成',
        chapterId: 'ch3',
        chapterIndex: 2,
        storyDay: 50, // Day 50
      },
      {
        id: 'effect',
        label: '王都の陥落',
        chapterId: 'ch1',
        chapterIndex: 0,
        storyDay: 10, // Day 10 (Occurred earlier than cause!)
      },
    ];

    const edges: CausalEdgeInput[] = [
      { fromId: 'cause', toId: 'effect', relationType: 'causes' },
    ];

    const engine = new CausalTimelineSyncEngine(nodes, edges);
    const result = engine.analyzeAndSynchronize();

    expect(result.metrics.isCleanDag).toBe(false);
    expect(result.metrics.timeParadoxCount).toBe(2);

    const effectNode = result.nodes.find((n) => n.id === 'effect')!;
    expect(effectNode.isConflict).toBe(true);
    expect(effectNode.status).toBe('TIME_PARADOX');
    expect(effectNode.conflictType).toBe('chronological_reversal');

    const paradoxConflict = result.conflicts.find(
      (c) => c.category === 'chronological_reversal'
    );
    expect(paradoxConflict).toBeDefined();
    expect(paradoxConflict?.description).toContain('タイムパラドックス');
  });

  it('synchronizes foreshadowing status, resolution rates, and calculates dangling spans', () => {
    const nodes: CausalNodeInput[] = [
      {
        id: 'plant1',
        label: '古びた鍵の伏線',
        chapterId: 'ch1',
        chapterIndex: 0,
        isForeshadowing: true,
        resolvedNodeId: 'resolve1',
      },
      {
        id: 'resolve1',
        label: '地下宝物庫の解錠',
        chapterId: 'ch4',
        chapterIndex: 3,
      },
      {
        id: 'plant2',
        label: '裏切り者の予兆',
        chapterId: 'ch2',
        chapterIndex: 1,
        isForeshadowing: true,
        // unresolved!
      },
    ];

    const engine = new CausalTimelineSyncEngine(nodes, []);
    const result = engine.analyzeAndSynchronize(4); // latestChapterIndex = 4

    expect(result.metrics.unresolvedForeshadowCount).toBe(1);
    expect(result.metrics.resolvedForeshadowCount).toBe(1);
    expect(result.metrics.resolutionRate).toBe(0.5);

    const f1 = result.nodes.find((n) => n.id === 'plant1')!;
    expect(f1.status).toBe('RESOLVED');
    expect(f1.highlightColor).toBe('#10b981'); // green
    expect(f1.danglingSpanChapters).toBe(3); // ch4 (3) - ch1 (0) = 3

    const f2 = result.nodes.find((n) => n.id === 'plant2')!;
    expect(f2.status).toBe('UNRESOLVED');
    expect(f2.highlightColor).toBe('#f59e0b'); // amber
    expect(f2.danglingSpanChapters).toBe(3); // latestChapter (4) - ch2 (1) = 3
  });

  it('generates accurate jump anchors pointing to manuscript coordinates', () => {
    const nodes: CausalNodeInput[] = [
      {
        id: 'node_target',
        label: '騎士団長の告白',
        chapterId: 'chapter_5',
        chapterIndex: 4,
        chapterTitle: '第五章 破滅の前兆',
        lineNumber: 42,
        charOffset: 128,
      },
    ];

    const engine = new CausalTimelineSyncEngine(nodes, []);
    const result = engine.analyzeAndSynchronize();

    const anchor = result.jumpAnchors.get('node_target');
    expect(anchor).toBeDefined();
    expect(anchor?.chapterId).toBe('chapter_5');
    expect(anchor?.chapterTitle).toBe('第五章 破滅の前兆');
    expect(anchor?.lineNumber).toBe(42);
    expect(anchor?.charOffset).toBe(128);
    expect(anchor?.badgeLabel).toBe('✅ 整合');
  });

  it('produces valid timeline plot data with normalized Sjuzhet coordinates', () => {
    const nodes: CausalNodeInput[] = [
      {
        id: 'p1',
        label: '発端',
        chapterId: 'ch1',
        chapterIndex: 0,
        discourseRatio: 0.1,
        storyDay: 5,
      },
      {
        id: 'p2',
        label: '結末',
        chapterId: 'ch5',
        chapterIndex: 4,
        discourseRatio: 0.9,
        storyDay: 20,
      },
    ];

    const edges: CausalEdgeInput[] = [{ fromId: 'p1', toId: 'p2' }];
    const engine = new CausalTimelineSyncEngine(nodes, edges);
    const result = engine.analyzeAndSynchronize(4);

    expect(result.timelinePlotData.nodes.length).toBe(2);
    expect(result.timelinePlotData.nodes[0].x).toBe(100); // 0.1 * 1000
    expect(result.timelinePlotData.nodes[0].storyY).toBe(5);
    expect(result.timelinePlotData.nodes[1].x).toBe(900); // 0.9 * 1000
    expect(result.timelinePlotData.nodes[1].storyY).toBe(20);
    expect(result.timelinePlotData.edges[0].color).toBe('#64748b');
  });
});
