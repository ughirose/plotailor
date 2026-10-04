// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { NarrativeLinterEngine } from '../src/core/editor/NarrativeLinterEngine.js';
import { NarrativeInspectorDock, type InspectionTier } from '../src/ui/NarrativeInspectorDock.js';
import type { DagCycleReport } from '../src/core/causality/CausalDagEngine.js';
import type { ForeshadowingItem } from '../src/core/editor/ForeshadowingEngine.js';
import type { StrayLoreState } from '@worldcraft/schema';


describe('Three-Tier Inspection Panel (Step 4)', () => {
  describe('Section 1: Tier 1 Deterministic Rules Integration in NarrativeLinterEngine', () => {
    const engine = new NarrativeLinterEngine();

    it('detects odd-length ellipsis and dashes as Tier 1 items', () => {
      const text = '夜の帳が降りた…。風が冷たい。';
      const result = engine.analyzeDocument(text);

      const ellipsisItem = result.syntacticItems.find((i) => i.ruleType === 'ellipsis-dash');
      expect(ellipsisItem).toBeDefined();
      expect(ellipsisItem!.tier).toBe(1);
      expect(ellipsisItem!.previewText).toBe('…');
      expect(ellipsisItem!.replacementText).toBe('……');
    });

    it('detects bracket pair mismatch as Tier 1 item', () => {
      const text = '「総督、急報です』と兵が叫んだ。';
      const result = engine.analyzeDocument(text);

      const bracketItem = result.syntacticItems.find((i) => i.ruleType === 'bracket-pair');
      expect(bracketItem).toBeDefined();
      expect(bracketItem!.tier).toBe(1);
      expect(bracketItem!.previewText).toBe('』');
      expect(bracketItem!.replacementText).toBe('」');
    });

    it('detects Japanese phonological typos as Tier 1 items', () => {
      const text = '原稿の締め切りをくだしあ。こんちには。';
      const result = engine.analyzeDocument(text);

      const typoItems = result.syntacticItems.filter((i) => i.ruleType === 'qwerty-typo');
      expect(typoItems.length).toBeGreaterThanOrEqual(2);

      const kudasai = typoItems.find((i) => i.previewText === 'くだしあ');
      expect(kudasai).toBeDefined();
      expect(kudasai!.replacementText).toBe('ください');
      expect(kudasai!.tier).toBe(1);

      const konnitiha = typoItems.find((i) => i.previewText === 'こんちには');
      expect(konnitiha).toBeDefined();
      expect(konnitiha!.replacementText).toBe('こんにちは');
      expect(konnitiha!.tier).toBe(1);
    });
  });

  describe('Section 2: Tier 2 Logic Guard Outputs', () => {
    const engine = new NarrativeLinterEngine();

    it('processes multi-task inference tensor outputs for POV, Event Actions, and Connectives', () => {
      const baseResult = engine.analyzeDocument('彼が砦を出立した。');
      const integrated = engine.integrateModelInference(baseResult, {
        text: '彼が砦を出立した。',
        seqLen: 9,
        epistemic: new Float32Array([0.1, 0.2, 0.8, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]),
        event_action: new Float32Array([
          0, 0, 0, 0, 0, 0,
          0, 0, 0, 0, 0, 0,
          0, 0, 0, 2.5, 0, 0, // actionId 3 = Move
          0, 0, 0, 0, 0, 0,
          0, 0, 0, 0, 0, 0,
          0, 0, 0, 0, 0, 0,
          0, 0, 0, 0, 0, 0,
          0, 0, 0, 0, 0, 0,
          0, 0, 0, 0, 0, 0,
        ]),
        connective: new Float32Array([
          0, 3.0, 0, 0, 0, // conn 1 = Causal
          0, 0, 0, 0, 0,
          0, 0, 0, 0, 0,
          0, 0, 0, 0, 0,
          0, 0, 0, 0, 0,
          0, 0, 0, 0, 0,
          0, 0, 0, 0, 0,
          0, 0, 0, 0, 0,
          0, 0, 0, 0, 0,
        ]),

      });

      expect(integrated.povItems?.length).toBeGreaterThan(0);
      expect(integrated.eventActionItems?.length).toBeGreaterThan(0);
      expect(integrated.connectiveItems?.length).toBeGreaterThan(0);
      expect(integrated.eventActionItems![0].actionType).toBe('Move');
      expect(integrated.connectiveItems![0].relationType).toBe('Causal');
    });
  });

  describe('Section 3: Tier 3 Continuity Guard & NarrativeInspectorDock UI', () => {
    it('renders 3-Tier badges, tabs, and counts correctly', () => {
      const dock = new NarrativeInspectorDock();
      dock.updateResult({
        syntacticItems: [
          {
            id: 'syn-1',
            from: 0,
            to: 1,
            line: 1,
            col: 1,
            severity: 'warning',
            tier: 1,
            ruleType: 'ellipsis-dash',
            message: '三点リーダー偶数対エラー',
            source: 'ellipsis-dash',
            replacementText: '……',
          },
        ],
        zeroPronounItems: [],
        syntacticScore: 92,
        totalWarnings: 1,
        povItems: [
          {
            id: 'pov-1',
            from: 5,
            to: 6,
            line: 1,
            col: 6,
            epistemicScore: 0.85,
            message: '強い内面描写POV',
          },
        ],
      });

      const dagCycleReport: DagCycleReport = {
        isAcyclic: false,
        cycles: [['char-a', 'char-b', 'char-a']],
        cycleCount: 1,
      };

      const unresolvedForeshadowings: ForeshadowingItem[] = [
        {
          id: 'fore-1',
          title: '古代の盟約台座',
          status: 'PLANTED',
          plantedChapterId: 'ch1',
          plantedChapterTitle: '第一章',
          plantedLine: 12,
          plantedOffset: 120,
          hints: [],
          description: '台座の秘密',
        },
      ];

      const strayLoreItems: StrayLoreState[] = [
        {
          entityId: 'lore-stray-1',
          canonicalName: '失われた秘宝',
          manualScore: 4.8,
          status: 'shelved',
          evacuationTimestamp: 1728086400000,
          evacuationContext: '洞窟の最深部に眠る秘宝。',
        },
      ];

      dock.updateContinuityState({
        dagCycleReport,
        unresolvedForeshadowings,
        strayLoreItems,
      });

      const html = dock.renderHTML();
      expect(html).toContain('3層校正');
      expect(html).toContain('Tier 1 (決定論)');
      expect(html).toContain('Tier 2 (論理)');

      expect(html).toContain('Tier 3 (連続性)');
      expect(html).toContain('因果ループ検出');
      expect(html).toContain('古代の盟約台座');
      expect(html).toContain('失われた秘宝');
    });

    it('switches active tier and handles restore/purge events', () => {
      const onRestore = vi.fn();
      const onPurge = vi.fn();
      const onReplace = vi.fn();

      const dock = new NarrativeInspectorDock({
        onRestoreStrayLore: onRestore,
        onPurgeStrayLore: onPurge,
        onReplaceText: onReplace,
      });

      dock.updateResult({
        syntacticItems: [
          {
            id: 'syn-1',
            from: 10,
            to: 14,
            line: 2,
            col: 5,
            severity: 'warning',
            tier: 1,
            ruleType: 'qwerty-typo',
            message: '音韻反転タイポ「くだしあ」',
            source: 'typo',
            previewText: 'くだしあ',
            replacementText: 'ください',
          },

        ],
        zeroPronounItems: [],
        syntacticScore: 90,
        totalWarnings: 1,
      });

      dock.updateContinuityState({
        strayLoreItems: [
          {
            entityId: 'ent-99',
            canonicalName: '精霊の鍵',
            manualScore: 5.0,
            status: 'shelved',
            evacuationTimestamp: 123456,
            evacuationContext: '鍵が失われた',
          },
        ],
      });

      const container = document.createElement('div');
      container.innerHTML = dock.renderHTML();
      dock.bindEvents(container);

      // 1. Tier switching
      expect(dock.getTier()).toBe('all');
      const tier3Btn = container.querySelector('[data-tier="tier3"]') as HTMLButtonElement;
      expect(tier3Btn).not.toBeNull();
      tier3Btn.click();
      expect(dock.getTier()).toBe('tier3');

      // 2. Quick replace on Tier 1 typo
      dock.setTier('all');
      container.innerHTML = dock.renderHTML();
      dock.bindEvents(container);

      const replaceBtn = container.querySelector('[data-action="quick-replace"]') as HTMLButtonElement;
      expect(replaceBtn).not.toBeNull();
      replaceBtn.click();
      expect(onReplace).toHaveBeenCalledWith(10, 14, 'ください');

      // 3. Restore stray lore
      const restoreBtn = container.querySelector('[data-action="restore-stray"]') as HTMLButtonElement;
      expect(restoreBtn).not.toBeNull();
      restoreBtn.click();
      expect(onRestore).toHaveBeenCalledWith('ent-99');

      // 4. Purge stray lore
      const purgeBtn = container.querySelector('[data-action="purge-stray"]') as HTMLButtonElement;
      expect(purgeBtn).not.toBeNull();
      purgeBtn.click();
      expect(onPurge).toHaveBeenCalledWith('ent-99');
    });
  });
});
