import { describe, it, expect, vi } from 'vitest';
import {
  LoreInspectorDock,
  LoreTermDefinition,
  ViewportRange,
  ReplaceTermEvent,
  ShelveTermEvent,
} from '../src/ui/LoreInspectorDock.js';

describe('LoreInspectorDock (3-Pane Right Dock Inspector)', () => {
  const dictionary: LoreTermDefinition[] = [
    {
      id: 'term-1',
      canonicalName: '魔導石',
      forbiddenNames: ['魔道石', '魔トウ石'],
      category: 'term',
      description: '古代遺跡から採掘されるエネルギー鉱石',
      status: 'active',
    },
    {
      id: 'char-1',
      canonicalName: 'アリシア',
      aliases: ['アリス'],
      forbiddenNames: ['アリーシア'],
      category: 'character',
      description: '主人公・元帝国魔導兵',
      status: 'active',
    },
    {
      id: 'foreshadow-1',
      canonicalName: '赤き月の予言',
      aliases: ['赤い月'],
      category: 'foreshadowing',
      description: '王国崩壊の前兆',
      status: 'active',
    },
  ];

  it('should extract lore and foreshadowing terms occurring within viewport', () => {
    const dock = new LoreInspectorDock({ dictionary, cursorProximityThreshold: 3 });
    const viewport: ViewportRange = {
      from: 0,
      to: 100,
      text: 'アリシアは魔導石を手に取り、赤き月の予言を思い出した。',
      cursorPos: 1,
    };

    const occurrences = dock.extractOccurrences(viewport);
    expect(occurrences.length).toBe(3);

    // Matches
    expect(occurrences[0].canonicalName).toBe('アリシア');
    expect(occurrences[0].isExactCanonical).toBe(true);
    expect(occurrences[0].isNearCursor).toBe(true); // Pos 0..4, cursor at 1 (inside)

    expect(occurrences[1].canonicalName).toBe('魔導石');
    expect(occurrences[1].isExactCanonical).toBe(true);
    expect(occurrences[1].isNearCursor).toBe(false); // Pos 5..8, cursor at 1 (dist 4 > 3)

    expect(occurrences[2].canonicalName).toBe('赤き月の予言');
    expect(occurrences[2].category).toBe('foreshadowing');
  });

  it('should detect forbidden variants/misspellings and handle quick replace event', () => {
    const replaceSpy = vi.fn();
    const dock = new LoreInspectorDock({
      dictionary,
      onReplaceTerm: replaceSpy,
    });

    const viewport: ViewportRange = {
      from: 10,
      to: 110,
      text: '主人公は魔道石を探している。',
      cursorPos: 15,
    };

    const occurrences = dock.extractOccurrences(viewport);
    expect(occurrences.length).toBe(1);

    const occ = occurrences[0];
    expect(occ.matchedText).toBe('魔道石');
    expect(occ.canonicalName).toBe('魔導石');
    expect(occ.isExactCanonical).toBe(false);

    const replaceEvent = dock.handleQuickReplace(occ);
    expect(replaceEvent).not.toBeNull();
    expect(replaceEvent).toEqual<ReplaceTermEvent>({
      termId: 'term-1',
      from: 14, // 10 + 4 ('主人公は' is 4 chars)
      to: 17,   // 14 + 3 ('魔道石' length)
      replacement: '魔導石',
      originalText: '魔道石',
    });

    expect(replaceSpy).toHaveBeenCalledWith(replaceEvent);
  });

  it('should handle shelving and unshelving items (moving to unplaced shelf)', () => {
    const shelveSpy = vi.fn();
    const dock = new LoreInspectorDock({
      dictionary,
      onShelveTerm: shelveSpy,
    });

    // Shelve term-1
    const shelveEvt = dock.handleShelveItem('term-1');
    expect(shelveEvt).toEqual<ShelveTermEvent>({
      termId: 'term-1',
      newStatus: 'shelved',
    });
    expect(shelveSpy).toHaveBeenCalledWith(shelveEvt);

    // Verify shelved term is excluded from active extraction
    const viewport: ViewportRange = {
      from: 0,
      to: 50,
      text: '魔導石とアリシア',
    };
    const occurrencesAfterShelved = dock.extractOccurrences(viewport);
    expect(occurrencesAfterShelved.length).toBe(1);
    expect(occurrencesAfterShelved[0].termId).toBe('char-1');

    // Unshelve term-1
    const unshelveEvt = dock.handleUnshelveItem('term-1');
    expect(unshelveEvt).toEqual<ShelveTermEvent>({
      termId: 'term-1',
      newStatus: 'active',
    });

    const occurrencesAfterUnshelved = dock.extractOccurrences(viewport);
    expect(occurrencesAfterUnshelved.length).toBe(2);
  });

  it('should toggle inline panel expand/collapse without popup modals', () => {
    const dock = new LoreInspectorDock({ dictionary });

    expect(dock.isPanelCollapsed('category:term')).toBe(false);

    // Collapse
    const collapsed = dock.togglePanel('category:term');
    expect(collapsed).toBe(true);
    expect(dock.isPanelCollapsed('category:term')).toBe(true);

    // Expand
    const expanded = dock.togglePanel('category:term');
    expect(expanded).toBe(false);
    expect(dock.isPanelCollapsed('category:term')).toBe(false);
  });

  it('should render 3-pane inline dock HTML representation adhering to IDE constitution', () => {
    const dock = new LoreInspectorDock({ dictionary });
    const viewport: ViewportRange = {
      from: 0,
      to: 100,
      text: 'アリーシアが魔導石を持つ',
      cursorPos: 2,
    };

    const occurrences = dock.extractOccurrences(viewport);
    const html = dock.renderInlinePanelHTML(occurrences);

    expect(html).toContain('lore-inspector-dock');
    expect(html).toContain('リアルタイム設定語句・伏線インスペクタ');
    expect(html).toContain('表記ゆれ検出: "アリーシア" -> "アリシア"');
    expect(html).toContain('btn-quick-replace');
    expect(html).toContain('btn-shelve');

    // Verify no modal or dialog elements exist
    expect(html).not.toContain('modal');
    expect(html).not.toContain('dialog');
  });
});
