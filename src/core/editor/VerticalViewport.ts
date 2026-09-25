/**
 * VerticalViewport - Japanese Literature Viewport Manager
 * 
 * Manages vertical writing mode (writing-mode: vertical-rl), upright text orientation,
 * inline Aozora Bunko formatting, and inline non-modal layout controls.
 * 
 * Adheres strictly to the 3-Pane Integrated IDE Constitution:
 * - Single-use modals are prohibited.
 * - Appearance configurations (font size, line pitch, writing mode) are docked inline.
 */

import { AozoraParser } from './AozoraParser.js';
import { ScrollNormalizer } from './ScrollNormalizer.js';

export type WritingMode = 'vertical-rl' | 'horizontal-tb';

export interface ViewportSettings {
  writingMode: WritingMode;
  fontSize: number; // in px, default 16
  linePitch: number; // line-height multiplier, default 1.8
  fontFamily: string;
  theme: 'light' | 'dark' | 'sepia';
}

export class VerticalViewport {
  private settings: ViewportSettings;
  private scrollNormalizer: ScrollNormalizer;
  private listeners: ((settings: ViewportSettings) => void)[] = [];

  constructor(initialSettings?: Partial<ViewportSettings>) {
    this.settings = {
      writingMode: initialSettings?.writingMode ?? 'vertical-rl',
      fontSize: initialSettings?.fontSize ?? 16,
      linePitch: initialSettings?.linePitch ?? 1.8,
      fontFamily: initialSettings?.fontFamily ?? '"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif',
      theme: initialSettings?.theme ?? 'light',
    };
    this.scrollNormalizer = new ScrollNormalizer({ lineHeight: this.settings.fontSize * this.settings.linePitch });
  }

  getSettings(): ViewportSettings {
    return { ...this.settings };
  }

  isVertical(): boolean {
    return this.settings.writingMode === 'vertical-rl';
  }

  setWritingMode(mode: WritingMode): void {
    this.settings.writingMode = mode;
    this.notify();
  }

  toggleWritingMode(): WritingMode {
    this.settings.writingMode = this.settings.writingMode === 'vertical-rl' ? 'horizontal-tb' : 'vertical-rl';
    this.notify();
    return this.settings.writingMode;
  }

  setFontSize(fontSize: number): void {
    this.settings.fontSize = Math.max(10, Math.min(36, fontSize));
    this.scrollNormalizer = new ScrollNormalizer({ lineHeight: this.settings.fontSize * this.settings.linePitch });
    this.notify();
  }

  setLinePitch(linePitch: number): void {
    this.settings.linePitch = Math.max(1.2, Math.min(3.0, linePitch));
    this.scrollNormalizer = new ScrollNormalizer({ lineHeight: this.settings.fontSize * this.settings.linePitch });
    this.notify();
  }

  setTheme(theme: 'light' | 'dark' | 'sepia'): void {
    this.settings.theme = theme;
    this.notify();
  }

  getScrollNormalizer(): ScrollNormalizer {
    return this.scrollNormalizer;
  }

  /**
   * Generates container CSS class list.
   */
  getContainerClasses(): string[] {
    const classes = ['plotailor-viewport'];
    if (this.isVertical()) {
      classes.push('cm-vertical', 'writing-mode-vertical');
    } else {
      classes.push('cm-horizontal', 'writing-mode-horizontal');
    }
    classes.push(`theme-${this.settings.theme}`);
    return classes;
  }

  /**
   * Generates inline styles for viewport container.
   */
  getContainerStyle(): Record<string, string> {
    const isVert = this.isVertical();
    return {
      writingMode: this.settings.writingMode,
      textOrientation: isVert ? 'upright' : 'mixed',
      fontSize: `${this.settings.fontSize}px`,
      lineHeight: `${this.settings.linePitch}`,
      fontFamily: this.settings.fontFamily,
      overflowX: isVert ? 'auto' : 'hidden',
      overflowY: isVert ? 'hidden' : 'auto',
      direction: isVert ? 'rtl' : 'ltr',
    };
  }

  /**
   * Renders parsed document content with Aozora Bunko formatting.
   */
  renderContent(rawText: string): string {
    return AozoraParser.toHtml(rawText);
  }

  /**
   * Renders the appearance control panel (inline docked for 3-pane IDE).
   * Note: Adheres strictly to non-modal rule.
   */
  renderInlineAppearanceBar(): string {
    const modeLabel = this.isVertical() ? '縦書き (Vertical)' : '横書き (Horizontal)';
    return (
      `<div class="inline-appearance-bar" data-testid="inline-appearance-bar">` +
      `<button class="btn-toggle-writing-mode" data-testid="toggle-mode-btn">${modeLabel}</button>` +
      `<span class="font-size-label">文字サイズ: ${this.settings.fontSize}px</span>` +
      `<span class="line-pitch-label">行間: ${this.settings.linePitch}</span>` +
      `</div>`
    );
  }

  subscribe(listener: (settings: ViewportSettings) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.getSettings());
    }
  }
}
