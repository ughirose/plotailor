// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('PlotailorApp DOM Initialization & Data Integrity', () => {
  let html: string;

  beforeEach(() => {
    html = fs.readFileSync(path.resolve(__dirname, '../app.html'), 'utf-8');
    document.documentElement.innerHTML = html;
  });

  it('contains essential IDE containers for chapters, editor, and lore', () => {
    const editorBody = document.getElementById('editorBody');
    const leftPane = document.getElementById('leftPaneContent');
    const dockContent = document.getElementById('dockContent');
    const workTitle = document.getElementById('workTitleText');
    const chapterSelect = document.getElementById('chapterSelect');

    expect(editorBody).not.toBeNull();
    expect(leftPane).not.toBeNull();
    expect(dockContent).not.toBeNull();
    expect(workTitle).not.toBeNull();
    expect(chapterSelect).not.toBeNull();
  });

  it('has valid collapsible buttons and hamburger dropdown controls', () => {
    const btnCollapseLeft = document.getElementById('btnCollapseLeft');
    const btnCollapseRight = document.getElementById('btnCollapseRight');
    const btnHamburger = document.getElementById('btnHamburgerMenu');
    const dropdown = document.getElementById('hamburgerDropdown');
    const btnLegend = document.getElementById('btnToggleLegendCard');
    const legendPanel = document.getElementById('decorationLegendPanel');

    expect(btnCollapseLeft).not.toBeNull();
    expect(btnCollapseRight).not.toBeNull();
    expect(btnHamburger).not.toBeNull();
    expect(dropdown).not.toBeNull();
    expect(btnLegend).not.toBeNull();
    expect(legendPanel).not.toBeNull();
  });

  it('instantiates PlotailorApp and renders default chapters and lore', async () => {
    // Provide Range mock for CodeMirror in JSDOM
    if (!document.createRange) {
      document.createRange = () => ({
        setStart: () => {},
        setEnd: () => {},
        commonAncestorContainer: document.body,
        getBoundingClientRect: () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }),
        getClientRects: () => [],
      } as any);
    }

    const { PlotailorApp } = await import('../src/app/main.js');
    const app = new PlotailorApp();
    expect(app).toBeDefined();

    // Verify Left pane renders chapters
    const leftPane = document.getElementById('leftPaneContent');
    expect(leftPane?.innerHTML).toContain('第一章');
    expect(leftPane?.innerHTML).toContain('第二章');

    // Verify Right pane renders dock panels
    const dockContent = document.getElementById('dockContent');
    expect(dockContent?.innerHTML.length).toBeGreaterThan(0);
  });
});
