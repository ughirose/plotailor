import {
  EditorState,
  StateField,
  StateEffect,
  Transaction,
  Annotation,
  Extension,
  Facet,
} from '@codemirror/state';
import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';

/**
 * Composition status lifecycle stages:
 * - IDLE: Standard input state.
 * - COMPOSING: IME composition session is active (compositionstart / compositionupdate).
 * - COMMITTING: IME composition session just completed (compositionend).
 */
export type CompositionStatus = 'IDLE' | 'COMPOSING' | 'COMMITTING';

export interface CompositionRange {
  from: number;
  to: number;
}

export interface CompositionStateValue {
  status: CompositionStatus;
  isComposing: boolean;
  text: string | null;
  range: CompositionRange | null;
}

/**
 * Annotation to flag heavy background processing transactions
 * (AST analysis, Linter updates, Worker dispatches, etc.).
 */
export const heavyTaskAnnotation = Annotation.define<boolean>();

/**
 * StateEffect to update composition status.
 */
export const setCompositionStatus = StateEffect.define<{
  status: CompositionStatus;
  text?: string | null;
  range?: CompositionRange | null;
}>();

const INITIAL_COMPOSITION_STATE: CompositionStateValue = {
  status: 'IDLE',
  isComposing: false,
  text: null,
  range: null,
};

/**
 * StateField tracking current IME composition state.
 */
export const compositionStateField = StateField.define<CompositionStateValue>({
  create() {
    return INITIAL_COMPOSITION_STATE;
  },
  update(value, tr: Transaction) {
    for (const effect of tr.effects) {
      if (effect.is(setCompositionStatus)) {
        const { status, text = null, range = null } = effect.value;
        return {
          status,
          isComposing: status === 'COMPOSING',
          text: text ?? value.text,
          range: range ?? value.range,
        };
      }
    }
    return value;
  },
});

/**
 * Helper to check if editor state is currently in IME composition.
 */
export function isComposing(state: EditorState): boolean {
  const comp = state.field(compositionStateField, false);
  return comp ? comp.isComposing : false;
}

/**
 * Helper to retrieve composition state value from EditorState.
 */
export function getCompositionState(state: EditorState): CompositionStateValue {
  return state.field(compositionStateField, false) ?? INITIAL_COMPOSITION_STATE;
}

/**
 * Represents the state difference captured after IME composition completion.
 */
export interface ImeStateDelta {
  startDoc: string;
  endDoc: string;
  textChanged: boolean;
  from: number;
  to: number;
  insertedText: string;
  timeStamp: number;
}

export interface ImeGuardOptions {
  /**
   * Debounce delay in milliseconds after compositionend before emitting state delta.
   * Default: 50ms.
   */
  debounceMs?: number;

  /**
   * Callback invoked once after compositionend with delayed state delta.
   */
  onStateDelta?: (delta: ImeStateDelta, view: EditorView) => void;

  /**
   * Custom predicate to determine if a transaction is a heavy task that must be blocked during composition.
   */
  isHeavyTransaction?: (tr: Transaction) => boolean;
}

/**
 * Facet for IME Guard options.
 */
const imeGuardOptionsFacet = Facet.define<ImeGuardOptions, Required<ImeGuardOptions>>({
  combine(optionsList) {
    const combined: Required<ImeGuardOptions> = {
      debounceMs: 50,
      onStateDelta: () => {},
      isHeavyTransaction: (tr: Transaction) => tr.annotation(heavyTaskAnnotation) === true,
    };
    for (const opt of optionsList) {
      if (opt.debounceMs !== undefined) combined.debounceMs = opt.debounceMs;
      if (opt.onStateDelta) combined.onStateDelta = opt.onStateDelta;
      if (opt.isHeavyTransaction) {
        const customPred = opt.isHeavyTransaction;
        const prevPred = combined.isHeavyTransaction;
        combined.isHeavyTransaction = (tr) =>
          tr.annotation(heavyTaskAnnotation) === true || customPred(tr) || prevPred(tr);
      }
    }
    return combined;
  },
});

/**
 * Default debounce delay for post-composition state delta emission (50ms).
 */
export const DEFAULT_IME_DEBOUNCE_MS = 50;

/**
 * ViewPlugin scheduler managing delayed debounce state delta dispatch after composition completion.
 */
export const imeSchedulerPlugin = ViewPlugin.fromClass(
  class {
    private timer: ReturnType<typeof setTimeout> | null = null;
    private startDoc: string | null = null;
    private startSelFrom = 0;

    constructor(public view: EditorView) {}

    update(update: ViewUpdate) {
      const prevComp = update.startState.field(compositionStateField, false);
      const currComp = update.state.field(compositionStateField, false);

      const wasComposing = prevComp ? prevComp.isComposing : false;
      const isNowComposing = currComp ? currComp.isComposing : false;

      // Composition Started
      if (!wasComposing && isNowComposing) {
        if (this.timer !== null) {
          clearTimeout(this.timer);
          this.timer = null;
        }
        this.startDoc = update.startState.doc.toString();
        this.startSelFrom = update.startState.selection.main.head;
      }

      // Composition Ended (COMPOSING -> COMMITTING / IDLE)
      if (wasComposing && !isNowComposing) {
        this.scheduleStateDelta(update.view);
      }
    }

    scheduleStateDelta(view: EditorView) {
      if (this.timer !== null) {
        clearTimeout(this.timer);
      }

      const options = view.state.facet(imeGuardOptionsFacet);
      const debounceMs = options.debounceMs ?? DEFAULT_IME_DEBOUNCE_MS;

      this.timer = setTimeout(() => {
        this.timer = null;
        this.emitDelta(view);
      }, debounceMs);
    }

    emitDelta(view: EditorView) {
      const options = view.state.facet(imeGuardOptionsFacet);
      const endDoc = view.state.doc.toString();
      const startDoc = this.startDoc ?? endDoc;

      const textChanged = startDoc !== endDoc;
      const from = this.startSelFrom;
      const to = Math.min(from + Math.max(0, startDoc.length - from), startDoc.length);
      const insertedLen = Math.max(0, endDoc.length - (startDoc.length - (to - from)));
      const insertedText = endDoc.slice(from, from + insertedLen);

      const delta: ImeStateDelta = {
        startDoc,
        endDoc,
        textChanged,
        from,
        to,
        insertedText,
        timeStamp: Date.now(),
      };

      this.startDoc = null;
      if (options.onStateDelta) {
        options.onStateDelta(delta, view);
      }
    }

    destroy() {
      if (this.timer !== null) {
        clearTimeout(this.timer);
        this.timer = null;
      }
    }
  }
);

/**
 * CodeMirror 6 Japanese IME Exclusive Control Guard (cm6ImeGuard) Extension.
 *
 * Provides:
 * 1. Full lifecycle monitoring (`compositionstart`, `compositionupdate`, `compositionend`, `blur`).
 * 2. `TransactionFilter` that suppresses heavy AST parsing / Linter / Worker async dispatches during IME composition.
 * 3. 50ms delayed debounce scheduler sending state deltas once after `compositionend`.
 */
export function cm6ImeGuard(options: ImeGuardOptions = {}): Extension {
  const optionsExtension = imeGuardOptionsFacet.of(options);

  // DOM event handlers for IME lifecycle and blur recovery
  const domHandlers = EditorView.domEventHandlers({
    compositionstart(event, view) {
      const sel = view.state.selection.main;
      view.dispatch({
        effects: setCompositionStatus.of({
          status: 'COMPOSING',
          text: event.data || '',
          range: { from: sel.from, to: sel.to },
        }),
      });
    },
    compositionupdate(event, view) {
      const sel = view.state.selection.main;
      view.dispatch({
        effects: setCompositionStatus.of({
          status: 'COMPOSING',
          text: event.data || '',
          range: { from: sel.from, to: sel.to },
        }),
      });
    },
    compositionend(event, view) {
      const sel = view.state.selection.main;
      view.dispatch({
        effects: setCompositionStatus.of({
          status: 'COMMITTING',
          text: event.data || '',
          range: { from: sel.from, to: sel.to },
        }),
      });
      // Immediately transition back to IDLE in next tick or effect
      view.dispatch({
        effects: setCompositionStatus.of({
          status: 'IDLE',
          text: null,
          range: null,
        }),
      });
    },
    blur(_event, view) {
      // Recovery: If focus is lost during composition, transition safely to IDLE
      if (isComposing(view.state)) {
        view.dispatch({
          effects: setCompositionStatus.of({
            status: 'IDLE',
            text: null,
            range: null,
          }),
        });
      }
    },
  });

  // TransactionFilter suppressing heavy background processing during IME composition
  const transactionFilter = EditorState.transactionFilter.of((tr: Transaction) => {
    const isCurrentlyComposing =
      tr.startState.field(compositionStateField, false)?.isComposing ||
      tr.state.field(compositionStateField, false)?.isComposing ||
      false;

    if (isCurrentlyComposing) {
      const opts = tr.startState.facet(imeGuardOptionsFacet);
      const isHeavy = opts.isHeavyTransaction(tr);

      if (isHeavy) {
        // Block/suppress heavy AST/Linter/Worker transaction during active composition
        return [];
      }
    }
    return tr;
  });

  return [
    compositionStateField,
    optionsExtension,
    domHandlers,
    transactionFilter,
    imeSchedulerPlugin,
  ];
}
