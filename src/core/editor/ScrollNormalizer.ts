/**
 * ScrollNormalizer - Wheel and trackpad scroll event normalizer for vertical writing mode
 * 
 * In writing-mode: vertical-rl:
 * - Columns advance from right to left.
 * - Vertical wheel rotation (deltaY) represents column-stepping (horizontal scroll).
 * - This class translates vertical deltas into horizontal scrollLeft adjustments,
 *   preventing default vertical jitter and ensuring smooth column navigation.
 */

export interface ScrollNormalizationOptions {
  lineHeight?: number;
  pageHeight?: number;
  multiplier?: number;
  preventDefault?: boolean;
}

export class ScrollNormalizer {
  private lineHeight: number;
  private pageHeight: number;
  private multiplier: number;
  private preventDefault: boolean;
  private cleanupFn: (() => void) | null = null;

  constructor(options: ScrollNormalizationOptions = {}) {
    this.lineHeight = options.lineHeight ?? 24;
    this.pageHeight = options.pageHeight ?? 600;
    this.multiplier = options.multiplier ?? 1.0;
    this.preventDefault = options.preventDefault ?? true;
  }

  /**
   * Normalizes raw WheelEvent deltas to pixel deltas.
   */
  normalizeDeltas(event: { deltaX: number; deltaY: number; deltaMode?: number }): {
    pixelDeltaX: number;
    pixelDeltaY: number;
  } {
    let factor = 1;
    // deltaMode: 0 = pixels, 1 = lines, 2 = pages
    if (event.deltaMode === 1) {
      factor = this.lineHeight;
    } else if (event.deltaMode === 2) {
      factor = this.pageHeight;
    }

    return {
      pixelDeltaX: event.deltaX * factor * this.multiplier,
      pixelDeltaY: event.deltaY * factor * this.multiplier,
    };
  }

  /**
   * Computes the horizontal scroll delta to apply for vertical-rl mode.
   * Dominant deltaY is mapped to horizontal column movement (leftwards).
   */
  computeVerticalRlScroll(event: { deltaX: number; deltaY: number; deltaMode?: number }): number {
    const { pixelDeltaX, pixelDeltaY } = this.normalizeDeltas(event);

    // If deltaY is dominant (typical mouse wheel), convert to horizontal movement
    if (Math.abs(pixelDeltaY) >= Math.abs(pixelDeltaX)) {
      // In vertical-rl, forward wheel rotation (positive deltaY) moves to next lines on left
      return -pixelDeltaY;
    }

    // Direct trackpad horizontal gestures
    return -pixelDeltaX;
  }

  /**
   * Handles a wheel event on a scroll container in vertical-rl mode.
   */
  handleWheel(event: WheelEvent, container: { scrollLeft: number; scrollWidth: number; clientWidth: number }): number {
    const scrollDelta = this.computeVerticalRlScroll(event);

    if (this.preventDefault && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }

    container.scrollLeft += scrollDelta;
    return container.scrollLeft;
  }

  /**
   * Attaches wheel normalization listener to target DOM element.
   */
  attach(element: HTMLElement): () => void {
    const listener = (e: WheelEvent) => {
      this.handleWheel(e, element);
    };

    element.addEventListener('wheel', listener, { passive: false });
    this.cleanupFn = () => {
      element.removeEventListener('wheel', listener);
    };

    return this.cleanupFn;
  }

  /**
   * Detaches listener if attached.
   */
  detach(): void {
    if (this.cleanupFn) {
      this.cleanupFn();
      this.cleanupFn = null;
    }
  }
}
