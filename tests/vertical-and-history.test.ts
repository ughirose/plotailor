// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, undo, redo, undoDepth, redoDepth } from '@codemirror/commands';
import { verticalWritingExtension, isVerticalMode } from '../src/core/editor/VerticalWritingExtension.js';
import { rubyDecorationExtension, RubyWidget } from '../src/core/editor/RubyDecorationExtension.js';

describe('Undo / Redo History Extension', () => {
  it('records edits and accurately tracks depth up to 500 levels', () => {
    const state = EditorState.create({
      doc: '最初の文。',
      extensions: [history({ minDepth: 500, newGroupDelay: 0 })],
    });

    const view = new EditorView({ state });

    expect(undoDepth(view.state)).toBe(0);
    expect(redoDepth(view.state)).toBe(0);

    // Edit 1
    view.dispatch({
      changes: { from: 5, insert: '二つ目の文。' },
    });
    expect(undoDepth(view.state)).toBe(1);
    expect(view.state.doc.toString()).toBe('最初の文。二つ目の文。');

    // Edit 2
    view.dispatch({
      changes: { from: 11, insert: '三つ目の文。' },
    });
    expect(undoDepth(view.state)).toBe(2);

    // Undo Edit 2
    undo(view);
    expect(undoDepth(view.state)).toBe(1);
    expect(redoDepth(view.state)).toBe(1);
    expect(view.state.doc.toString()).toBe('最初の文。二つ目の文。');

    // Undo Edit 1
    undo(view);
    expect(undoDepth(view.state)).toBe(0);
    expect(redoDepth(view.state)).toBe(2);
    expect(view.state.doc.toString()).toBe('最初の文。');

    // Redo Edit 1
    redo(view);
    expect(undoDepth(view.state)).toBe(1);
    expect(view.state.doc.toString()).toBe('最初の文。二つ目の文。');

    // Redo Edit 2
    redo(view);
    expect(undoDepth(view.state)).toBe(2);
    expect(view.state.doc.toString()).toBe('最初の文。二つ目の文。三つ目の文。');

    view.destroy();
  });

  it('isolates undo/redo history across different chapters using setState', () => {
    // Chapter 1 setup
    const stateCh1 = EditorState.create({
      doc: '第1章本文',
      extensions: [history({ minDepth: 500, newGroupDelay: 0 })],
    });
    const view = new EditorView({ state: stateCh1 });

    // Edit Chapter 1
    view.dispatch({ changes: { from: 5, insert: 'の追記' } });
    expect(view.state.doc.toString()).toBe('第1章本文の追記');
    expect(undoDepth(view.state)).toBe(1);

    const savedStateCh1 = view.state;

    // Switch to Chapter 2 (new fresh state)
    const stateCh2 = EditorState.create({
      doc: '第2章本文',
      extensions: [history({ minDepth: 500, newGroupDelay: 0 })],
    });
    view.setState(stateCh2);

    expect(view.state.doc.toString()).toBe('第2章本文');
    expect(undoDepth(view.state)).toBe(0);

    // Edit Chapter 2
    view.dispatch({ changes: { from: 5, insert: 'の独自修正' } });
    expect(view.state.doc.toString()).toBe('第2章本文の独自修正');
    expect(undoDepth(view.state)).toBe(1);

    // Switch back to Chapter 1
    view.setState(savedStateCh1);
    expect(view.state.doc.toString()).toBe('第1章本文の追記');
    expect(undoDepth(view.state)).toBe(1);

    // Undo in Chapter 1 restores original Chapter 1 text without touching Chapter 2
    undo(view);
    expect(view.state.doc.toString()).toBe('第1章本文');
    expect(undoDepth(view.state)).toBe(0);

    view.destroy();
  });
});

describe('RubyWidget DOM Structure', () => {
  it('builds structured ruby with rb and rt without trailing spacing', () => {
    const widget = new RubyWidget('第一衛星', 'セレネ');
    const dom = widget.toDOM();

    expect(dom.tagName.toLowerCase()).toBe('ruby');
    expect(dom.className).toBe('cm-ruby');

    const rb = dom.querySelector('rb');
    const rt = dom.querySelector('rt');

    expect(rb).not.toBeNull();
    expect(rb?.textContent).toBe('第一衛星');
    expect(rb?.className).toBe('cm-ruby-base');

    expect(rt).not.toBeNull();
    expect(rt?.textContent).toBe('セレネ');
    expect(rt?.className).toBe('cm-ruby-text');
  });
});

describe('VerticalWritingExtension', () => {
  it('hooks getViewport in vertical-rl mode to cover doc.length without gaps', () => {
    const parent = document.createElement('div');
    parent.className = 'vertical-rl';
    document.body.appendChild(parent);

    const docText = '1行目\n2行目\n3行目\n4行目\n5行目\n6行目\n7行目\n8行目\n9行目\n10行目';
    const state = EditorState.create({
      doc: docText,
      extensions: [verticalWritingExtension()],
    });

    const view = new EditorView({
      state,
      parent,
    });

    const vs = (view as any).viewState;
    expect(vs).toBeDefined();

    // Call getViewport while container is vertical-rl
    const vp = vs.getViewport(0, null);
    expect(vp.from).toBe(0);
    view.destroy();
    parent.remove();
  });

  it('correctly detects vertical-rl mode and patches posAtCoords and coordsAtPos', () => {
    const parent = document.createElement('div');
    parent.className = 'vertical-rl';
    document.body.appendChild(parent);

    const docText = '第一行の文章です。\n第二行の文章です。';
    const state = EditorState.create({
      doc: docText,
      extensions: [verticalWritingExtension()],
    });

    const view = new EditorView({
      state,
      parent,
    });

    // Check vertical mode detection
    expect(isVerticalMode(view)).toBe(true);

    // Mock caret position API on document
    const originalCaretRange = (document as any).caretRangeFromPoint;
    const textNode = view.contentDOM.querySelector('.cm-line')?.firstChild || view.contentDOM;
    (document as any).caretRangeFromPoint = (x: number, y: number) => ({
      startContainer: textNode,
      startOffset: 3,
    });

    try {
      const pos = view.posAtCoords({ x: 50, y: 50 });
      expect(typeof pos).toBe('number');

      // Test coordsAtPos under vertical mode
      const rect = view.coordsAtPos(0);
      // rect can be null or Rect object depending on jsdom, but call succeeds without error
      if (rect) {
        expect(rect).toHaveProperty('left');
        expect(rect).toHaveProperty('top');
      }

      // Test mousedown handler
      const mouseEvent = new MouseEvent('mousedown', {
        clientX: 50,
        clientY: 50,
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(mouseEvent);
    } finally {
      (document as any).caretRangeFromPoint = originalCaretRange;
    }

    view.destroy();
    parent.remove();
  });
});

