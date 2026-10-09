import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import {
  StateField,
  StateEffect,
  type Extension,
  Range,
} from '@codemirror/state';
import {
  NarrativeWorkerBridge,
} from './NarrativeWorkerBridge.js';
import type {
  NarrativeAnalysisResult,
  SyntacticLinterItem,
  ZeroPronounItem,
} from './NarrativeLinterEngine.js';

/**
 * StateEffect to update narrative and syntactic decorations in CodeMirror 6.
 */
export const setNarrativeDecorations = StateEffect.define<DecorationSet>();

/**
 * StateEffect to update full analysis result payload.
 */
export const setNarrativeAnalysisResult = StateEffect.define<NarrativeAnalysisResult>();

/**
 * Decoration Marks adhering strictly to specification:
 * - cm-lint-warning: wavy underline for double negation, particle repetition, consecutive passive, etc.
 * - cm-pronoun-missing: wavy underline for omitted subject / zero pronoun.
 */
export const lintWarningMark = Decoration.mark({
  class: 'cm-lint-warning',
  inclusive: false,
  attributes: { title: '推敲・構文警告' },
});

export const pronounMissingMark = Decoration.mark({
  class: 'cm-pronoun-missing',
  inclusive: false,
  attributes: { title: '主語抜け（ゼロ代名詞）検知' },
});

export const lintMultipleMark = Decoration.mark({
  class: 'cm-lint-multiple',
  inclusive: false,
  attributes: { title: '複数の推敲指摘が重複しています' },
});

export const povWarningMark = Decoration.mark({
  class: 'cm-pov-warning',
  inclusive: false,
  attributes: { title: '内面描写・認識POV検知' },
});

export const entitySpanMark = Decoration.mark({
  class: 'cm-entity-span',
  inclusive: false,
  attributes: { title: '固有表現・エンティティ' },
});


const EMPTY_RESULT: NarrativeAnalysisResult = {
  syntacticItems: [],
  zeroPronounItems: [],
  syntacticScore: 100,
  totalWarnings: 0,
};

/**
 * StateField storing current narrative analysis result.
 */
export const narrativeAnalysisField = StateField.define<NarrativeAnalysisResult>({
  create() {
    return EMPTY_RESULT;
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setNarrativeAnalysisResult)) {
        return effect.value;
      }
    }
    return value;
  },
});

/**
 * StateField managing wavy underline decoration set.
 */
export const narrativeDecorationField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    // Map existing decorations across document changes
    decorations = decorations.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setNarrativeDecorations)) {
        decorations = effect.value;
      }
    }
    return decorations;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export interface NarrativeExtensionOptions {
  workerBridge?: NarrativeWorkerBridge;
  onAnalysisResult?: (result: NarrativeAnalysisResult) => void;
  debounceMs?: number;
}

/**
 * ViewPlugin handling debounced sliding-window analysis on typing.
 */
class NarrativeViewPlugin {
  private workerBridge: NarrativeWorkerBridge;
  private onAnalysisResult?: (result: NarrativeAnalysisResult) => void;
  private pendingResult: { decorationSet: DecorationSet; result: NarrativeAnalysisResult } | null = null;

  constructor(private view: EditorView, options?: NarrativeExtensionOptions) {
    this.workerBridge = options?.workerBridge ?? new NarrativeWorkerBridge({ debounceMs: options?.debounceMs ?? 80 });
    this.onAnalysisResult = options?.onAnalysisResult;

    // Trigger initial analysis after view constructor finishes
    queueMicrotask(() => {
      this.runAnalysis(true);
    });
  }

  update(update: ViewUpdate) {
    if (this.pendingResult && !this.view.composing) {
      const { decorationSet, result } = this.pendingResult;
      this.pendingResult = null;
      this.view.dispatch({
        effects: [
          setNarrativeDecorations.of(decorationSet),
          setNarrativeAnalysisResult.of(result),
        ],
      });
      if (this.onAnalysisResult) {
        this.onAnalysisResult(result);
      }
    }

    if (update.docChanged) {
      // Check if user is currently composing with Japanese IME
      const isComposing = this.view.composing;
      if (!isComposing) {
        const isHistoryAction = update.transactions.some(
          (tr) => tr.isUserEvent('undo') || tr.isUserEvent('redo')
        );
        this.runAnalysis(isHistoryAction);
      }
    }
  }

  /**
   * Runs debounced sliding window analysis and dispatches decorations to CodeMirror 6.
   */
  public async runAnalysis(immediate: boolean = false): Promise<void> {
    const docText = this.view.state.doc.toString();
    const cursorPos = this.view.state.selection.main.head;
    const isComposing = this.view.composing;

    let result: NarrativeAnalysisResult;
    if (immediate) {
      result = this.workerBridge.analyzeImmediate(docText);
    } else {
      result = await this.workerBridge.analyzeDebounced(docText, cursorPos, isComposing);
    }

    if (!result) return;

    // Build DecorationSet with cm-lint-warning, cm-pronoun-missing, and cm-lint-multiple
    const docLength = this.view.state.doc.length;

    // Collect all raw diagnostic spans
    const allSpans: Array<{ from: number; to: number; type: 'syntactic' | 'zp' | 'pov' | 'entity' }> = [];
    for (const item of result.syntacticItems) {
      const from = Math.max(0, Math.min(item.from, docLength));
      const to = Math.max(from, Math.min(item.to, docLength));
      if (from < to) allSpans.push({ from, to, type: 'syntactic' });
    }
    for (const item of result.zeroPronounItems) {
      const from = Math.max(0, Math.min(item.from, docLength));
      const to = Math.max(from, Math.min(item.to, docLength));
      if (from < to) allSpans.push({ from, to, type: 'zp' });
    }
    if (result.povItems) {
      for (const item of result.povItems) {
        const from = Math.max(0, Math.min(item.from, docLength));
        const to = Math.max(from, Math.min(item.to, docLength));
        if (from < to) allSpans.push({ from, to, type: 'pov' });
      }
    }
    if (result.entitySpanItems) {
      for (const item of result.entitySpanItems) {
        const from = Math.max(0, Math.min(item.from, docLength));
        const to = Math.max(from, Math.min(item.to, docLength));
        if (from < to) allSpans.push({ from, to, type: 'entity' });
      }
    }

    const ranges: Range<Decoration>[] = [];
    for (let i = 0; i < allSpans.length; i++) {
      const span = allSpans[i];
      // Check if this span overlaps with any other span
      const hasOverlap = allSpans.some(
        (other, idx) => idx !== i && Math.max(span.from, other.from) < Math.min(span.to, other.to)
      );

      if (hasOverlap) {
        ranges.push(lintMultipleMark.range(span.from, span.to));
      } else if (span.type === 'syntactic') {
        ranges.push(lintWarningMark.range(span.from, span.to));
      } else if (span.type === 'zp') {
        ranges.push(pronounMissingMark.range(span.from, span.to));
      } else if (span.type === 'pov') {
        ranges.push(povWarningMark.range(span.from, span.to));
      } else {
        ranges.push(entitySpanMark.range(span.from, span.to));
      }
    }


    // Sort ranges ascending by `from` offset as required by CodeMirror Decoration.set
    ranges.sort((a, b) => a.from - b.from || a.to - b.to);

    const decorationSet = Decoration.set(ranges, true);

    // Dispatch update to CodeMirror state asynchronously to avoid in-progress update errors
    queueMicrotask(() => {
      if ((this.view as any).isDestroyed) return;

      if (this.view.composing) {
        // Do NOT dispatch transactions during IME composition; postpone to prevent IME resetting
        this.pendingResult = { decorationSet, result };
        return;
      }
      this.view.dispatch({
        effects: [
          setNarrativeDecorations.of(decorationSet),
          setNarrativeAnalysisResult.of(result),
        ],
      });

      // Notify external listeners (e.g., Right Pane Narrative Inspector Dock)
      if (this.onAnalysisResult) {
        this.onAnalysisResult(result);
      }
    });
  }
}

/**
 * CodeMirror 6 Narrative & Syntactic Linter Extension entry point.
 */
export function narrativeLinterExtension(options?: NarrativeExtensionOptions): Extension {
  return [
    narrativeAnalysisField,
    narrativeDecorationField,
    ViewPlugin.define((view) => new NarrativeViewPlugin(view, options)),
  ];
}
