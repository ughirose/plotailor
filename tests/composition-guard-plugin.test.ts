// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EditorState, RangeSetBuilder } from '@codemirror/state';
import { EditorView, Decoration } from '@codemirror/view';
import {
  compositionGuardPlugin,
  createCompositionGuardExtension,
  isOverlappingComposition,
  isLineInComposition,
  CompositionGuardPluginClass,
} from '../src/core/editor/compositionGuardPlugin.js';

describe('compositionGuardPlugin', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('correctly calculates overlap with active composition range', () => {
    const comp = { from: 10, to: 20 };

    expect(isOverlappingComposition(5, 9, comp)).toBe(false);
    expect(isOverlappingComposition(21, 30, comp)).toBe(false);
    expect(isOverlappingComposition(8, 12, comp)).toBe(true);
    expect(isOverlappingComposition(15, 18, comp)).toBe(true);
    expect(isOverlappingComposition(18, 25, comp)).toBe(true);
    expect(isOverlappingComposition(5, 25, comp)).toBe(true);
    expect(isOverlappingComposition(10, 10, comp)).toBe(true); // point inside
    expect(isOverlappingComposition(5, 5, comp)).toBe(false);  // point outside
  });

  it('correctly identifies whether a line intersects active composition', () => {
    const comp = { from: 15, to: 25 };

    expect(isLineInComposition(0, 10, comp)).toBe(false);
    expect(isLineInComposition(10, 30, comp)).toBe(true);
    expect(isLineInComposition(30, 40, comp)).toBe(false);
  });

  it('manages composition lifecycle with 150ms debounce window', () => {
    let scannedRanges: { from: number; to: number; comp: any }[] = [];

    const ext = createCompositionGuardExtension({
      debounceMs: 150,
      scanner: (_view, from, to, comp, builder) => {
        scannedRanges.push({ from, to, comp });
        if (!comp || !isOverlappingComposition(from, to, comp)) {
          builder.add(from, from + 1, Decoration.mark({ class: 'test-mark' }));
        }
      },
    });

    const view = new EditorView({
      state: EditorState.create({
        doc: '吾輩は猫である。名前はまだ無い。',
        extensions: [ext],
      }),
    });

    const plugin = view.plugin(compositionGuardPlugin);
    expect(plugin).toBeDefined();
    expect(plugin!.isComposing).toBe(false);
    expect(plugin!.compositionRange).toBeNull();

    let mockComposing = false;
    Object.defineProperty(view, 'composing', {
      get: () => mockComposing,
      configurable: true,
    });

    // 1. Start composition
    mockComposing = true;
    view.dispatch({
      selection: { anchor: 4, head: 6 },
    });

    expect(plugin!.isComposing).toBe(true);
    expect(plugin!.compositionRange).toEqual({ from: 4, to: 6 });

    // 2. End composition -> enters 150ms debounce state
    mockComposing = false;
    view.dispatch({
      selection: { anchor: 6, head: 6 },
    });

    expect(plugin!.isComposing).toBe(false);
    // Range is preserved during the 150ms stabilization window
    expect(plugin!.compositionRange).toEqual({ from: 4, to: 6 });

    // 3. Advance timer by 100ms: still in debounce
    vi.advanceTimersByTime(100);
    expect(plugin!.compositionRange).toEqual({ from: 4, to: 6 });

    // 4. Advance timer by another 50ms (total 150ms): range cleared
    vi.advanceTimersByTime(50);
    expect(plugin!.compositionRange).toBeNull();

    view.destroy();
  });
});
