// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { NarrativeInspectorDock } from '../src/ui/NarrativeInspectorDock.js';
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
});
