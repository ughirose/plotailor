// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  NarrativeLinterEngine,
  type NarrativeAnalysisResult,
} from '../src/core/editor/NarrativeLinterEngine.js';
import { NarrativeWorkerBridge } from '../src/core/editor/NarrativeWorkerBridge.js';
import {
  narrativeLinterExtension,
  narrativeDecorationField,
  narrativeAnalysisField,
} from '../src/core/editor/CodeMirrorNarrativeExtension.js';
import { NarrativeInspectorDock } from '../src/ui/NarrativeInspectorDock.js';

describe('Narrative Linter & Zero Pronoun Integration', () => {
  let engine: NarrativeLinterEngine;

  beforeEach(() => {
    engine = new NarrativeLinterEngine();
  });

  describe('NarrativeLinterEngine', () => {
    it('detects double negation with correct line and col', () => {
      const text = '第一行。\n彼が真相を知らないわけではない。';
      const result = engine.analyzeDocument(text);

      const dnItems = result.syntacticItems.filter(
        (i) => i.ruleType === 'double-negation'
      );
      expect(dnItems.length).toBe(1);
      expect(dnItems[0].line).toBe(2);
      expect(dnItems[0].message).toContain('二重否定「ないわけではない」');
    });

    it('detects particle repetition with accurate locations', () => {
      const text = '彼が猫が魚が好きだと言った。';
      const result = engine.analyzeDocument(text);

      const pItems = result.syntacticItems.filter(
        (i) => i.ruleType === 'particle-repetition'
      );
      expect(pItems.length).toBe(1);
      expect(pItems[0].message).toContain('助詞「が」が3回重複');
    });

    it('detects consecutive passive expressions in a sentence', () => {
      const text = '敵に城を奪われて、味方が皆殺害された。';
      const result = engine.analyzeDocument(text);

      const cpItems = result.syntacticItems.filter(
        (i) => i.ruleType === 'consecutive-passive'
      );
      expect(cpItems.length).toBe(2);
      expect(cpItems[0].message).toContain('同一文内で受身表現');
    });

    it('detects subject-predicate mismatch patterns', () => {
      const text = '私の夢は、世界大会で優勝したからです。';
      const result = engine.analyzeDocument(text);

      const spItems = result.syntacticItems.filter(
        (i) => i.ruleType === 'subject-predicate-mismatch'
      );
      expect(spItems.length).toBe(1);
      expect(spItems[0].message).toContain('主述不整合');
    });

    it('resolves zero pronouns (omitted subject) using ZeroPronounResolver with context candidates', () => {
      const text = `ヴァレリウスは北方砦を見渡した。
兵たちが息を潜めている。
静かに外套を翻した。`;

      const result = engine.analyzeDocument(text);
      expect(result.zeroPronounItems.length).toBeGreaterThanOrEqual(1);

      const zp = result.zeroPronounItems[0];
      expect(zp.predicateText).toContain('翻した');
      expect(zp.omittedCase).toBe('ガ');
      expect(zp.candidates.length).toBeGreaterThan(0);
      // 'ヴァレリウス' was mentioned in sentence 0, so it should be ranked high
      const topCand = zp.candidates[0];
      expect(topCand.text).toBe('ヴァレリウス');
      expect(topCand.likelihood).toBeGreaterThan(0);
    });

    it('computes syntactic score reflecting document clarity', () => {
      const clean = '彼は静かに部屋の窓を開けた。心地よい風が吹き抜けた。';
      const cleanRes = engine.analyzeDocument(clean);
      expect(cleanRes.syntacticScore).toBeGreaterThanOrEqual(90);

      const messy = '彼が猫が魚が好きで、夢は優勝したからです。';
      const messyRes = engine.analyzeDocument(messy);
      expect(messyRes.syntacticScore).toBeLessThan(70);
    });

    it('does not trigger false positive char-repetition on bouten, ruby, leaders, or markdown markup', () => {
      // Text containing 4-angle bouten <<<<...>>>>, double-bracket bouten 《《...》》, ruby <<...>>, and markdown bold **...**
      const text = '千年の古より受け継がれし<<<<星辰の盟約>>>>を巡る《《運命》》の**岐路**。……静寂が訪れる。';
      const result = engine.analyzeDocument(text);

      const repeatItems = result.syntacticItems.filter(
        (i) => i.ruleType === 'char-repetition'
      );
      expect(repeatItems.length).toBe(0);
    });

    it('detects genuine character repetition while ignoring markup delimiters', () => {
      const text = '<<<<星辰の盟約>>>>の光にあああああ、、、、空が裂けた。';
      const result = engine.analyzeDocument(text);

      const repeatItems = result.syntacticItems.filter(
        (i) => i.ruleType === 'char-repetition'
      );
      // 'あああああ' should be detected, but '<<<<' and '>>>>' must NOT be detected
      expect(repeatItems.length).toBe(1);
      expect(repeatItems[0].previewText).toBe('あああああ');
    });

    it('masks Aozora and Markdown markup while preserving exact character length', () => {
      const original = '二重満月<<コンジャンクション>>の夜、<<<<星辰の盟約>>>>が**輝く**。';
      const masked = NarrativeLinterEngine.maskMarkupForSyntax(original);

      expect(masked.length).toBe(original.length);
      expect(masked).not.toContain('<<<<');
      expect(masked).not.toContain('>>>>');
      expect(masked).not.toContain('**');
      expect(masked).toContain('星辰の盟約');
      expect(masked).toContain('輝く');
    });
  });

  describe('NarrativeWorkerBridge (SPSC RingBuffer & Sliding Window)', () => {
    it('provides valid SPSC Ring Buffer capacity and zero-copy metrics', () => {
      const bridge = new NarrativeWorkerBridge({ ringBufferCapacity: 64 });
      const stats = bridge.getRingBufferStats();

      expect(stats.capacity).toBe(64);
      expect(stats.freeSlots).toBe(64);
      expect(stats.droppedCount).toBe(0);
    });

    it('executes debounced analysis without stalling caller thread', async () => {
      const bridge = new NarrativeWorkerBridge({ debounceMs: 20 });
      const text = '彼が真相を知らないわけではない。';

      const resultPromise = bridge.analyzeDebounced(text, 10, false);
      expect(resultPromise).toBeInstanceOf(Promise);

      const result = await resultPromise;
      expect(result.syntacticItems.length).toBe(1);
    });

    it('bypasses analysis during Japanese IME composition to protect IKI (50-200ms)', async () => {
      const bridge = new NarrativeWorkerBridge({ debounceMs: 10 });
      const result = await bridge.analyzeDebounced('へんかんちゅう', 5, true);

      expect(result.syntacticItems.length).toBe(0);
      expect(result.totalWarnings).toBe(0);
    });
  });

  describe('CodeMirror 6 Real-time Wavy Highlight (Decoration.mark)', () => {
    it('attaches cm-lint-warning and cm-pronoun-missing decoration marks', async () => {
      const text = `彼が猫が魚が好きだ。
静かに外套を翻した。`;

      let emittedResult: NarrativeAnalysisResult | null = null;

      const state = EditorState.create({
        doc: text,
        extensions: [
          narrativeLinterExtension({
            debounceMs: 10,
            onAnalysisResult: (res) => {
              emittedResult = res;
            },
          }),
        ],
      });

      const parentEl = document.createElement('div');
      const view = new EditorView({ state, parent: parentEl });

      // Wait for microtask / debounced analysis to dispatch decorations
      await new Promise((r) => setTimeout(r, 50));

      const decos = view.state.field(narrativeDecorationField);
      expect(decos).toBeDefined();

      // Verify decoration set has markers
      let foundWarning = false;
      let foundMissingPronoun = false;

      decos.between(0, text.length, (from, to, value) => {
        const className = (value.spec as any)?.class;
        if (className === 'cm-lint-warning') foundWarning = true;
        if (className === 'cm-pronoun-missing') foundMissingPronoun = true;
      });

      expect(foundWarning).toBe(true);
      expect(foundMissingPronoun).toBe(true);
      expect(emittedResult).not.toBeNull();

      view.destroy();
    });
  });

  describe('NarrativeInspectorDock (3-Pane Inline Right Inspector)', () => {
    it('renders non-modal inline dock adhering strictly to 3-Pane Constitution', () => {
      const dock = new NarrativeInspectorDock();
      const mockResult: NarrativeAnalysisResult = {
        syntacticItems: [
          {
            id: 'syn-1',
            from: 10,
            to: 18,
            line: 2,
            col: 5,
            severity: 'warning',
            ruleType: 'double-negation',
            message: '二重否定「ないわけではない」',
            source: 'narrative-nano-linter:double-negation',
            previewText: 'ないわけではない',
          },
        ],
        zeroPronounItems: [
          {
            id: 'zp-1',
            from: 30,
            to: 34,
            line: 3,
            col: 1,
            predicateText: '翻した',
            omittedCase: 'ガ',
            zeroPronounScore: 0.82,
            bestCandidate: { text: 'ヴァレリウス', likelihood: 82, distance: 1 },
            candidates: [{ text: 'ヴァレリウス', likelihood: 82, distance: 1 }],
            message: '主語（ガ格）抜け検知: 述語「翻した」/ 推定主語: 「ヴァレリウス」（適合度: 82%）',
            previewText: '翻した',
          },
        ],
        syntacticScore: 88,
        totalWarnings: 2,
      };

      dock.updateResult(mockResult);
      const html = dock.renderHTML();

      expect(html).toContain('リアルタイム推敲・構文スコア');
      expect(html).toContain('88');
      expect(html).toContain('二重否定');
      expect(html).toContain('主語抜け（ガ格）');
      expect(html).toContain('ヴァレリウス');
      expect(html).toContain('82%');
      // Confirms no dialog or standalone modal tags
      expect(html).not.toContain('<dialog');
      expect(html).not.toContain('role="dialog"');
    });

    it('triggers onJumpToTarget when clicking an issue card', () => {
      const onJump = vi.fn();
      const dock = new NarrativeInspectorDock({ onJumpToTarget: onJump });

      dock.updateResult({
        syntacticItems: [
          {
            id: 'syn-1',
            from: 15,
            to: 22,
            line: 2,
            col: 3,
            severity: 'warning',
            ruleType: 'double-negation',
            message: '二重否定検知',
            source: 'test',
          },
        ],
        zeroPronounItems: [],
        syntacticScore: 90,
        totalWarnings: 1,
      });

      const container = document.createElement('div');
      container.innerHTML = dock.renderHTML();
      dock.bindEvents(container);

      const card = container.querySelector('[data-action="jump"]') as HTMLElement;
      expect(card).not.toBeNull();
      card.click();

      expect(onJump).toHaveBeenCalledWith(15, 22);
    });

    it('triggers onInsertSubject when clicking subject completion button', () => {
      const onInsert = vi.fn();
      const dock = new NarrativeInspectorDock({ onInsertSubject: onInsert });

      dock.updateResult({
        syntacticItems: [],
        zeroPronounItems: [
          {
            id: 'zp-1',
            from: 40,
            to: 45,
            line: 4,
            col: 1,
            predicateText: '見据えた',
            omittedCase: 'ガ',
            zeroPronounScore: 0.75,
            bestCandidate: { text: 'セレネ', likelihood: 75, distance: 1 },
            candidates: [{ text: 'セレネ', likelihood: 75, distance: 1 }],
            message: '主語抜け検知',
          },
        ],
        syntacticScore: 90,
        totalWarnings: 1,
      });

      const container = document.createElement('div');
      container.innerHTML = dock.renderHTML();
      dock.bindEvents(container);

      const insertBtn = container.querySelector('[data-action="insert-subject"]') as HTMLButtonElement;
      expect(insertBtn).not.toBeNull();
      insertBtn.click();

      expect(onInsert).toHaveBeenCalledWith(40, 'セレネ');
    });

    it('renders contextual snippet in syntactic issue cards and dock header', () => {
      const text = '第一行。\n例えば長文を書くときに履歴がちゃんと保存されるかや、彼が猫が魚が好きだと言った。';
      const result = engine.analyzeDocument(text);

      const pItem = result.syntacticItems.find((i) => i.ruleType === 'particle-repetition');
      expect(pItem).toBeDefined();
      expect(pItem?.snippet).toBeDefined();
      expect(pItem?.snippet).toContain('好きだと言った');

      const dock = new NarrativeInspectorDock();
      dock.updateResult(result);
      const html = dock.renderHTML();

      expect(html).toContain('該当箇所の文脈:');
      expect(html).toContain('採点基準:');
      expect(html).not.toContain('⚡ Wasm SIMD PAS Head'); // Moved out of dock card
    });

    it('does NOT false-positive on particle "と" for adverbs (ひょっとすると) and idioms (として)', () => {
      const text = '今わかったこととしては、しょうがないとは思うが。これはひょっとすると父親を意味する「とと」でも反応しそう。';
      const result = engine.analyzeDocument(text);

      const toRepetition = result.syntacticItems.filter(
        (i) => i.ruleType === 'particle-repetition' && i.message.includes('「と」')
      );
      expect(toRepetition.length).toBe(0);
    });

    it('detects 3+ occurrences of particle "の" via integrated ParticleRepetitionLinterEngine and triggers quick-replace for kanji hiraku', () => {
      const text = '私の友達の家の猫の毛は白い。併し彼が来た。';
      const result = engine.analyzeDocument(text);

      // Particle "の" repetition (4 occurrences)
      const noRep = result.syntacticItems.find((i) => i.ruleType === 'particle-repetition' && (i.previewText === 'の' || i.message.includes('「の」')));
      expect(noRep).toBeDefined();
      expect(noRep?.message).toContain('「の」が4回重複');

      // Kanji hiraku: 「併し」 -> 「しかし」
      const hirakuItem = result.syntacticItems.find((i) => i.ruleType === 'kanji-hiraku');
      expect(hirakuItem).toBeDefined();
      expect(hirakuItem?.previewText).toBe('併し');
      expect(hirakuItem?.replacementText).toBe('しかし');

      // Test quick-replace interaction in NarrativeInspectorDock
      const onReplace = vi.fn();
      const dock = new NarrativeInspectorDock({ onReplaceText: onReplace });
      dock.updateResult(result);

      const container = document.createElement('div');
      container.innerHTML = dock.renderHTML();
      dock.bindEvents(container);

      const replaceBtn = container.querySelector('[data-action="quick-replace"]') as HTMLButtonElement;
      expect(replaceBtn).not.toBeNull();
      replaceBtn.click();

      expect(onReplace).toHaveBeenCalledWith(hirakuItem?.from, hirakuItem?.to, 'しかし');
    });

    it('integrates raw multi-task model outputs (POV, actions, entities, connectives)', () => {
      const text = '吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。';
      const baseResult = engine.analyzeDocument(text);
      const initialWarnings = baseResult.totalWarnings;

      // Mock multi-task outputs matching Narrative-Nano Pro v14 specs
      const seqLen = text.length;
      const epistemic = new Float32Array(seqLen);
      epistemic[0] = 0.85; // 吾: High epistemic score (POV internal sensation)

      const eventAction = new Float32Array(seqLen * 6);
      // Let index 1 ('輩') be Action 4 ('Speak')
      eventAction[1 * 6 + 4] = 2.5;

      const entity = new Float32Array(seqLen * 4);
      // '猫' (index 3) is B-ENT (1), 'で' (index 4) is E-ENT (3)
      entity[3 * 4 + 1] = 3.0; // B-ENT
      entity[4 * 4 + 3] = 3.0; // E-ENT

      const connective = new Float32Array(5);
      connective[1] = 1.8; // Causal relation

      const enriched = engine.integrateModelInference(baseResult, {
        text,
        seqLen,
        epistemic,
        event_action: eventAction,
        entity,
        connective,
      });

      // 1. POV item verification
      expect(enriched.povItems).toBeDefined();
      expect(enriched.povItems!.length).toBe(1);
      expect(enriched.povItems![0].epistemicScore).toBeCloseTo(0.85);
      expect(enriched.povItems![0].message).toContain('認識POV');
      expect(enriched.totalWarnings).toBe(initialWarnings + 1);

      // 2. Event Action verification
      expect(enriched.eventActionItems).toBeDefined();
      expect(enriched.eventActionItems!.length).toBe(1);
      expect(enriched.eventActionItems![0].actionType).toBe('Speak');
      expect(enriched.eventActionItems![0].actionId).toBe(4);

      // 3. Entity Span verification
      expect(enriched.entitySpanItems).toBeDefined();
      expect(enriched.entitySpanItems!.length).toBe(1);
      expect(enriched.entitySpanItems![0].from).toBe(3);
      expect(enriched.entitySpanItems![0].to).toBe(5);
      expect(enriched.entitySpanItems![0].text).toBe('猫で');

      // 4. Discourse Connective verification
      expect(enriched.connectiveItems).toBeDefined();
      expect(enriched.connectiveItems!.length).toBe(1);
      expect(enriched.connectiveItems![0].relationType).toBe('Causal');
      expect(enriched.connectiveItems![0].relationId).toBe(1);
    });
  });
});


