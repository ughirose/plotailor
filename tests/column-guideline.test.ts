// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ColumnGuideline, DEFAULT_COLUMNS, MIN_COLUMNS, MAX_COLUMNS, STORAGE_KEY_GUIDELINE_VISIBLE } from '../src/ui/ColumnGuideline.js';
import { EditorView } from '../src/web/EditorView.js';

describe('ColumnGuideline & Ruler Component', () => {
  let container: HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    container.style.paddingTop = '40px';
    container.style.paddingLeft = '48px';
    container.style.paddingRight = '48px';
    container.style.paddingBottom = '40px';
    document.body.appendChild(container);
  });

  describe('Core Initialization & Clamping', () => {
    it('initializes with default options and creates DOM elements', () => {
      const guideline = new ColumnGuideline({ container });
      expect(guideline.getColumns()).toBe(DEFAULT_COLUMNS);
      expect(guideline.getAllowHanging()).toBe(true);
      expect(guideline.getIsVertical()).toBe(false);
      expect(guideline.isVisible()).toBe(true);

      const root = container.querySelector('.column-guideline-container');
      expect(root).not.toBeNull();
      expect(root?.classList.contains('mode-horizontal')).toBe(true);

      const primaryLine = container.querySelector('.column-guideline-line.primary');
      const hangingLine = container.querySelector('.column-guideline-line.hanging');
      const badge = container.querySelector('.column-guideline-badge');

      expect(primaryLine).not.toBeNull();
      expect(hangingLine).not.toBeNull();
      expect(badge?.textContent).toBe('40字');
    });

    it('clamps column count strictly within [30, 50]', () => {
      const guideline = new ColumnGuideline({ container, columns: 20 });
      expect(guideline.getColumns()).toBe(MIN_COLUMNS);

      guideline.setColumns(60);
      expect(guideline.getColumns()).toBe(MAX_COLUMNS);

      guideline.setColumns(42);
      expect(guideline.getColumns()).toBe(42);
    });
  });

  describe('Horizontal Mode Calculations & Ticks', () => {
    it('positions primary line and hanging line based on character pitch in horizontal mode', () => {
      const guideline = new ColumnGuideline({
        container,
        columns: 40,
        fontSize: 20,
        isVertical: false,
      });

      const primaryLine = container.querySelector('.column-guideline-line.primary') as HTMLElement;
      const hangingLine = container.querySelector('.column-guideline-line.hanging') as HTMLElement;

      expect(primaryLine).not.toBeNull();
      expect(hangingLine).not.toBeNull();

      // Pitch = 20 * 1.03 = 20.6px
      // Primary X = 48 (padding-left fallback) + 40 * 20.6 = 872px
      expect(primaryLine.style.left).toBe('872px');
      expect(hangingLine.style.left).toBe('892.6px');
    });

    it('renders horizontal tick marks at 10-character intervals', () => {
      new ColumnGuideline({
        container,
        columns: 40,
        isVertical: false,
        showTicks: true,
      });

      const ticks = container.querySelectorAll('.column-guideline-tick-mark.tick-h');
      // For 40 columns: ticks at 10, 20, 30 -> 3 ticks
      expect(ticks.length).toBe(3);
    });
  });

  describe('Vertical Mode Calculations & Ticks', () => {
    it('positions primary line and hanging line horizontally along Y-axis in vertical mode', () => {
      const guideline = new ColumnGuideline({
        container,
        columns: 40,
        fontSize: 20,
        isVertical: true,
      });

      const root = container.querySelector('.column-guideline-container');
      expect(root?.classList.contains('mode-vertical')).toBe(true);

      const primaryLine = container.querySelector('.column-guideline-line.primary') as HTMLElement;
      const hangingLine = container.querySelector('.column-guideline-line.hanging') as HTMLElement;

      // In vertical: pitch height = 20 * 1.05 = 21px
      // Pad top = 40 (from container.style.paddingTop) + 40 * 21 = 880px
      // Hanging = 40 + 41 * 21 = 901px
      expect(primaryLine.style.top).toBe('880px');
      expect(hangingLine.style.top).toBe('901px');

      const ticks = container.querySelectorAll('.column-guideline-tick-mark.tick-v');
      expect(ticks.length).toBe(3);
    });

    it('dynamically switches between vertical and horizontal layout', () => {
      const guideline = new ColumnGuideline({ container, isVertical: false });
      const root = container.querySelector('.column-guideline-container') as HTMLElement;
      expect(root.classList.contains('mode-horizontal')).toBe(true);

      guideline.setVertical(true);
      expect(root.classList.contains('mode-vertical')).toBe(true);
      expect(root.classList.contains('mode-horizontal')).toBe(false);

      guideline.setVertical(false);
      expect(root.classList.contains('mode-horizontal')).toBe(true);
    });
  });

  describe('Hanging and Visibility Controls', () => {
    it('shows or hides hanging punctuation tolerance border', () => {
      const guideline = new ColumnGuideline({ container, allowHanging: true });
      const hangingLine = container.querySelector('.column-guideline-line.hanging') as HTMLElement;
      expect(hangingLine.style.display).toBe('block');

      guideline.setAllowHanging(false);
      expect(hangingLine.style.display).toBe('none');

      guideline.setAllowHanging(true);
      expect(hangingLine.style.display).toBe('block');
    });

    it('persists visibility state to LocalStorage and toggles hidden class', () => {
      const guideline = new ColumnGuideline({ container, visible: true });
      const root = container.querySelector('.column-guideline-container') as HTMLElement;
      expect(root.classList.contains('hidden')).toBe(false);

      guideline.setVisible(false);
      expect(root.classList.contains('hidden')).toBe(true);
      expect(localStorage.getItem(STORAGE_KEY_GUIDELINE_VISIBLE)).toBe('false');

      guideline.setVisible(true);
      expect(root.classList.contains('hidden')).toBe(false);
      expect(localStorage.getItem(STORAGE_KEY_GUIDELINE_VISIBLE)).toBe('true');
    });

    it('cleans up DOM on destroy', () => {
      const guideline = new ColumnGuideline({ container });
      expect(container.querySelector('.column-guideline-container')).not.toBeNull();

      guideline.destroy();
      expect(container.querySelector('.column-guideline-container')).toBeNull();
    });
  });
});

describe('EditorView & ColumnGuideline Integration', () => {
  it('instantiates ColumnGuideline and keeps it synchronized with KinsokuEngine settings', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const editorView = new EditorView(container);
    editorView.render();

    const guideline = editorView.getColumnGuideline();
    expect(guideline).not.toBeNull();
    expect(guideline?.getColumns()).toBe(40);
    expect(guideline?.getAllowHanging()).toBe(true);

    // Update Kinsoku columns -> ColumnGuideline reflects change
    editorView.setKinsokuColumns(35);
    expect(guideline?.getColumns()).toBe(35);

    // Update Hanging -> ColumnGuideline reflects change
    editorView.setAllowHanging(false);
    expect(guideline?.getAllowHanging()).toBe(false);

    // Visibility toggle
    editorView.setColumnGuidelineVisible(false);
    expect(guideline?.isVisible()).toBe(false);
  });
});

describe('app.html DOM Spec & Settings Integration for ColumnGuideline', () => {
  let html: string;

  beforeEach(() => {
    localStorage.clear();
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
  });

  it('contains settingColumnGuideline in settingsModal', () => {
    const chk = document.getElementById('settingColumnGuideline') as HTMLInputElement | null;
    expect(chk).not.toBeNull();
    expect(chk?.getAttribute('type')).toBe('checkbox');
    expect(chk?.checked).toBe(true);
  });

  it('verifies settingsModal DOM handles guideline and kinsoku columns cohesively', async () => {
    const { PlotailorApp } = await import('../src/app/main.js');
    const app = new PlotailorApp();

    const guideline = app.getColumnGuideline();
    expect(guideline).not.toBeNull();
    expect(guideline?.getColumns()).toBe(40);

    // Change Kinsoku columns slider
    const inputCols = document.getElementById('settingKinsokuColumns') as HTMLInputElement;
    inputCols.value = '45';
    inputCols.dispatchEvent(new Event('input'));
    expect(guideline?.getColumns()).toBe(45);

    // Change Hanging checkbox
    const chkHanging = document.getElementById('settingKinsokuHanging') as HTMLInputElement;
    chkHanging.checked = false;
    chkHanging.dispatchEvent(new Event('change'));
    expect(guideline?.getAllowHanging()).toBe(false);

    // Change Guideline checkbox
    const chkGuideline = document.getElementById('settingColumnGuideline') as HTMLInputElement;
    chkGuideline.checked = false;
    chkGuideline.dispatchEvent(new Event('change'));
    expect(guideline?.isVisible()).toBe(false);
    expect(localStorage.getItem('plotailor_column_guideline_visible')).toBe('false');
  });
});
