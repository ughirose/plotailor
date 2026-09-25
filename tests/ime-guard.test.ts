// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EditorState, Annotation } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  cm6ImeGuard,
  setCompositionStatus,
  compositionStateField,
  isComposing,
  getCompositionState,
  heavyTaskAnnotation,
  ImeStateDelta,
} from '../src/core/editor/cm6ImeGuard.js';

describe('cm6ImeGuard (Japanese IME Exclusive Control Guard)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function dispatchCompositionEvent(view: EditorView, type: string, data = '') {
    const event = new CompositionEvent(type, { data, bubbles: true, cancelable: true });
    view.contentDOM.dispatchEvent(event);
  }

  function dispatchBlurEvent(view: EditorView) {
    const event = new FocusEvent('blur', { bubbles: true, cancelable: true });
    view.contentDOM.dispatchEvent(event);
  }

  it('should track full composition lifecycle (start, update, end, blur)', () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: '初期テキスト',
        extensions: [cm6ImeGuard()],
      }),
    });

    // 1. Initial state check
    expect(isComposing(view.state)).toBe(false);
    expect(getCompositionState(view.state).status).toBe('IDLE');

    // 2. compositionstart event
    dispatchCompositionEvent(view, 'compositionstart', 'にほんご');
    expect(isComposing(view.state)).toBe(true);
    expect(getCompositionState(view.state).status).toBe('COMPOSING');
    expect(getCompositionState(view.state).text).toBe('にほんご');

    // 3. compositionupdate event
    dispatchCompositionEvent(view, 'compositionupdate', '日本語');
    expect(isComposing(view.state)).toBe(true);
    expect(getCompositionState(view.state).text).toBe('日本語');

    // 4. compositionend event
    dispatchCompositionEvent(view, 'compositionend', '日本語');
    expect(isComposing(view.state)).toBe(false);
    expect(getCompositionState(view.state).status).toBe('IDLE');

    // 5. blur recovery test
    view.dispatch({
      effects: setCompositionStatus.of({ status: 'COMPOSING', text: '未確定' }),
    });
    expect(isComposing(view.state)).toBe(true);

    dispatchBlurEvent(view);
    expect(isComposing(view.state)).toBe(false);
    expect(getCompositionState(view.state).status).toBe('IDLE');

    view.destroy();
  });

  it('should suppress heavy AST/Linter/Worker transactions during IME composition', () => {
    const customLinterAnnotation = Annotation.define<boolean>();

    const view = new EditorView({
      state: EditorState.create({
        doc: 'Hello World',
        extensions: [
          cm6ImeGuard({
            isHeavyTransaction: (tr) => tr.annotation(customLinterAnnotation) === true,
          }),
        ],
      }),
    });

    // When IDLE: heavy transactions should pass
    view.dispatch({
      changes: { from: 0, insert: '[Linter] ' },
      annotations: [heavyTaskAnnotation.of(true)],
    });
    expect(view.state.doc.toString()).toBe('[Linter] Hello World');

    // Switch to COMPOSING
    view.dispatch({
      effects: setCompositionStatus.of({ status: 'COMPOSING', text: 'かんじ' }),
    });
    expect(isComposing(view.state)).toBe(true);

    // During COMPOSING: heavy transaction with heavyTaskAnnotation should be blocked
    const compDocBefore = view.state.doc.toString();
    view.dispatch({
      changes: { from: 0, insert: '[HeavyAST] ' },
      annotations: [heavyTaskAnnotation.of(true)],
    });
    // Document should NOT have changed because transaction was blocked
    expect(view.state.doc.toString()).toBe(compDocBefore);

    // During COMPOSING: custom heavy transaction should also be blocked
    view.dispatch({
      changes: { from: 0, insert: '[CustomLinter] ' },
      annotations: [customLinterAnnotation.of(true)],
    });
    expect(view.state.doc.toString()).toBe(compDocBefore);

    // During COMPOSING: standard typing changes should NOT be blocked
    view.dispatch({
      changes: { from: view.state.doc.length, insert: ' 漢字' },
    });
    expect(view.state.doc.toString()).toBe(compDocBefore + ' 漢字');

    // Transition back to IDLE
    view.dispatch({
      effects: setCompositionStatus.of({ status: 'IDLE' }),
    });
    expect(isComposing(view.state)).toBe(false);

    // After IDLE: heavy transactions work again
    view.dispatch({
      changes: { from: 0, insert: '[Linter] ' },
      annotations: [heavyTaskAnnotation.of(true)],
    });
    expect(view.state.doc.toString()).toContain('[Linter] ');

    view.destroy();
  });

  it('should emit state delta once after 50ms delayed debounce post compositionend', () => {
    const onStateDelta = vi.fn();

    const view = new EditorView({
      state: EditorState.create({
        doc: '吾輩は猫である。',
        extensions: [
          cm6ImeGuard({
            debounceMs: 50,
            onStateDelta,
          }),
        ],
      }),
    });

    // Move cursor to position 8
    view.dispatch({ selection: { anchor: 8 } });

    // 1. Start composition
    dispatchCompositionEvent(view, 'compositionstart', 'なまえは');
    expect(isComposing(view.state)).toBe(true);

    // 2. Type during composition
    view.dispatch({
      changes: { from: 8, insert: '名前はまだ無い。' },
      selection: { anchor: 16 },
    });

    // 3. End composition
    dispatchCompositionEvent(view, 'compositionend', '名前はまだ無い。');
    expect(isComposing(view.state)).toBe(false);

    // Immediately after compositionend (0ms): callback should NOT have been called yet
    expect(onStateDelta).not.toHaveBeenCalled();

    // Advance 30ms (< 50ms): callback should still NOT have been called
    vi.advanceTimersByTime(30);
    expect(onStateDelta).not.toHaveBeenCalled();

    // Advance another 25ms (total 55ms > 50ms): callback SHOULD be called exactly once
    vi.advanceTimersByTime(25);
    expect(onStateDelta).toHaveBeenCalledTimes(1);

    const delta: ImeStateDelta = onStateDelta.mock.calls[0][0];
    expect(delta.startDoc).toBe('吾輩は猫である。');
    expect(delta.endDoc).toBe('吾輩は猫である。名前はまだ無い。');
    expect(delta.textChanged).toBe(true);
    expect(delta.from).toBe(8);
    expect(delta.insertedText).toBe('名前はまだ無い。');

    // Advance more time: callback should not be called again
    vi.advanceTimersByTime(100);
    expect(onStateDelta).toHaveBeenCalledTimes(1);

    view.destroy();
  });

  it('should reset debounce timer if a new composition starts within 50ms', () => {
    const onStateDelta = vi.fn();

    const view = new EditorView({
      state: EditorState.create({
        doc: 'Initial',
        extensions: [
          cm6ImeGuard({
            debounceMs: 50,
            onStateDelta,
          }),
        ],
      }),
    });

    view.dispatch({ selection: { anchor: 7 } });

    // First composition session
    dispatchCompositionEvent(view, 'compositionstart', 'A');
    view.dispatch({ changes: { from: 7, insert: ' First' }, selection: { anchor: 13 } });
    dispatchCompositionEvent(view, 'compositionend', ' First');

    // Wait 30ms (timer is pending)
    vi.advanceTimersByTime(30);
    expect(onStateDelta).not.toHaveBeenCalled();

    // Second composition session starts before 50ms elapses
    dispatchCompositionEvent(view, 'compositionstart', 'B');
    view.dispatch({ changes: { from: 13, insert: ' Second' }, selection: { anchor: 20 } });

    // Advance 50ms from second start: first timer was cancelled
    vi.advanceTimersByTime(50);
    expect(onStateDelta).not.toHaveBeenCalled();

    // End second composition session
    dispatchCompositionEvent(view, 'compositionend', ' Second');

    // Advance 50ms after second composition ends
    vi.advanceTimersByTime(50);
    expect(onStateDelta).toHaveBeenCalledTimes(1);

    view.destroy();
  });
});
