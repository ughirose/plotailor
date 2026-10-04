import { EditorView, ViewPlugin, ViewUpdate, DecorationSet, Decoration } from '@codemirror/view';
import { RangeSetBuilder, Facet } from '@codemirror/state';

export interface CompositionRange {
  from: number;
  to: number;
}

export type DecorationScanner = (
  view: EditorView,
  from: number,
  to: number,
  compositionRange: CompositionRange | null,
  builder: RangeSetBuilder<Decoration>
) => void;

export interface CompositionGuardConfig {
  debounceMs?: number;
  scanner?: DecorationScanner;
}

export const compositionGuardFacet = Facet.define<CompositionGuardConfig, Required<CompositionGuardConfig>>({
  combine(values) {
    const combined: Required<CompositionGuardConfig> = {
      debounceMs: 150,
      scanner: () => {},
    };
    for (const v of values) {
      if (v.debounceMs !== undefined) combined.debounceMs = v.debounceMs;
      if (v.scanner) combined.scanner = v.scanner;
    }
    return combined;
  },
});

/**
 * Checks if a given range overlaps with the active IME composition range.
 * Used to bypass decoration generation so that native IME nodes are never destroyed.
 */
export function isOverlappingComposition(
  from: number,
  to: number,
  comp: CompositionRange | null
): boolean {
  if (!comp) return false;
  // Overlaps if [from, to] intersects with [comp.from, comp.to]
  return Math.max(from, comp.from) < Math.min(to, comp.to) || (from === to && from >= comp.from && from <= comp.to);
}

/**
 * Checks if a line overlaps with the active IME composition range.
 */
export function isLineInComposition(
  lineFrom: number,
  lineTo: number,
  comp: CompositionRange | null
): boolean {
  if (!comp) return false;
  return lineFrom <= comp.to && lineTo >= comp.from;
}

/**
 * ViewPlugin implementing Japanese IME Composition Guard for CodeMirror 6.
 *
 * Adheres to specification:
 * - IDLE -> COMPOSING: freezes composition range, maintains raw text in composing line.
 * - COMPOSING -> DEBOUNCING: sets 150ms debounce timer on compositionend.
 * - DEBOUNCING -> IDLE: clears composition range and requests measure after 150ms stability window.
 */
export class CompositionGuardPluginClass {
  decorations: DecorationSet;
  isComposing = false;
  compositionRange: CompositionRange | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(public view: EditorView) {
    this.decorations = this.computeDecorations(view);
  }

  update(update: ViewUpdate) {
    const composingNow = update.view.composing;

    if (composingNow && !this.isComposing) {
      this.isComposing = true;
      if (this.debounceTimer !== null) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
      const mainSel = update.state.selection.main;
      this.compositionRange = { from: mainSel.from, to: mainSel.to };
    } else if (composingNow && this.isComposing) {
      // While composing, update composition range as selection expands/contracts
      const mainSel = update.state.selection.main;
      if (this.compositionRange) {
        this.compositionRange = {
          from: Math.min(this.compositionRange.from, mainSel.from),
          to: Math.max(this.compositionRange.to, mainSel.to),
        };
      } else {
        this.compositionRange = { from: mainSel.from, to: mainSel.to };
      }
    } else if (!composingNow && this.isComposing) {
      this.isComposing = false;
      if (this.debounceTimer !== null) {
        clearTimeout(this.debounceTimer);
      }

      const config = update.view.state.facet(compositionGuardFacet);
      const debounceDelay = config.debounceMs ?? 150;

      this.debounceTimer = setTimeout(() => {
        this.compositionRange = null;
        this.debounceTimer = null;
        update.view.requestMeasure();
        // Trigger a decoration update after debounce window
        this.decorations = this.computeDecorations(update.view);
        update.view.dispatch({});
      }, debounceDelay);
    }

    if (update.docChanged || update.viewportChanged || !this.isComposing) {
      this.decorations = this.computeDecorations(update.view);
    }
  }

  computeDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const comp = this.compositionRange;
    const config = view.state.facet(compositionGuardFacet);

    for (const { from: vFrom, to: vTo } of view.visibleRanges) {
      config.scanner(view, vFrom, vTo, comp, builder);
    }

    return builder.finish();
  }

  destroy() {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}

export const compositionGuardPlugin = ViewPlugin.fromClass(CompositionGuardPluginClass, {
  decorations: (v) => v.decorations,
});

export function createCompositionGuardExtension(config?: CompositionGuardConfig) {
  return [
    config ? compositionGuardFacet.of(config) : [],
    compositionGuardPlugin,
  ];
}
