import type { VerticalGlyphMetrics } from '../../types/vertical-layout.js';

export interface CompositorOptions {
  width: number;
  height: number;
  fontSize: number;
  lineHeight: number;
  fontFamily?: string;
  rubyFontSize?: number;
  rubyGap?: number;
}

export class VerticalCanvasCompositor {
  private canvas: OffscreenCanvas | HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  private options: CompositorOptions;
  private metricsMap: Map<number, VerticalGlyphMetrics> = new Map();

  constructor(options: CompositorOptions) {
    this.options = {
      fontFamily: 'serif',
      rubyFontSize: options.fontSize / 2,
      rubyGap: 2,
      ...options,
    };

    if (typeof OffscreenCanvas !== 'undefined') {
      try {
        this.canvas = new OffscreenCanvas(this.options.width, this.options.height);
        this.ctx = this.canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
      } catch {
        this.canvas = { width: this.options.width, height: this.options.height } as unknown as OffscreenCanvas;
        this.ctx = this.createMockContext();
      }
    } else if (typeof document !== 'undefined') {
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.options.width;
      this.canvas.height = this.options.height;
      try {
        this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
      } catch {
        this.ctx = this.createMockContext();
      }
    } else {
      this.canvas = { width: this.options.width, height: this.options.height } as unknown as HTMLCanvasElement;
      this.ctx = this.createMockContext();
    }

    if (!this.ctx) {
      this.ctx = this.createMockContext();
    }
  }

  private createMockContext(): CanvasRenderingContext2D {
    return {
      clearRect: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
      fillText: () => {},
      textBaseline: 'top',
      textAlign: 'center',
      font: '',
    } as unknown as CanvasRenderingContext2D;
  }

  public getCanvas(): OffscreenCanvas | HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Calculates JIS X 4051 compliant character placement coordinates for vertical layout.
   * Right-to-left line progression, top-to-bottom character progression.
   */
  public calculateLayout(text: string, metricsData: Partial<VerticalGlyphMetrics>[] = []): VerticalGlyphMetrics[] {
    const { width, height, fontSize, lineHeight } = this.options;
    const metrics: VerticalGlyphMetrics[] = [];
    this.metricsMap.clear();

    const chars = Array.from(text);
    const lineSpacing = fontSize * lineHeight;

    let currentX = width - lineSpacing + (lineSpacing - fontSize) / 2;
    let currentY = 0;

    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      const customMetric = metricsData[i] || {};

      // Line break handling
      if (char === '\n' || currentY + fontSize > height) {
        currentX -= lineSpacing;
        currentY = 0;

        if (char === '\n') {
          const newlineMetric: VerticalGlyphMetrics = {
            glyph: char,
            x: currentX,
            y: currentY,
            ...customMetric,
          };
          metrics.push(newlineMetric);
          this.metricsMap.set(i, newlineMetric);
          continue;
        }
      }

      const glyphMetric: VerticalGlyphMetrics = {
        glyph: char,
        x: currentX,
        y: currentY,
        ...customMetric,
      };

      metrics.push(glyphMetric);
      this.metricsMap.set(i, glyphMetric);

      currentY += fontSize;
    }

    return metrics;
  }

  /**
   * Renders the pre-calculated layout onto the canvas context.
   */
  public render(metrics: VerticalGlyphMetrics[]): void {
    const { fontSize, fontFamily, rubyFontSize, rubyGap } = this.options;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.textBaseline = 'top';
    this.ctx.textAlign = 'center';

    for (const metric of metrics) {
      if (metric.glyph === '\n') continue;

      const centerX = metric.x + fontSize / 2;

      // Render TCY (縦中横) or standard character
      if (metric.isTcy) {
        this.ctx.font = `${fontSize}px ${fontFamily}`;
        this.ctx.save();
        this.ctx.translate(centerX, metric.y + fontSize / 2);
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(metric.glyph, 0, 0, fontSize);
        this.ctx.restore();
      } else {
        this.ctx.font = `${fontSize}px ${fontFamily}`;

        // Punctuation rotation heuristic
        const needsRotation = /[（）「」『』ー…]/.test(metric.glyph);

        if (needsRotation) {
          this.ctx.save();
          this.ctx.translate(centerX, metric.y + fontSize / 2);
          this.ctx.rotate(Math.PI / 2);
          this.ctx.textBaseline = 'middle';
          this.ctx.fillText(metric.glyph, 0, 0);
          this.ctx.restore();
        } else {
          this.ctx.fillText(metric.glyph, centerX, metric.y);
        }
      }

      // Render Ruby text (ルビ)
      if (metric.rubyText) {
        const rFontSize = rubyFontSize || fontSize / 2;
        const rGap = rubyGap || 2;
        this.ctx.font = `${rFontSize}px ${fontFamily}`;

        const rubyX = metric.x + fontSize + rGap + rFontSize / 2;

        const rubyChars = Array.from(metric.rubyText);
        const step = fontSize / Math.max(1, rubyChars.length);
        let currentRubyY = metric.y + (fontSize - step * rubyChars.length) / 2;

        for (const rChar of rubyChars) {
          this.ctx.fillText(rChar, rubyX, currentRubyY);
          currentRubyY += step;
        }
      }

      // Render Emphasis (傍点)
      if (metric.emphasisStyle && metric.emphasisStyle !== 'none') {
        const rFontSize = rubyFontSize || fontSize / 2;
        const rGap = rubyGap || 2;
        const empX = metric.x + fontSize + rGap + rFontSize / 2;
        const empY = metric.y + (fontSize - rFontSize) / 2;

        this.ctx.font = `${rFontSize}px ${fontFamily}`;

        switch (metric.emphasisStyle) {
          case 'dot':
          case 'sesame':
            this.ctx.fillText('﹅', empX, empY);
            break;
          case 'circle':
            this.ctx.fillText('○', empX, empY);
            break;
          case 'double-circle':
            this.ctx.fillText('◎', empX, empY);
            break;
          case 'triangle':
            this.ctx.fillText('△', empX, empY);
            break;
        }
      }
    }
  }

  /**
   * Translates canvas coordinates (x, y) back to the closest character index.
   */
  public hitTest(x: number, y: number): number {
    const { width, height } = this.options;

    if (x < 0 || x > width || y < 0 || y > height) {
      return -1;
    }

    let closestIndex = -1;
    let minDistance = Infinity;

    for (const [index, metric] of this.metricsMap.entries()) {
      const centerX = metric.x + this.options.fontSize / 2;
      const centerY = metric.y + this.options.fontSize / 2;

      const dx = x - centerX;
      const dy = y - centerY;
      const distanceSq = dx * dx + dy * dy;

      if (distanceSq < minDistance) {
        minDistance = distanceSq;
        closestIndex = index;
      }
    }

    return closestIndex;
  }
}
