// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { NarrativeLinterEngine } from '../src/core/editor/NarrativeLinterEngine.js';
import { NarrativeInspectorDock } from '../src/ui/NarrativeInspectorDock.js';

describe('Phase 2: PRH Superset Rules & Tier 1 Inspection Integration', () => {
  it('detects PRH rule violations during NarrativeLinterEngine Tier 1 scan', () => {
    const linter = new NarrativeLinterEngine();
    const prh = linter.getPrhEngine();

    prh.addRule({
      id: '222e4567-e89b-12d3-a456-426614174000',
      expected: 'ヴァレリウス',
      patterns: ['バレリウス'],
      scope: 'all',
      action: 'replace',
      description: '人名正規化',
    });

    const doc = 'バレリウスは静かに立ち上がった。';
    const result = linter.analyzeDocument(doc);

    const prhItems = result.syntacticItems.filter(i => i.ruleType === 'prh-rule');
    expect(prhItems.length).toBe(1);
    expect(prhItems[0].tier).toBe(1);
    expect(prhItems[0].previewText).toBe('バレリウス');
    expect(prhItems[0].replacementText).toBe('ヴァレリウス');
    expect(prhItems[0].severity).toBe('error');
    expect(prhItems[0].message).toContain('用字用語ルール違反');
  });

  it('renders PRH violations and registered rules in NarrativeInspectorDock with replace and delete actions', () => {
    const onReplaceText = vi.fn();
    const onDeletePrhRule = vi.fn();

    const dock = new NarrativeInspectorDock({
      onReplaceText,
      onDeletePrhRule,
    });

    dock.updatePrhRules([
      {
        id: '222e4567-e89b-12d3-a456-426614174001',
        expected: 'お前',
        patterns: ['貴様'],
        scope: 'dialogue',
        action: 'suggest',
        syntaxType: 'general',
      },
    ]);

    dock.updateResult({
      syntacticItems: [
        {
          id: 'syn-prh-1',
          from: 0,
          to: 2,
          line: 1,
          col: 1,
          severity: 'warning',
          tier: 1,
          ruleType: 'prh-rule',
          message: '用字用語ルール違反: 「貴様」→「お前」',
          source: 'prh-rule-engine',
          previewText: '貴様',
          replacementText: 'お前',
        },
      ],
      zeroPronounItems: [],
      syntacticScore: 92,
      totalWarnings: 1,
    });

    const container = document.createElement('div');
    container.innerHTML = dock.renderHTML();
    dock.bindEvents(container);

    // Verify rendered content
    expect(container.textContent).toContain('用字用語(PRH)');
    expect(container.textContent).toContain('登録済み用字用語(PRH)ルール');
    expect(container.textContent).toContain('「貴様」➜ 「お前」 [dialogue]');

    // Click quick-replace
    const replaceBtn = container.querySelector('[data-action="quick-replace"]') as HTMLButtonElement;
    expect(replaceBtn).not.toBeNull();
    replaceBtn.click();
    expect(onReplaceText).toHaveBeenCalledWith(0, 2, 'お前');

    // Click delete PRH rule
    const deleteBtn = container.querySelector('[data-action="delete-prh"]') as HTMLButtonElement;
    expect(deleteBtn).not.toBeNull();
    deleteBtn.click();
    expect(onDeletePrhRule).toHaveBeenCalledWith('222e4567-e89b-12d3-a456-426614174001');
  });
});
