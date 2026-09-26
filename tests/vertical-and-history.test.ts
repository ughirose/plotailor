// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, undo, redo, undoDepth, redoDepth } from '@codemirror/commands';
import { verticalWritingExtension } from '../src/core/editor/VerticalWritingExtension.js';
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
    expect(vp.to).toBe(docText.length);

    view.destroy();
    parent.remove();
  });
});
