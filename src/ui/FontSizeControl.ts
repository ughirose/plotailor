/**
 * FontSizeControl.ts
 *
 * Custom numeric direct input control for font size (12-36px), line height, and letter spacing.
 * Performs automatic follow-up calculations for manuscript grid layout and vertical writing mode.
 * Persists values in LocalStorage under 'plotailor_font_size' and applies styles to editor DOM.
 *
 * Strictly adheres to 3-Pane Integrated IDE Constitution (no standalone/blocking modals).
 */

export const MIN_FONT_SIZE = 12;
export const MAX_FONT_SIZE = 36;
export const DEFAULT_FONT_SIZE = 16;
export const STORAGE_KEY = 'plotailor_font_size';

export interface FontMetrics {
  fontSize: number; // in px (12 ~ 36)
  lineHeight: number; // in px (fontSize * lineHeightRatio)
  lineHeightRatio: number; // multiplier, default 1.8
  letterSpacing: number; // in px (fontSize * 0.05)
  gridColumnWidth: number; // in px (for manuscript vertical writing column width)
  gridRowHeight: number; // in px (for manuscript character pitch)
}

export interface FontSizeControlOptions {
  initialSize?: number;
  lineHeightRatio?: number;
  onChange?: (fontSize: number, metrics: FontMetrics) => void;
}

export class FontSizeControl {
  private currentSize: number;
  private lineHeightRatio: number;
  private onChange?: (fontSize: number, metrics: FontMetrics) => void;

  constructor(options?: FontSizeControlOptions) {
    this.lineHeightRatio = options?.lineHeightRatio ?? 1.8;
    this.onChange = options?.onChange;
    this.currentSize = options?.initialSize !== undefined
      ? FontSizeControl.clampFontSize(options.initialSize)
      : FontSizeControl.loadFontSize();
  }

  /**
   * Clamps a font size value strictly between MIN_FONT_SIZE (12px) and MAX_FONT_SIZE (36px).
   * Parses string inputs like "18px" or "18". Fallback is DEFAULT_FONT_SIZE (16px).
   */
  public static clampFontSize(value: number | string): number {
    if (typeof value === 'string') {
      const parsed = parseFloat(value.replace(/px/gi, '').trim());
      if (isNaN(parsed)) return DEFAULT_FONT_SIZE;
      value = parsed;
    }
    if (typeof value !== 'number' || isNaN(value)) {
      return DEFAULT_FONT_SIZE;
    }
    return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.round(value)));
  }

  /**
   * Automatically calculates line height, letter spacing, and manuscript grid dimensions
   * derived from the base font size.
   */
  public static calculateMetrics(fontSize: number, lineHeightRatio: number = 1.8): FontMetrics {
    const clampedSize = FontSizeControl.clampFontSize(fontSize);
    const lineHeight = Number((clampedSize * lineHeightRatio).toFixed(2));
    const letterSpacing = Number((clampedSize * 0.05).toFixed(2));
    const gridColumnWidth = lineHeight;
    const gridRowHeight = Number((clampedSize * 1.05).toFixed(2));

    return {
      fontSize: clampedSize,
      lineHeight,
      lineHeightRatio,
      letterSpacing,
      gridColumnWidth,
      gridRowHeight,
    };
  }

  /**
   * Loads the font size from LocalStorage under key 'plotailor_font_size'.
   */
  public static loadFontSize(): number {
    if (typeof localStorage === 'undefined') return DEFAULT_FONT_SIZE;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return FontSizeControl.clampFontSize(saved);
      }
    } catch {
      // ignore storage access error
    }
    return DEFAULT_FONT_SIZE;
  }

  /**
   * Saves the font size to LocalStorage under key 'plotailor_font_size'.
   */
  public static saveFontSize(fontSize: number): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const clamped = FontSizeControl.clampFontSize(fontSize);
      localStorage.setItem(STORAGE_KEY, `${clamped}px`);
    } catch {
      // ignore storage access error
    }
  }

  /**
   * Immediately applies the font metrics to the editor DOM element.
   * Updates inline styles and CSS variables.
   */
  public static applyToDOM(
    element: HTMLElement,
    fontSize: number,
    options?: { isVertical?: boolean; lineHeightRatio?: number }
  ): FontMetrics {
    const metrics = FontSizeControl.calculateMetrics(fontSize, options?.lineHeightRatio);

    element.style.fontSize = `${metrics.fontSize}px`;
    element.style.lineHeight = `${metrics.lineHeightRatio}`;
    element.style.letterSpacing = `${metrics.letterSpacing}px`;

    element.style.setProperty('--plotailor-font-size', `${metrics.fontSize}px`);
    element.style.setProperty('--plotailor-line-height', `${metrics.lineHeight}px`);
    element.style.setProperty('--plotailor-line-height-ratio', `${metrics.lineHeightRatio}`);
    element.style.setProperty('--plotailor-letter-spacing', `${metrics.letterSpacing}px`);
    element.style.setProperty('--plotailor-grid-column-width', `${metrics.gridColumnWidth}px`);
    element.style.setProperty('--plotailor-grid-row-height', `${metrics.gridRowHeight}px`);

    if (options?.isVertical) {
      element.style.setProperty('--plotailor-vertical-column-gap', `${metrics.lineHeight - metrics.fontSize}px`);
    }

    return metrics;
  }

  public getFontSize(): number {
    return this.currentSize;
  }

  public getMetrics(): FontMetrics {
    return FontSizeControl.calculateMetrics(this.currentSize, this.lineHeightRatio);
  }

  /**
   * Updates the current font size, saves to LocalStorage, and notifies listener.
   */
  public setFontSize(fontSize: number | string, triggerCallback = true): FontMetrics {
    this.currentSize = FontSizeControl.clampFontSize(fontSize);
    FontSizeControl.saveFontSize(this.currentSize);
    const metrics = this.getMetrics();
    if (triggerCallback && this.onChange) {
      this.onChange(this.currentSize, metrics);
    }
    return metrics;
  }

  /**
   * Renders inline HTML combining a preset select dropdown and custom numeric input control.
   */
  public renderHTML(prefix = 'font-size-ctrl'): string {
    const size = this.currentSize;
    const presets = [12, 14, 16, 18, 20, 24, 28, 32, 36];
    const isPreset = presets.includes(size);

    return `
      <div class="font-size-control-container" id="${prefix}-wrapper" style="display: inline-flex; align-items: center; gap: 6px;">
        <select class="ide-input font-size-preset-select" id="${prefix}-select" aria-label="フォントサイズプリセット" style="font-size: 12px; padding: 3px 6px; border-radius: 4px; height: 28px;">
          ${presets.map((p) => `<option value="${p}" ${p === size ? 'selected' : ''}>${p}px${p === 16 ? ' (標準)' : ''}</option>`).join('')}
          ${!isPreset ? `<option value="${size}" selected>カスタム (${size}px)</option>` : ''}
        </select>
        <div class="font-size-custom-input-group" style="display: inline-flex; align-items: center; gap: 2px;">
          <input
            type="number"
            class="ide-input font-size-number-input"
            id="${prefix}-number"
            min="${MIN_FONT_SIZE}"
            max="${MAX_FONT_SIZE}"
            value="${size}"
            aria-label="フォントサイズ直接入力(px)"
            style="width: 52px; font-size: 12px; padding: 3px 4px; text-align: right; border-radius: 4px; height: 28px;"
          />
          <span style="font-size: 11px; color: var(--color-text-dim, #94a3b8);">px</span>
        </div>
      </div>
    `;
  }

  /**
   * Binds event listeners to the inline control element.
   */
  public bindEvents(container: HTMLElement, prefix = 'font-size-ctrl'): void {
    const selectEl = container.querySelector(`#${prefix}-select`) as HTMLSelectElement | null;
    const numberEl = container.querySelector(`#${prefix}-number`) as HTMLInputElement | null;

    const syncValue = (val: number | string) => {
      const metrics = this.setFontSize(val, true);
      if (numberEl) {
        numberEl.value = metrics.fontSize.toString();
      }
      if (selectEl) {
        const presets = [12, 14, 16, 18, 20, 24, 28, 32, 36];
        if (presets.includes(metrics.fontSize)) {
          selectEl.value = metrics.fontSize.toString();
        } else {
          // If custom size not in standard presets, select custom option or add temporarily
          let opt = selectEl.querySelector('option[data-custom="true"]') as HTMLOptionElement | null;
          if (!opt) {
            opt = document.createElement('option');
            opt.dataset.custom = 'true';
            selectEl.appendChild(opt);
          }
          opt.value = metrics.fontSize.toString();
          opt.textContent = `カスタム (${metrics.fontSize}px)`;
          selectEl.value = metrics.fontSize.toString();
        }
      }
    };

    selectEl?.addEventListener('change', (e) => {
      const val = (e.target as HTMLSelectElement).value;
      syncValue(val);
    });

    numberEl?.addEventListener('input', (e) => {
      const val = (e.target as HTMLInputElement).value;
      if (val !== '') {
        syncValue(val);
      }
    });

    numberEl?.addEventListener('change', (e) => {
      const val = (e.target as HTMLInputElement).value;
      syncValue(val);
    });
  }
}
