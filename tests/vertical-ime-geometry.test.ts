// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  verticalWritingExtension,
  isVerticalMode,
  verticalArrowNavigationKeymap,
} from '../src/core/editor/VerticalWritingExtension.js';
import {
  VerticalImeGeometryFollowerPlugin,
  verticalImeGeometryFollower,
} from '../src/core/editor/VerticalImeGeometryFollower.js';

describe('VerticalImeGeometryFollower & Vertical Direct Typing', () => {
  let parent: HTMLDivElement;

  beforeEach(() => {
    parent = document.createElement('div');
    parent.className = 'vertical-rl';
    document.body.appendChild(parent);
  });

  afterEach(() => {
    parent.remove();
  });

  it('instantiates anchor element when mounted inside vertical-rl container', () => {
    const docText = '王都の夜空には二つの月が冷たく輝いていた。';
    const state = EditorState.create({
      doc: docText,
      extensions: [verticalWritingExtension()],
    });

    const view = new EditorView({
      state,
      parent,
    });

    const anchorEl = view.dom.querySelector('.cm-vertical-ime-anchor');
    expect(anchorEl).not.toBeNull();
    expect(anchorEl?.getAttribute('aria-hidden')).toBe('true');

    view.destroy();
  });

  it('updates anchor position when selection moves in vertical mode', () => {
    const docText = '第一行の文字列。\n第二行の文字列。';
    const state = EditorState.create({
      doc: docText,
      extensions: [verticalWritingExtension()],
    });

    const view = new EditorView({
      state,
      parent,
    });

    // Dispatch selection change to offset 5
    view.dispatch({
      selection: { anchor: 5, head: 5 },
    });

    const anchorEl = view.dom.querySelector('.cm-vertical-ime-anchor') as HTMLElement;
    expect(anchorEl).not.toBeNull();
    expect(anchorEl.style.display).toBe('block');

    view.destroy();
  });

  it('supports debug overlay option in VerticalImeGeometryFollower', () => {
    const state = EditorState.create({
      doc: 'テスト原稿',
      extensions: [
        verticalWritingExtension(),
        verticalImeGeometryFollower({ debugOverlay: true }),
      ],
    });

    const view = new EditorView({
      state,
      parent,
    });

    const debugMarker = view.dom.querySelector('.cm-vertical-ime-debug-marker') as HTMLElement;
    expect(debugMarker).not.toBeNull();
    expect(debugMarker.style.backgroundColor).toContain('239'); // rgba(239, 68, 68, ...)

    view.destroy();
  });

  it('handles Home and End keys in vertical writing mode', () => {
    const docText = '吾輩は猫である。\n名前はまだ無い。';
    const state = EditorState.create({
      doc: docText,
      extensions: [verticalWritingExtension()],
    });

    const view = new EditorView({
      state,
      parent,
    });

    // Put cursor at char 4 in line 0
    view.dispatch({ selection: { anchor: 4, head: 4 } });
    expect(view.state.selection.main.head).toBe(4);

    // Press Home -> moves to line 0 start (0)
    const homeKeyBinding = (verticalArrowNavigationKeymap as any)[0];
    // Dispatch Home event
    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true })
    );

    // End key move to line 0 end (8)
    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true })
    );

    view.destroy();
  });

  it('supports Shift + Arrow range selection in vertical mode', () => {
    const docText = 'あいうえお\nかきくけこ';
    const state = EditorState.create({
      doc: docText,
      extensions: [verticalWritingExtension()],
    });

    const view = new EditorView({
      state,
      parent,
    });

    view.dispatch({ selection: { anchor: 2, head: 2 } });

    // Press Shift + ArrowDown (extend selection downward)
    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      })
    );

    // Check that anchor remains or head moves
    expect(view.state.selection.main.anchor).toBe(2);
    expect(view.state.selection.main.head).toBe(3);

    // Press Shift + ArrowUp (shrink back)
    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowUp',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      })
    );
    expect(view.state.selection.main.anchor).toBe(2);
    expect(view.state.selection.main.head).toBe(2);

    view.destroy();
  });
});
