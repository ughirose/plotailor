/**
 * ColumnGuideline.ts
 *
 * Manuscript Column Guideline & Ruler component for WorldCraft Plotailor.
 * Renders visual margin borders, tick rulers, and hanging-punctuation bounds
 * for both horizontal (width-based) and vertical (height-based) writing modes.
 *
 * Synchronizes dynamically with:
 * - KinsokuEngine columnsPerLine (30-50 characters)
 * - KinsokuEngine allowHanging (hanging punctuation tolerance line)
 * - Horizontal/Vertical writing mode toggle
 * - Dynamic font size scaling (12-36px)
 * - LocalStorage persistence ('plotailor_column_guideline_visible')
 */

export const STORAGE_KEY_GUIDELINE_VISIBLE = 'plotailor_column_guideline_visible';
export const DEFAULT_COLUMNS = 40;
export const MIN_COLUMNS = 30;
export const MAX_COLUMNS = 50;

export interface ColumnGuidelineOptions {
  container: HTMLElement;
  columns?: number;
  allowHanging?: boolean;
  isVertical?: boolean;
  fontSize?: number;
  visible?: boolean;
  showTicks?: boolean;
  onColumnsChange?: (columns: number) => void;
}

export class ColumnGuideline {
  private container: HTMLElement;
  private rootEl: HTMLElement | null = null;
  private primaryLineEl: HTMLElement | null = null;
  private hangingLineEl: HTMLElement | null = null;
  private primaryBadgeEl: HTMLElement | null = null;
  private hangingBadgeEl: HTMLElement | null = null;
  private ticksContainerEl: HTMLElement | null = null;

  private columns: number;
  private allowHanging: boolean;
  private isVertical: boolean;
  private fontSize: number;
  private visible: boolean;
  private showTicks: boolean;
  private isOverflowState: boolean = false;
  private isHangingState: boolean = false;
  private onColumnsChange?: (columns: number) => void;

  constructor(options: ColumnGuidelineOptions) {
    this.container = options.container;
    this.columns = this.clampColumns(options.columns ?? DEFAULT_COLUMNS);
    this.allowHanging = options.allowHanging ?? true;
    this.isVertical = options.isVertical ?? false;
    this.fontSize = options.fontSize ?? 17;
    this.visible = options.visible ?? ColumnGuideline.loadVisibility();
    this.showTicks = options.showTicks ?? true;
    this.onColumnsChange = options.onColumnsChange;

    this.mount();
    this.update();
  }

  /**
   * Clamp columns strictly within valid range [30, 50].
   */
  public clampColumns(val: number): number {
    if (isNaN(val) || val === null || val === undefined) return DEFAULT_COLUMNS;
    return Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, Math.round(val)));
  }

  /**
   * Load guideline visibility preference from LocalStorage.
   */
  public static loadVisibility(): boolean {
    if (typeof localStorage === 'undefined') return true;
    try {
      const saved = localStorage.getItem(STORAGE_KEY_GUIDELINE_VISIBLE);
      if (saved !== null) {
        return saved === 'true';
      }
    } catch {
      // ignore
    }
    return true;
  }

  /**
   * Save guideline visibility preference to LocalStorage.
   */
  public static saveVisibility(visible: boolean): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY_GUIDELINE_VISIBLE, visible ? 'true' : 'false');
    } catch {
      // ignore
    }
  }

  /**
   * Mount guideline DOM structure into container.
   */
  private mount(): void {
    if (!this.container) return;

    // Remove any existing instance
    const existing = this.container.querySelector('.column-guideline-container');
    if (existing) {
      existing.remove();
    }

    const root = document.createElement('div');
    root.className = `column-guideline-container ${this.isVertical ? 'mode-vertical' : 'mode-horizontal'}`;
    if (!this.visible) {
      root.classList.add('hidden');
    }

    // Ticks track
    const ticks = document.createElement('div');
    ticks.className = 'column-guideline-ticks';
    root.appendChild(ticks);
    this.ticksContainerEl = ticks;

    // Primary border line (N columns)
    const primaryLine = document.createElement('div');
    primaryLine.className = 'column-guideline-line primary';
    const primaryBadge = document.createElement('span');
    primaryBadge.className = 'column-guideline-badge';
    primaryBadge.textContent = `${this.columns}字`;
    primaryLine.appendChild(primaryBadge);

    // Drag handle for adjusting column count (Item 14)
    const dragHandle = document.createElement('div');
    dragHandle.className = 'column-guideline-drag-handle';
    dragHandle.title = 'ドラッグして行長（30〜50字）を変更';
    dragHandle.textContent = '⋮';
    primaryLine.appendChild(dragHandle);

    let isDragging = false;
    let startCoord = 0;
    let startCols = this.columns;

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      isDragging = true;
      startCoord = this.isVertical ? e.clientY : e.clientX;
      startCols = this.columns;
      try { dragHandle.setPointerCapture(e.pointerId); } catch {}
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const currentCoord = this.isVertical ? e.clientY : e.clientX;
      const deltaPx = currentCoord - startCoord;
      const pitch = this.getCharacterPitch();
      const step = this.isVertical ? pitch.height : pitch.width;
      const deltaCols = Math.round(deltaPx / step);
      const newCols = this.clampColumns(startCols + deltaCols);
      if (newCols !== this.columns) {
        this.setColumns(newCols);
        this.onColumnsChange?.(newCols);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (isDragging) {
        isDragging = false;
        try { dragHandle.releasePointerCapture(e.pointerId); } catch {}
      }
    };

    dragHandle.addEventListener('pointerdown', onPointerDown);
    dragHandle.addEventListener('pointermove', onPointerMove);
    dragHandle.addEventListener('pointerup', onPointerUp);
    dragHandle.addEventListener('pointercancel', onPointerUp);

    root.appendChild(primaryLine);
    this.primaryLineEl = primaryLine;
    this.primaryBadgeEl = primaryBadge;

    // Hanging line (N+1 columns)
    const hangingLine = document.createElement('div');
    hangingLine.className = 'column-guideline-line hanging';
    const hangingBadge = document.createElement('span');
    hangingBadge.className = 'column-guideline-badge';
    hangingBadge.textContent = `ぶら下げ(+1)`;
    hangingLine.appendChild(hangingBadge);
    root.appendChild(hangingLine);
    this.hangingLineEl = hangingLine;
    this.hangingBadgeEl = hangingBadge;

    this.container.appendChild(root);
    this.rootEl = root;
  }

  /**
   * Measures or calculates character pitch in pixels with DOM measurement fallback.
   */
  public getCharacterPitch(): { width: number; height: number } {
    if (typeof document !== 'undefined' && this.container) {
      try {
        // 1. 実機エディタ内の実際の行 (.cm-line) が存在する場合、その実ピクセルから高さを算出
        const realLine = this.container.querySelector('.cm-line');
        if (realLine && realLine.textContent && realLine.textContent.length >= 10) {
          const range = document.createRange();
          range.selectNodeContents(realLine);
          const rects = range.getClientRects();
          if (rects.length > 0) {
            const firstRect = rects[0];
            const avgCharHeight = firstRect.height / realLine.textContent.length;
            if (avgCharHeight >= this.fontSize * 0.9 && avgCharHeight <= this.fontSize * 1.5) {
              return {
                width: Number((avgCharHeight * (1 + 0.03)).toFixed(2)),
                height: Number(avgCharHeight.toFixed(2)),
              };
            }
          }
        }

        const testSpan = document.createElement('span');
        testSpan.style.visibility = 'hidden';
        testSpan.style.position = 'absolute';
        testSpan.style.fontSize = `${this.fontSize}px`;
        testSpan.style.fontFamily = 'var(--font-serif, "Noto Serif JP", serif)';
        testSpan.textContent = '国';
        this.container.appendChild(testSpan);
        const rect = testSpan.getBoundingClientRect();
        testSpan.remove();
        if (rect.width > 0 && rect.height > 0) {
          const letterSpacingRatio = this.isVertical ? 0.05 : 0.03;
          return {
            width: Number((rect.width * (1 + 0.03)).toFixed(2)),
            height: Number((rect.height * (1 + letterSpacingRatio)).toFixed(2)),
          };
        }
      } catch {}
    }

    const letterSpacingRatio = this.isVertical ? 0.05 : 0.03;
    const baseWidth = Number((this.fontSize * (1 + 0.03)).toFixed(2));
    const baseHeight = Number((this.fontSize * (1 + letterSpacingRatio)).toFixed(2));
    return {
      width: baseWidth,
      height: baseHeight,
    };
  }

  /**
   * Calculates layout padding of the container.
   */
  private getContainerPadding(): { top: number; left: number; right: number; bottom: number } {
    if (typeof window === 'undefined' || !this.container) {
      return { top: 36, left: 48, right: 48, bottom: 40 };
    }
    try {
      const style = window.getComputedStyle(this.container);
      return {
        top: parseFloat(style.paddingTop) || (this.isVertical ? 36 : 40),
        left: parseFloat(style.paddingLeft) || 48,
        right: parseFloat(style.paddingRight) || 48,
        bottom: parseFloat(style.paddingBottom) || 40,
      };
    } catch {
      return { top: 36, left: 48, right: 48, bottom: 40 };
    }
  }

  /**
   * Re-calculates and applies guideline positions and ruler ticks.
   */
  public update(): void {
    if (!this.rootEl || !this.primaryLineEl || !this.hangingLineEl) return;

    // Update visibility and mode classes
    this.rootEl.classList.toggle('hidden', !this.visible);
    this.rootEl.classList.toggle('mode-vertical', this.isVertical);
    this.rootEl.classList.toggle('mode-horizontal', !this.isVertical);

    if (!this.visible) return;

    const pitch = this.getCharacterPitch();
    const pad = this.getContainerPadding();

    if (this.primaryBadgeEl) {
      this.primaryBadgeEl.textContent = `${this.columns}字`;
    }

    if (this.hangingLineEl) {
      this.hangingLineEl.style.display = this.allowHanging ? 'block' : 'none';
    }

    if (this.isVertical) {
      // In vertical-rl: 1 line flows top-to-bottom.
      // Guideline is a horizontal border at Y = paddingTop + (columns * pitch.height)
      const primaryY = pad.top + this.columns * pitch.height;
      const hangingY = pad.top + (this.columns + 1) * pitch.height;
      const parentWrapper = this.container.closest('.canvas-wrapper') || this.container.parentElement;
      const fullWidth = Math.max(
        this.container.scrollWidth,
        this.container.clientWidth,
        parentWrapper ? parentWrapper.scrollWidth : 0,
        parentWrapper ? parentWrapper.clientWidth : 0,
        10000
      );

      this.primaryLineEl.style.top = `${primaryY}px`;
      this.primaryLineEl.style.left = '0';
      this.primaryLineEl.style.right = 'auto';
      this.primaryLineEl.style.bottom = 'auto';
      this.primaryLineEl.style.width = `${fullWidth}px`;

      this.hangingLineEl.style.top = `${hangingY}px`;
      this.hangingLineEl.style.left = '0';
      this.hangingLineEl.style.right = 'auto';
      this.hangingLineEl.style.bottom = 'auto';
      this.hangingLineEl.style.width = `${fullWidth}px`;

      this.renderTicksVertical(pad.top, pitch.height);
    } else {
      // In horizontal: 1 line flows left-to-right.
      // Guideline is a vertical border at X = paddingLeft + (columns * pitch.width)
      const primaryX = pad.left + this.columns * pitch.width;
      const hangingX = pad.left + (this.columns + 1) * pitch.width;

      this.primaryLineEl.style.left = `${primaryX}px`;
      this.primaryLineEl.style.top = '0';
      this.primaryLineEl.style.bottom = '0';
      this.primaryLineEl.style.right = 'auto';
      this.primaryLineEl.style.height = 'auto';

      this.hangingLineEl.style.left = `${hangingX}px`;
      this.hangingLineEl.style.top = '0';
      this.hangingLineEl.style.bottom = '0';
      this.hangingLineEl.style.right = 'auto';
      this.hangingLineEl.style.height = 'auto';

      this.renderTicksHorizontal(pad.left, pitch.width);
    }
  }

  /**
   * Renders ruler tick marks for horizontal mode (every 10 characters).
   */
  private renderTicksHorizontal(offsetStart: number, step: number): void {
    if (!this.ticksContainerEl) return;
    if (!this.showTicks) {
      this.ticksContainerEl.innerHTML = '';
      return;
    }

    let ticksHtml = '';
    for (let c = 10; c < this.columns; c += 10) {
      const x = offsetStart + c * step;
      ticksHtml += `
        <div class="column-guideline-tick-mark tick-h" style="left: ${x}px;" title="${c}字目">
          <span class="tick-label">${c}</span>
        </div>
      `;
    }
    this.ticksContainerEl.innerHTML = ticksHtml;
  }

  /**
   * Renders ruler tick marks for vertical mode (every 10 characters).
   */
  private renderTicksVertical(offsetStart: number, step: number): void {
    if (!this.ticksContainerEl) return;
    if (!this.showTicks) {
      this.ticksContainerEl.innerHTML = '';
      return;
    }

    let ticksHtml = '';
    for (let c = 10; c < this.columns; c += 10) {
      const y = offsetStart + c * step;
      ticksHtml += `
        <div class="column-guideline-tick-mark tick-v" style="top: ${y}px;" title="${c}字目">
          <span class="tick-label">${c}</span>
        </div>
      `;
    }
    this.ticksContainerEl.innerHTML = ticksHtml;
  }

  // --- Public API ---

  public setColumns(columns: number): void {
    this.columns = this.clampColumns(columns);
    this.update();
  }

  public getColumns(): number {
    return this.columns;
  }

  public setAllowHanging(allow: boolean): void {
    this.allowHanging = allow;
    this.update();
  }

  public getAllowHanging(): boolean {
    return this.allowHanging;
  }

  public setVertical(isVertical: boolean): void {
    this.isVertical = isVertical;
    this.update();
  }

  public getIsVertical(): boolean {
    return this.isVertical;
  }

  public setFontSize(fontSize: number): void {
    this.fontSize = fontSize;
    this.update();
  }

  public getFontSize(): number {
    return this.fontSize;
  }

  public setVisible(visible: boolean): void {
    this.visible = visible;
    ColumnGuideline.saveVisibility(visible);
    this.update();
  }

  public isVisible(): boolean {
    return this.visible;
  }

  public setOverflow(isOverflow: boolean, isHanging: boolean = false): void {
    this.isOverflowState = isOverflow;
    this.isHangingState = isHanging;

    if (this.primaryLineEl) {
      this.primaryLineEl.classList.toggle('is-overflow', isOverflow && !isHanging);
      this.primaryLineEl.classList.toggle('is-hanging', isHanging);
    }
    if (this.primaryBadgeEl) {
      this.primaryBadgeEl.classList.toggle('is-overflow', isOverflow && !isHanging);
      this.primaryBadgeEl.classList.toggle('is-hanging', isHanging);
    }
    if (this.hangingLineEl) {
      this.hangingLineEl.classList.toggle('is-hanging-active', isHanging);
    }
  }

  public getIsOverflow(): boolean {
    return this.isOverflowState;
  }

  public getIsHanging(): boolean {
    return this.isHangingState;
  }

  public getRootElement(): HTMLElement | null {
    return this.rootEl;
  }

  public destroy(): void {
    if (this.rootEl) {
      this.rootEl.remove();
      this.rootEl = null;
    }
  }
}
