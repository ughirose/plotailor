// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { NarrativeInspectorDock } from '../src/ui/NarrativeInspectorDock.js';
import { OrthographyInspector } from '../src/ui/OrthographyInspector.js';
import { EditorView } from '../src/web/EditorView.js';

describe('New Features UI Integration (Kinsoku, Velocity, MultiSite, FullscreenStatusBar)', () => {
  let html: string;

  beforeEach(() => {
    html = fs.readFileSync(path.resolve(__dirname, '../app.html'), 'utf-8');
    document.documentElement.innerHTML = html;

    if (!document.createRange) {
      document.createRange = () => ({
        setStart: () => {},
        setEnd: () => {},
        commonAncestorContainer: document.body,
        getBoundingClientRect: () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }),
        getClientRects: () => [],
      } as any);
    }

    if (!navigator.clipboard) {
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockResolvedValue(undefined),
        },
      });
    }
  });

  it('renders MultiSite export controls in app.html and export modal', () => {
    expect(document.getElementById('btnCopyKakuyomu')).not.toBeNull();
    expect(document.getElementById('btnCopyNarou')).not.toBeNull();
    expect(document.getElementById('btnCopyDenshokyoEpub')).not.toBeNull();
    expect(document.getElementById('btnDownloadDenshokyoEpub')).not.toBeNull();
    expect(document.getElementById('menuExportMultiSite')).not.toBeNull();
  });

  it('initializes PlotailorApp with WritingVelocityWidget and FullscreenStatusBar', async () => {
    const { PlotailorApp } = await import('../src/app/main.js');
    const app = new PlotailorApp();
    expect(app).toBeDefined();

    // Verify Fullscreen status bar is mounted inside canvas wrapper
    const canvasWrapper = document.getElementById('canvasWrapper');
    const fsBar = canvasWrapper?.querySelector('.fullscreen-status-bar');
    expect(fsBar).not.toBeNull();

    // Verify typing speed and velocity indicator elements
    const speedEl = document.getElementById('typingSpeed');
    expect(speedEl).not.toBeNull();
  });

  it('toggles FullscreenStatusBar state upon fullscreen mode activation', async () => {
    const { PlotailorApp } = await import('../src/app/main.js');
    new PlotailorApp();

    const btnFullscreen = document.getElementById('btnFullscreen');
    expect(document.body.classList.contains('fullscreen-active')).toBe(false);

    btnFullscreen?.click();
    expect(document.body.classList.contains('fullscreen-active')).toBe(true);

    const canvasWrapper = document.getElementById('canvasWrapper');
    const fsBar = canvasWrapper?.querySelector('.fullscreen-status-bar');
    expect(fsBar?.classList.contains('mode-fullscreen')).toBe(true);
  });

  it('triggers MultiSite novel formatting when clicking export modal buttons', async () => {
    const writeTextSpy = vi.spyOn(navigator.clipboard, 'writeText');
    const { PlotailorApp } = await import('../src/app/main.js');
    new PlotailorApp();

    // Kakuyomu export
    const btnKakuyomu = document.getElementById('btnCopyKakuyomu');
    btnKakuyomu?.click();
    expect(writeTextSpy).toHaveBeenCalled();
    const lastCallArg = writeTextSpy.mock.calls[writeTextSpy.mock.calls.length - 1][0];
    expect(lastCallArg).toContain('双月の巡る夜に');

    // Narou export
    const btnNarou = document.getElementById('btnCopyNarou');
    btnNarou?.click();
    expect(writeTextSpy).toHaveBeenCalled();

    // Denshokyo EPUB3 export
    const btnDenshokyo = document.getElementById('btnCopyDenshokyoEpub');
    btnDenshokyo?.click();
    expect(writeTextSpy).toHaveBeenCalled();
    const epubCallArg = writeTextSpy.mock.calls[writeTextSpy.mock.calls.length - 1][0];
    expect(epubCallArg).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(epubCallArg).toContain('<html');
  });

  it('renders KinsokuViolations in NarrativeInspectorDock with push-down and jump actions', () => {
    const onJump = vi.fn();
    const dock = new NarrativeInspectorDock({ onJumpToTarget: onJump });

    dock.updateKinsokuViolations([
      {
        type: 'line-head',
        char: '、',
        lineIndex: 0,
        colIndex: 0,
        offset: 42,
        suggestedAction: 'push-down',
      },
      {
        type: 'line-tail',
        char: '「',
        lineIndex: 1,
        colIndex: 39,
        offset: 82,
        suggestedAction: 'push-down',
      },
    ]);

    const html = dock.renderHTML();
    expect(html).toContain('組版・禁則違反');
    expect(html).toContain('行頭禁則');
    expect(html).toContain('行末禁則');
    expect(html).toContain('追い出し');

    const container = document.createElement('div');
    container.innerHTML = html;
    dock.bindEvents(container);

    const jumpCards = container.querySelectorAll('.linter-issue-card[data-action="jump"]');
    expect(jumpCards.length).toBeGreaterThanOrEqual(2);

    (jumpCards[0] as HTMLElement).click();
    expect(onJump).toHaveBeenCalledWith(42, 43);
  });

  it('integrates new features seamlessly in Web EditorView component', () => {
    const mockContainer = document.createElement('div');
    document.body.appendChild(mockContainer);

    const editorView = new EditorView(mockContainer);
    editorView.render();

    // Verify Kinsoku inspection container
    const kinsokuContainer = mockContainer.querySelector('#kinsoku-results-container');
    expect(kinsokuContainer).not.toBeNull();
    expect(kinsokuContainer?.textContent).toContain('禁則');

    // Verify Velocity widget in footer
    const velocityEl = mockContainer.querySelector('#velocity-display');
    expect(velocityEl).not.toBeNull();
    expect(velocityEl?.textContent).toContain('速度:');

    // Verify Fullscreen toggle button
    const btnFs = mockContainer.querySelector('#btn-toggle-fullscreen') as HTMLElement;
    expect(btnFs).not.toBeNull();
    btnFs.click();
    expect(btnFs.classList.contains('active')).toBe(true);

    // Verify Multi-site export buttons exist in toolbar
    expect(mockContainer.querySelector('#btn-export-kakuyomu')).not.toBeNull();
    expect(mockContainer.querySelector('#btn-export-narou')).not.toBeNull();
    expect(mockContainer.querySelector('#btn-export-epub')).not.toBeNull();
  });

  it('calculates 3-Tier geometry and tooltip placements in vertical-rl mode for Orthography and Narrative docks (Task 7.2)', () => {
    // 1. Test OrthographyInspector vertical rule placements
    const orthography = new OrthographyInspector({
      rules: [
        {
          id: 'rule-test-1',
          expected: '魔術師',
          patterns: ['魔導士', 'まほうつかい'],
          category: 'term',
          enabled: true,
        },
      ],
    });

    const sampleDoc = '若き魔導士は旅立った。';
    const rulePlacements = orthography.calculateRulePlacements(sampleDoc, true);
    expect(rulePlacements.length).toBe(1);
    expect(rulePlacements[0].matchText).toBe('魔導士');
    expect(rulePlacements[0].from).toBe(2);
    expect(rulePlacements[0].to).toBe(5);
    expect(rulePlacements[0].placement.screenBoundingBox.width).toBeGreaterThan(0);
    expect(rulePlacements[0].placement.tooltipPlacement.position).toBeDefined();

    // 2. Test NarrativeInspectorDock 3-Tier vertical placements
    const dock = new NarrativeInspectorDock();
    dock.updateResult({
      syntacticItems: [
        {
          id: 'item-sync-1',
          ruleType: 'ellipsis-dash',
          tier: 1,
          from: 0,
          to: 1,
          line: 1,
          col: 1,
          message: '三点リーダー奇数個',
          previewText: '…',
          replacementText: '……',
        },
      ],
      zeroPronounItems: [
        {
          from: 5,
          to: 7,
          line: 1,
          col: 6,
          predicateText: '駆けた',
          candidates: [{ text: 'アーサー', likelihood: 85 }],
        },
      ],
      povItems: [
        {
          id: 'pov-1',
          from: 8,
          to: 12,
          line: 1,
          col: 9,
          message: '内面描写の逸脱',
          epistemicScore: 0.9,
        },
      ],
      syntacticScore: 88,
      totalWarnings: 3,
    });

    dock.updateContinuityState({
      unresolvedForeshadowings: [
        {
          id: 'f-omen',
          plantedOffset: 2,
          title: '誓いの指輪',
          plantedChapterTitle: '第1章',
          plantedLine: 3,
        },
      ],
    });

    const tierPlacements = dock.calculateTierPlacements('…星が降る。駆けた。胸騒ぎがした。', true);
    expect(tierPlacements.size).toBeGreaterThanOrEqual(4);

    // Tier 1 (wavy line)
    const t1 = dock.getItemPlacement('item-sync-1');
    expect(t1).toBeDefined();
    expect(t1!.tier).toBe(1);
    expect(t1!.type).toBe('wavy_line');
    expect(t1!.tier1WavyLineRects).toBeDefined();

    // Tier 2 (badge)
    const t2 = dock.getItemPlacement('pov-1');
    expect(t2).toBeDefined();
    expect(t2!.tier).toBe(2);
    expect(t2!.type).toBe('badge');
    expect(t2!.tier2BadgePosition).toBeDefined();

    // Tier 3 (foreshadowing anchor)
    const t3 = dock.getItemPlacement('fore-f-omen');
    expect(t3).toBeDefined();
    expect(t3!.tier).toBe(3);
    expect(t3!.type).toBe('foreshadowing_anchor');
    expect(t3!.tier3AnchorPoints).toBeDefined();
  });

  it('renders causal conflict highlights in DAG and executes reverse jumpToPosition on click (Task 7.3)', async () => {
    const { PlotailorApp } = await import('../src/app/main.js');
    const app = new PlotailorApp();

    // Create a circular conflict in LoreManager: Node A -> Node B -> Node A
    const loreManager = (app as any).loreManager;
    loreManager.createEntity({
      id: 'lore-alpha',
      name: '盟約の締結',
      category: 'term',
      description: '原因事象',
      relations: [{ targetId: 'lore-beta', label: 'causes' }],
    });
    loreManager.createEntity({
      id: 'lore-beta',
      name: '反乱の勃発',
      category: 'term',
      description: '結果事象',
      relations: [{ targetId: 'lore-alpha', label: 'causes' }],
    });

    // Switch to causality tab
    const causalityTabBtn = document.querySelector('.pane-right .pane-tab-btn[data-dock-tab="causality"]') as HTMLButtonElement;
    causalityTabBtn?.click();

    // Verify causality tab rendered conflict alert banner and highlights
    const rightPane = document.getElementById('dockContent');
    expect(rightPane?.innerHTML).toContain('因果DAG・タイムライン同期');
    expect(rightPane?.innerHTML).toContain('矛盾検出');
    expect(rightPane?.innerHTML).toContain('因果ループ・時間矛盾を検出しました');

    // Verify conflict nodes have conflict-node class and red stroke (#ef4444)
    const conflictNodes = rightPane?.querySelectorAll('.dag-node.conflict-node');
    expect(conflictNodes?.length).toBeGreaterThanOrEqual(2);

    const firstConflict = conflictNodes?.[0] as HTMLElement;
    expect(firstConflict.getAttribute('data-is-conflict')).toBe('true');
    const rect = firstConflict.querySelector('rect');
    expect(rect?.getAttribute('stroke')).toBe('#ef4444');

    // Spy on jumpToPosition
    const jumpSpy = vi.spyOn(app, 'jumpToPosition');

    // Click on the conflict node via dispatchEvent (cross-platform for SVG elements in JSDOM)
    firstConflict.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // Expect jumpToPosition to have been triggered with chapter and line/offset information
    expect(jumpSpy).toHaveBeenCalled();
    const jumpArgs = jumpSpy.mock.calls[0];
    expect(jumpArgs[0]).toBeDefined(); // chapterId
    expect(typeof jumpArgs[1]).toBe('number'); // line
    expect(typeof jumpArgs[2]).toBe('number'); // charOffset

    // Also verify banner jump button triggers jumpToPosition
    const bannerJumpBtn = rightPane?.querySelector('.btn-jump-conflict-banner') as HTMLButtonElement;
    if (bannerJumpBtn) {
      bannerJumpBtn.click();
      expect(jumpSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    }
  });
});
