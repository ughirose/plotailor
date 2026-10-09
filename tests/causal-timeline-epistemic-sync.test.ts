import { describe, it, expect, beforeEach } from 'vitest';
import {
  CausalTimelineSyncEngine,
  type CausalNodeInput,
  type CausalEdgeInput,
} from '../src/core/editor/CausalTimelineSyncEngine.js';
import { EpistemicCalendarBridge } from '../src/core/causality/EpistemicCalendarBridge.js';

describe('CausalTimelineSyncEngine (認知フォグ・暦法・因果DAG統合同期)', () => {
  let bridge: EpistemicCalendarBridge;

  beforeEach(() => {
    bridge = new EpistemicCalendarBridge();

    bridge.registerLocation({ id: 'loc_cap', name: '王都', x: 0, y: 0 });
    bridge.registerLocation({ id: 'loc_fort', name: '砦', x: 0, y: 200 }); // 200km -> 4 days
    bridge.addPropagationChannel({
      id: 'ch1',
      sourceLocationId: 'loc_cap',
      targetLocationId: 'loc_fort',
      method: { type: 'courier', speedKmPerDay: 50 },
    });

    bridge.registerCharacter({
      id: 'char_valerius',
      name: 'ヴァレリウス',
      locationId: 'loc_fort',
      birthYear: 700,
      deathYear: 780,
    });

    bridge.registerEvent({
      id: 'evt_treaty',
      name: '停戦条約締結',
      locationId: 'loc_cap',
      occurrenceDay: 10,
    });
  });

  it('正常な因果DAG（Clean DAG）においてスコア100点および正常ステータスを出力すること', () => {
    const nodes: CausalNodeInput[] = [
      { id: 'n1', label: '条約締結', chapterId: 'ch1', chapterIndex: 0, storyDay: 10 },
      { id: 'n2', label: '砦への急使到着', chapterId: 'ch1', chapterIndex: 0, storyDay: 14 },
    ];
    const edges: CausalEdgeInput[] = [
      { fromId: 'n1', toId: 'n2', relationType: 'causes' },
    ];

    const engine = new CausalTimelineSyncEngine(nodes, edges, bridge);
    const result = engine.analyzeAndSynchronize(0);

    expect(result.metrics.isCleanDag).toBe(true);
    expect(result.metrics.integrityScore).toBe(100);
    expect(result.conflicts.length).toBe(0);
    expect(result.nodes[0].status).toBe('NORMAL');
  });

  it('認知フォグ違反（情報到達前の言及）を検出し、赤色ハイライト・ジャンプアンカーを付与すること', () => {
    const nodes: CausalNodeInput[] = [
      { id: 'n1', label: '王都での条約締結', chapterId: 'ch1', chapterIndex: 0, storyDay: 10 },
      {
        id: 'n2',
        label: '砦での密談',
        chapterId: 'ch2',
        chapterIndex: 1,
        lineNumber: 15,
        charOffset: 350,
        storyDay: 12, // 10 + 4 = 14日到達なのに12日に言及
        epistemicContext: {
          speakerId: 'char_valerius',
          mentionedEventId: 'evt_treaty',
          mentionDay: 12,
        },
      },
    ];
    const edges: CausalEdgeInput[] = [
      { fromId: 'n1', toId: 'n2', relationType: 'causes' },
    ];

    const engine = new CausalTimelineSyncEngine(nodes, edges, bridge);
    const result = engine.analyzeAndSynchronize(1);

    expect(result.metrics.epistemicConflictCount).toBe(1);
    expect(result.metrics.isCleanDag).toBe(false);

    const conflict = result.conflicts.find((c) => c.category === 'epistemic_fog_violation');
    expect(conflict).toBeDefined();
    expect(conflict?.nodeId).toBe('n2');
    expect(conflict?.description).toContain('認知フォグ違反');
    expect(conflict?.anchor).toBeDefined();
    expect(conflict?.anchor?.lineNumber).toBe(15);
    expect(conflict?.anchor?.charOffset).toBe(350);

    const node2 = result.nodes.find((n) => n.id === 'n2')!;
    expect(node2.status).toBe('EPISTEMIC_CONFLICT');
    expect(node2.isConflict).toBe(true);
    expect(node2.highlightColor).toBe('#ef4444');
  });

  it('天体月相不整合（新月日の満月描写）を検出し、警告を発報すること', () => {
    const nodes: CausalNodeInput[] = [
      {
        id: 'n_moon',
        label: '満月の夜の儀式',
        chapterId: 'ch1',
        chapterIndex: 0,
        lineNumber: 5,
        charOffset: 120,
        storyDay: 28, // ルナ 28日目は新月 (phase 0.0)
        celestialContext: {
          satelliteId: 'sat_luna',
          expectedPhase: '満月',
          absoluteDay: 28,
        },
      },
    ];

    const engine = new CausalTimelineSyncEngine(nodes, [], bridge);
    const result = engine.analyzeAndSynchronize(0);

    expect(result.metrics.celestialConflictCount).toBe(1);
    const conflict = result.conflicts.find((c) => c.category === 'moon_phase_mismatch');
    expect(conflict).toBeDefined();
    expect(conflict?.description).toContain('天体暦矛盾');
    expect(conflict?.severity).toBe('warning');

    const node = result.nodes[0];
    expect(node.status).toBe('CELESTIAL_CONFLICT');
    expect(node.isConflict).toBe(true);
  });

  it('登場人物の生没年境界違反（誕生前/死亡後の行動）を検出すること', () => {
    const nodes: CausalNodeInput[] = [
      {
        id: 'n_past_action',
        label: '古代戦争への従軍',
        chapterId: 'ch1',
        chapterIndex: 0,
        lineNumber: 8,
        charOffset: 200,
        characterId: 'char_valerius', // 生誕 700年
        storyYear: 680, // 誕生20年前
      },
    ];

    const engine = new CausalTimelineSyncEngine(nodes, [], bridge);
    const result = engine.analyzeAndSynchronize(0);

    expect(result.metrics.lifespanConflictCount).toBe(1);
    const conflict = result.conflicts.find((c) => c.category === 'lifespan_breach');
    expect(conflict).toBeDefined();
    expect(conflict?.description).toContain('生没年境界違反');
  });
});
