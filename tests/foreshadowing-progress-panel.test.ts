// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import {
  ForeshadowingEngine,
  ForeshadowingProgressPanel,
  ThreePaneWorkspace,
  EditorView,
  type ForeshadowingItem,
} from '../src/index.js';

describe('ForeshadowingEngine', () => {
  it('parses chapter headers and foreshadowing tags (@plant, @hint, @resolve)', () => {
    const text = `
第1章 旅立ち
　主人公は旅立った。
@plant(f01, "開かずの間の鍵")
@plant(f02, "古い日記")
　指輪を見つめる。
@hint(f01, "鍵に奇妙な紋章が刻まれている")

第2章 秘密の解明
@hint(f02, "日記の1ページが破られている")
@resolve(f01, "鍵で開かずの扉を解錠する")
    `.trim();

    const engine = new ForeshadowingEngine(text);
    const items = engine.getForeshadowings();

    expect(items.length).toBe(2);

    const f01 = items.find((i) => i.id === 'f01');
    expect(f01).toBeDefined();
    expect(f01?.title).toBe('開かずの間の鍵');
    expect(f01?.status).toBe('RESOLVED');
    expect(f01?.hints.length).toBe(1);
    expect(f01?.plantedChapterId).toBe('ch-1');
    expect(f01?.resolvedChapterId).toBe('ch-2');

    const f02 = items.find((i) => i.id === 'f02');
    expect(f02).toBeDefined();
    expect(f02?.title).toBe('古い日記');
    expect(f02?.status).toBe('HINTED');
    expect(f02?.hints.length).toBe(1);
  });

  it('aggregates chapter-wise recovery progress accurately', () => {
    const text = `
第1章 起の章
@plant(f1, "伏線1")
@plant(f2, "伏線2")
@resolve(f1, "回収1")

第2章 承の章
@plant(f3, "伏線3")
@hint(f2, "ヒント2")
    `.trim();

    const engine = new ForeshadowingEngine(text);
    const progresses = engine.getChapterProgresses();

    expect(progresses.length).toBe(2);

    // Chapter 1: 2 planted, 1 resolved -> 50%
    const ch1 = progresses.find((p) => p.chapterId === 'ch-1');
    expect(ch1).toBeDefined();
    expect(ch1?.plantedCount).toBe(2);
    expect(ch1?.resolvedCount).toBe(1);
    expect(ch1?.progressPercentage).toBe(50);
    expect(ch1?.unresolvedCount).toBe(1);
    expect(ch1?.unresolvedIds).toEqual(['f2']);

    // Chapter 2: 1 planted, 0 resolved -> 0%
    const ch2 = progresses.find((p) => p.chapterId === 'ch-2');
    expect(ch2).toBeDefined();
    expect(ch2?.plantedCount).toBe(1);
    expect(ch2?.resolvedCount).toBe(0);
    expect(ch2?.progressPercentage).toBe(0);
    expect(ch2?.unresolvedCount).toBe(1);
  });

  it('calculates overall progress statistics', () => {
    const text = `
第1章 序章
@plant(f1, "伏線1")
@plant(f2, "伏線2")
@plant(f3, "伏線3")
@resolve(f1, "回収1")
@resolve(f2, "回収2")
    `.trim();

    const engine = new ForeshadowingEngine(text);
    const overall = engine.getOverallProgress();

    expect(overall.totalPlanted).toBe(3);
    expect(overall.totalResolved).toBe(2);
    expect(overall.totalUnresolved).toBe(1);
    expect(overall.overallProgressPercentage).toBe(67);
  });

  it('filters unresolved foreshadowings and computes jump target coordinates', () => {
    const text = `
第1章 序幕
@plant(f1, "伝説の宝剣")
@plant(f2, "封印の書")
@hint(f2, "古文書の解読")
@resolve(f1, "宝剣を引き抜く")
    `.trim();

    const engine = new ForeshadowingEngine(text);
    const unresolved = engine.getUnresolvedForeshadowings();

    expect(unresolved.length).toBe(1);
    expect(unresolved[0].id).toBe('f2');
    expect(unresolved[0].status).toBe('HINTED');

    const jumpTarget = engine.jumpToForeshadowing('f2');
    expect(jumpTarget).not.toBeNull();
    expect(jumpTarget?.foreshadowingId).toBe('f2');
    expect(jumpTarget?.tagType).toBe('hint');
    expect(jumpTarget?.lineNumber).toBeGreaterThan(0);
  });

  it('supports setting manifest items directly', () => {
    const engine = new ForeshadowingEngine();
    const manifestItems: ForeshadowingItem[] = [
      {
        id: 'mf1',
        title: 'マニフェスト伏線1',
        status: 'PLANTED',
        plantedChapterId: 'ch-1',
        plantedChapterTitle: '第1章',
        plantedLine: 10,
        plantedOffset: 150,
        hints: [],
      },
      {
        id: 'mf2',
        title: 'マニフェスト伏線2',
        status: 'RESOLVED',
        plantedChapterId: 'ch-1',
        plantedChapterTitle: '第1章',
        plantedLine: 12,
        plantedOffset: 180,
        hints: [],
        resolvedChapterId: 'ch-2',
        resolvedChapterTitle: '第2章',
        resolvedLine: 45,
        resolvedOffset: 600,
      },
    ];

    engine.setManifestItems(manifestItems);
    expect(engine.getForeshadowings().length).toBe(2);
    expect(engine.getUnresolvedForeshadowings().length).toBe(1);
    expect(engine.getUnresolvedForeshadowings()[0].id).toBe('mf1');
  });
});

describe('ForeshadowingProgressPanel', () => {
  it('renders HTML with progress bars and unresolved list', () => {
    const text = `
第1章 旅立ち
@plant(f1, "王家の印章")
@plant(f2, "黒いマントの男")
@resolve(f1, "印章を示す")
    `.trim();

    const engine = new ForeshadowingEngine(text);
    const panel = new ForeshadowingProgressPanel(engine);
    const html = panel.renderHtml();

    expect(html).toContain('伏線回収率 (全体進捗)');
    expect(html).toContain('章別回収進捗');
    expect(html).toContain('未回収伏線一覧');
    expect(html).toContain('黒いマントの男');
    expect(html).toContain('設置: 2件');
    expect(html).toContain('回収: 1件');
    expect(html).toContain('50%');
  });

  it('binds click event handlers for click-to-jump on unresolved items', () => {
    const text = `
第1章 序章
@plant(f01, "謎の鍵")
    `.trim();

    const engine = new ForeshadowingEngine(text);
    const panel = new ForeshadowingProgressPanel(engine);

    const container = document.createElement('div');
    container.innerHTML = panel.renderHtml();
    document.body.appendChild(container);

    const onJumpMock = vi.fn();
    panel.bindEvents(container, onJumpMock);

    const jumpBtn = container.querySelector('.foreshadowing-jump-btn') as HTMLElement;
    expect(jumpBtn).not.toBeNull();

    jumpBtn?.click();

    expect(onJumpMock).toHaveBeenCalledTimes(1);
    const target = onJumpMock.mock.calls[0][0];
    expect(target.foreshadowingId).toBe('f01');
    expect(target.title).toBe('謎の鍵');

    document.body.removeChild(container);
  });
});

describe('ThreePaneWorkspace Foreshadowing Integration', () => {
  it('updates foreshadowing metrics on text change and supports tab switching', () => {
    const workspace = new ThreePaneWorkspace({
      initialText: `
第1章 秘宝伝承
@plant(f1, "古代呪文")
      `.trim(),
    });

    expect(workspace.getForeshadowingEngine().getForeshadowings().length).toBe(1);

    workspace.onTextChange(`
第1章 秘宝伝承
@plant(f1, "古代呪文")
@resolve(f1, "呪文を詠唱する")
    `.trim());

    expect(workspace.getForeshadowingEngine().getOverallProgress().overallProgressPercentage).toBe(100);

    workspace.setRightTab('foreshadowing');
    const model = workspace.renderWorkspaceModel();

    expect(model.rightPane.activeTab).toBe('foreshadowing');
    expect(model.rightPane.contentHtml).toContain('伏線回収率 (全体進捗)');
    expect(model.rightPane.contentHtml).toContain('100%');
  });

  it('returns jump target coordinates for active foreshadowings', () => {
    const workspace = new ThreePaneWorkspace({
      initialText: `
第1章 序章
@plant(f01, "星の石")
      `.trim(),
    });

    const target = workspace.jumpToForeshadowing('f01');
    expect(target).not.toBeNull();
    expect(target?.foreshadowingId).toBe('f01');
    expect(target?.title).toBe('星の石');
  });
});

describe('EditorView Foreshadowing Interactive Jump', () => {
  it('renders foreshadowing panel and executes jumpToTarget to focus textarea', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const view = new EditorView(container);
    view.render();

    const panelEl = container.querySelector('#foreshadowing-panel-container');
    expect(panelEl).not.toBeNull();
    expect(panelEl?.innerHTML).toContain('誓いの指輪');

    const rawTextarea = container.querySelector('#editor-raw') as HTMLTextAreaElement;
    expect(rawTextarea).not.toBeNull();

    // Trigger jump
    view.jumpToTarget({
      foreshadowingId: 'f01',
      title: '誓いの指輪',
      chapterId: 'ch-1',
      chapterTitle: '第1章',
      lineNumber: 2,
      charOffset: 25,
      tagType: 'plant',
    });

    expect(rawTextarea.selectionStart).toBe(25);

    document.body.removeChild(container);
  });
});
