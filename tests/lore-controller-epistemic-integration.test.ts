// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoreController } from '../src/app/controllers/LoreController.js';
import { LoreEntityManager } from '../src/core/lore/LoreEntityManager.js';
import { LoreInspectorDock } from '../src/ui/LoreInspectorDock.js';
import { NarrativeInspectorDock } from '../src/ui/NarrativeInspectorDock.js';
import { CausalDagEngine } from '../src/core/causality/CausalDagEngine.js';
import { DualTrackTimelineEngine } from '../src/core/timeline/DualTrackTimeline.js';
import type { ChapterData } from '../src/app/controllers/ExportController.js';

describe('LoreController & EpistemicCalendar Integration (Priority 4 UI Test)', () => {
  let loreController: LoreController;
  let loreManager: LoreEntityManager;
  let loreDock: LoreInspectorDock;
  let dagEngine: CausalDagEngine;
  let timelineEngine: DualTrackTimelineEngine;
  let narrativeDock: NarrativeInspectorDock;
  let activeLeftTab = 'timeline';
  let activeRightTab = 'causality';

  const chapters: ChapterData[] = [
    { id: 'ch1', title: '第1章 王都の密談', charCount: 500, content: '王都で条約が締結された。' },
    { id: 'ch2', title: '第2章 北方要塞', charCount: 600, content: 'ヴァレリウス将軍は剣を抜いた。' },
  ];

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="leftPaneContent"></div>
      <div id="dockContent"></div>
    `;

    loreManager = new LoreEntityManager();
    loreDock = new LoreInspectorDock({ dictionary: [] });
    dagEngine = new CausalDagEngine();
    timelineEngine = new DualTrackTimelineEngine();
    narrativeDock = new NarrativeInspectorDock();

    loreController = new LoreController({
      getLoreManager: () => loreManager,
      getLoreDock: () => loreDock,
      getDagEngine: () => dagEngine,
      getTimelineEngine: () => timelineEngine,
      getNarrativeDock: () => narrativeDock,
      getEditorView: () => null,
      getCurrentProjectId: () => 'proj-test',
      getActiveLeftTab: () => activeLeftTab,
      setActiveLeftTab: (t) => { activeLeftTab = t; },
      getActiveRightTab: () => activeRightTab,
      setActiveRightTab: (t) => { activeRightTab = t; },
      getActiveLoreFilter: () => 'all',
      setActiveLoreFilter: vi.fn(),
      getChapters: () => chapters,
      loadChapter: vi.fn(),
      getCurrentChapterId: () => 'ch1',
      getChapterSnapshots: () => new Map(),
      getWorkTitle: () => '星辰の境界線',
      getKeystrokeCount: () => 100,
      exportPoPCertificate: vi.fn(),
      addNewChapter: vi.fn(),
      loadChapterBySelect: vi.fn(),
      renameChapter: vi.fn(),
      deleteChapter: vi.fn(),
      reorderChapters: vi.fn(),
      updateMultiLayerDecorations: vi.fn(),
      showToast: vi.fn(),
      jumpToPosition: vi.fn(),
    });
  });

  it('左ペインのタイムラインタブで動的星辰暦・月相・絶対日が表示されること', () => {
    activeLeftTab = 'timeline';
    loreController.renderLeftPane();

    const container = document.getElementById('leftPaneContent');
    expect(container).not.toBeNull();
    expect(container?.innerHTML).toContain('帝国標準星辰暦');
    expect(container?.innerHTML).toContain('第一衛星ルナ');
    expect(container?.innerHTML).toContain('第二衛星セレーネ');
    expect(container?.innerHTML).toContain('絶対日:');
  });

  it('右ペインの因果タブで EpistemicCalendarBridge を介した因果同期が実行されること', () => {
    activeRightTab = 'causality';

    loreManager.createEntity({
      id: 'ent1',
      name: '王都事変',
      category: 'term',
      description: '王都で勃発した政変',
    });

    loreManager.createEntity({
      id: 'ent2',
      name: '北方への密使',
      category: 'term',
      description: '北方要塞への情報伝達',
    });

    loreController.renderRightPane();

    const container = document.getElementById('dockContent');
    expect(container).not.toBeNull();
    expect(container?.innerHTML).toContain('因果DAG・タイムライン同期');
    expect(loreController.getCausalSyncEngine()).not.toBeNull();
    expect(loreController.getCausalSyncEngine()?.getEpistemicBridge()).not.toBeNull();
  });
});
