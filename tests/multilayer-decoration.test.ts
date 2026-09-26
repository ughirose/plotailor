import { describe, it, expect } from 'vitest';
import {
  PovBreachDetector,
  reconcileDecorations,
  buildMultiLayerDecorationSet,
  type MultiLayerItem,
  type PovContext,
} from '../src/core/editor/MultiLayerDecoration.js';
import type { LoreEntity } from '../src/core/lore/LoreEntityManager.js';

describe('Multi-Layer Decoration & POV Breach Detection', () => {
  const dummyEntities: LoreEntity[] = [
    {
      id: 'char-valerius',
      name: 'ヴァレリウス将軍',
      category: 'character',
      description: '視点主。北方総督。',
      aliases: ['ヴァレリウス'],
    },
    {
      id: 'char-selene',
      name: 'セレネ',
      category: 'character',
      description: '巫女。',
      aliases: ['セレネ'],
    },
    {
      id: 'secret-traitor',
      name: '皇帝暗殺計画',
      category: 'term',
      description: 'セレネが胸に秘めた皇帝暗殺の誓約。',
      aliases: ['暗殺計画'],
      // custom fields
      ownerCharacterId: 'char-selene',
      isSecret: true,
    } as any,
  ];

  it('detects unobservable inner thought of another character as POV breach', () => {
    const detector = new PovBreachDetector();
    const context: PovContext = {
      currentPovCharacterId: 'char-valerius',
      currentPovCharacterName: 'ヴァレリウス',
    };

    const text = 'ヴァレリウスは前に進んだ。セレネの胸中では密かに復讐を企んでいた。';
    const breaches = detector.detect(text, context, dummyEntities);

    expect(breaches.length).toBeGreaterThan(0);
    expect(breaches[0].ownerCharacterName).toBe('セレネ');
    expect(breaches[0].message).toContain('POV機密漏洩エラー');
  });

  it('detects secret entity leak belonging to another character', () => {
    const detector = new PovBreachDetector();
    const context: PovContext = {
      currentPovCharacterId: 'char-valerius',
      currentPovCharacterName: 'ヴァレリウス',
    };

    const text = '砦の奥深くで、皇帝暗殺計画の文書が落ちていた。';
    const breaches = detector.detect(text, context, dummyEntities);

    expect(breaches.length).toBeGreaterThan(0);
    expect(breaches[0].offendingText).toBe('皇帝暗殺計画');
  });

  it('reconciles decorations by suppressing Layer 0 when overlapping with Layer 2', () => {
    const items: MultiLayerItem[] = [
      {
        from: 10,
        to: 20,
        layer: 0,
        type: 'physical_anchor',
        label: '北方砦',
      },
      {
        from: 15,
        to: 25,
        layer: 2,
        type: 'pov_violation',
        label: 'POV漏洩',
      },
      {
        from: 30,
        to: 40,
        layer: 0,
        type: 'physical_anchor',
        label: '帝都',
      },
      {
        from: 12,
        to: 22,
        layer: 1,
        type: 'foreshadowing',
        label: '伏線',
      },
    ];

    const reconciled = reconcileDecorations(items);

    // Layer 0 at 10-20 overlaps with Layer 2 at 15-25, so it should be suppressed
    const layer0Items = reconciled.filter((i) => i.layer === 0);
    expect(layer0Items.length).toBe(1);
    expect(layer0Items[0].label).toBe('帝都');

    // Layer 1 (foreshadowing) is preserved (multiply blend mode)
    const layer1Items = reconciled.filter((i) => i.layer === 1);
    expect(layer1Items.length).toBe(1);

    // Layer 2 is preserved
    const layer2Items = reconciled.filter((i) => i.layer === 2);
    expect(layer2Items.length).toBe(1);
  });

  it('builds valid CodeMirror DecorationSet without errors', () => {
    const items: MultiLayerItem[] = [
      {
        from: 0,
        to: 5,
        layer: 0,
        type: 'physical_anchor',
        label: 'Anchor',
      },
      {
        from: 10,
        to: 15,
        layer: 1,
        type: 'foreshadowing',
        label: 'Foreshadowing',
      },
      {
        from: 20,
        to: 25,
        layer: 2,
        type: 'pov_violation',
        label: 'POV Breach',
      },
    ];

    const decSet = buildMultiLayerDecorationSet(100, items);
    expect(decSet).toBeDefined();
    expect(decSet.size).toBe(3);
  });
});
