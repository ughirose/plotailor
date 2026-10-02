// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FontSizeControl,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
  DEFAULT_FONT_SIZE,
  STORAGE_KEY,
} from '../src/ui/FontSizeControl.js';
import { VerticalViewport } from '../src/core/editor/VerticalViewport.js';

describe('FontSizeControl & Font Metrics Custom Direct Input', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('Range Validation & Clamping (12px ~ 36px)', () => {
    it('clamps values below 12px to MIN_FONT_SIZE (12px)', () => {
      expect(FontSizeControl.clampFontSize(5)).toBe(MIN_FONT_SIZE);
      expect(FontSizeControl.clampFontSize(0)).toBe(MIN_FONT_SIZE);
      expect(FontSizeControl.clampFontSize(-10)).toBe(MIN_FONT_SIZE);
      expect(FontSizeControl.clampFontSize('8px')).toBe(MIN_FONT_SIZE);
    });

    it('clamps values above 36px to MAX_FONT_SIZE (36px)', () => {
      expect(FontSizeControl.clampFontSize(40)).toBe(MAX_FONT_SIZE);
      expect(FontSizeControl.clampFontSize(100)).toBe(MAX_FONT_SIZE);
      expect(FontSizeControl.clampFontSize('50px')).toBe(MAX_FONT_SIZE);
    });

    it('retains valid values between 12px and 36px', () => {
      expect(FontSizeControl.clampFontSize(12)).toBe(12);
      expect(FontSizeControl.clampFontSize(18)).toBe(18);
      expect(FontSizeControl.clampFontSize(24)).toBe(24);
      expect(FontSizeControl.clampFontSize(36)).toBe(36);
      expect(FontSizeControl.clampFontSize('22px')).toBe(22);
    });

    it('falls back to DEFAULT_FONT_SIZE (16px) for invalid/NaN inputs', () => {
      expect(FontSizeControl.clampFontSize('invalid')).toBe(DEFAULT_FONT_SIZE);
      expect(FontSizeControl.clampFontSize(NaN)).toBe(DEFAULT_FONT_SIZE);
    });
  });

  describe('Automatic Metric Calculations (Line Height & Manuscript Grid)', () => {
    it('calculates accurate line height and letter spacing for default 16px', () => {
      const metrics = FontSizeControl.calculateMetrics(16, 1.8);
      expect(metrics.fontSize).toBe(16);
      expect(metrics.lineHeight).toBe(28.8); // 16 * 1.8
      expect(metrics.lineHeightRatio).toBe(1.8);
      expect(metrics.letterSpacing).toBe(0.8); // 16 * 0.05
      expect(metrics.gridColumnWidth).toBe(28.8);
      expect(metrics.gridRowHeight).toBe(16.8); // 16 * 1.05
    });

    it('calculates custom metrics for 20px font size', () => {
      const metrics = FontSizeControl.calculateMetrics(20, 1.8);
      expect(metrics.fontSize).toBe(20);
      expect(metrics.lineHeight).toBe(36); // 20 * 1.8
      expect(metrics.letterSpacing).toBe(1.0); // 20 * 0.05
      expect(metrics.gridColumnWidth).toBe(36);
      expect(metrics.gridRowHeight).toBe(21); // 20 * 1.05
    });

    it('calculates metrics for 36px max font size', () => {
      const metrics = FontSizeControl.calculateMetrics(36, 1.8);
      expect(metrics.fontSize).toBe(36);
      expect(metrics.lineHeight).toBe(64.8);
      expect(metrics.letterSpacing).toBe(1.8);
    });
  });

  describe('LocalStorage Persistence (plotailor_font_size)', () => {
    it('saves custom font size to localStorage under plotailor_font_size', () => {
      FontSizeControl.saveFontSize(22);
      expect(localStorage.getItem(STORAGE_KEY)).toBe('22px');
    });

    it('loads custom font size from localStorage', () => {
      localStorage.setItem(STORAGE_KEY, '28px');
      const loaded = FontSizeControl.loadFontSize();
      expect(loaded).toBe(28);
    });

    it('returns DEFAULT_FONT_SIZE if localStorage is empty or corrupted', () => {
      expect(FontSizeControl.loadFontSize()).toBe(DEFAULT_FONT_SIZE);

      localStorage.setItem(STORAGE_KEY, 'corrupted');
      expect(FontSizeControl.loadFontSize()).toBe(DEFAULT_FONT_SIZE);
    });
  });

  describe('Editor DOM Styling Application', () => {
    it('applies font metrics directly to HTMLElement inline styles and CSS variables', () => {
      const el = document.createElement('div');
      const metrics = FontSizeControl.applyToDOM(el, 18);

      expect(metrics.fontSize).toBe(18);
      expect(el.style.fontSize).toBe('18px');
      expect(el.style.lineHeight).toBe('1.8');
      expect(el.style.letterSpacing).toBe('0.9px');

      expect(el.style.getPropertyValue('--plotailor-font-size')).toBe('18px');
      expect(el.style.getPropertyValue('--plotailor-line-height')).toBe('32.4px');
      expect(el.style.getPropertyValue('--plotailor-letter-spacing')).toBe('0.9px');
      expect(el.style.getPropertyValue('--plotailor-grid-column-width')).toBe('32.4px');
    });

    it('applies vertical writing mode specific column gap custom variable', () => {
      const el = document.createElement('div');
      FontSizeControl.applyToDOM(el, 20, { isVertical: true });

      // lineHeight = 36px, fontSize = 20px -> gap = 16px
      expect(el.style.getPropertyValue('--plotailor-vertical-column-gap')).toBe('16px');
    });
  });

  describe('Inline Control Rendering & Direct Numeric Input Interaction', () => {
    it('renders inline control containing both preset select and number input', () => {
      const ctrl = new FontSizeControl({ initialSize: 18 });
      const html = ctrl.renderHTML('test-ctrl');

      expect(html).toContain('<select');
      expect(html).toContain('id="test-ctrl-select"');
      expect(html).toContain('<input');
      expect(html).toContain('type="number"');
      expect(html).toContain('id="test-ctrl-number"');
      expect(html).toContain('value="18"');
      expect(html).toContain('min="12"');
      expect(html).toContain('max="36"');

      // Verifies non-modal inline construction rule
      expect(html).not.toContain('<dialog');
      expect(html).not.toContain('role="dialog"');
    });

    it('triggers onChange callback on custom direct numeric input', () => {
      const onChange = vi.fn();
      const ctrl = new FontSizeControl({ initialSize: 16, onChange });

      const container = document.createElement('div');
      container.innerHTML = ctrl.renderHTML('ctrl-1');
      ctrl.bindEvents(container, 'ctrl-1');

      const numInput = container.querySelector('#ctrl-1-number') as HTMLInputElement;
      expect(numInput).not.toBeNull();

      // Simulate direct numeric typing of 24
      numInput.value = '24';
      numInput.dispatchEvent(new Event('input', { bubbles: true }));

      expect(onChange).toHaveBeenCalledWith(24, expect.objectContaining({
        fontSize: 24,
        lineHeight: 43.2,
      }));
      expect(localStorage.getItem(STORAGE_KEY)).toBe('24px');
    });

    it('syncs select dropdown when direct custom numeric value is typed', () => {
      const ctrl = new FontSizeControl({ initialSize: 16 });

      const container = document.createElement('div');
      container.innerHTML = ctrl.renderHTML('ctrl-2');
      ctrl.bindEvents(container, 'ctrl-2');

      const numInput = container.querySelector('#ctrl-2-number') as HTMLInputElement;
      const selectEl = container.querySelector('#ctrl-2-select') as HTMLSelectElement;

      // Type custom unlisted size (e.g. 21px)
      numInput.value = '21';
      numInput.dispatchEvent(new Event('input', { bubbles: true }));

      expect(ctrl.getFontSize()).toBe(21);
      expect(selectEl.value).toBe('21');
      expect(selectEl.selectedOptions[0].textContent).toContain('21px');
    });
  });

  describe('VerticalViewport Integration', () => {
    it('uses clamped font size in VerticalViewport and calculates metrics correctly', () => {
      const viewport = new VerticalViewport({ fontSize: 22, linePitch: 1.8 });
      expect(viewport.getSettings().fontSize).toBe(22);

      viewport.setFontSize(40); // Over max limit
      expect(viewport.getSettings().fontSize).toBe(MAX_FONT_SIZE);

      const metrics = viewport.getMetrics();
      expect(metrics.fontSize).toBe(36);
      expect(metrics.lineHeight).toBe(64.8);
    });
  });
});
